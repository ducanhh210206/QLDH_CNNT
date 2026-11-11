"""Isolated Gateway integration checks; no application database or live failover."""
import json
import os
from pathlib import Path
import secrets
import subprocess
import tempfile
import time
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parent.parent
SUFFIX = secrets.token_hex(5)
NETWORK = 'omdrs-gateway-test-' + SUFFIX
MOCK = NETWORK + '-mock'
GATEWAY = NETWORK + '-proxy'
IMAGE = os.environ.get('GATEWAY_TEST_IMAGE', 'omdrs-gateway-windows:local')

def docker(*args, check=True):
    return subprocess.run(['docker', *args], cwd=ROOT, text=True, capture_output=True, check=check).stdout.strip()

def port(name, container_port):
    details = json.loads(docker('inspect', name))[0]
    return details['NetworkSettings']['Ports'][str(container_port) + '/tcp'][0]['HostPort']

def request(base, path, method='GET', body=None, headers=None):
    req = urllib.request.Request(base + path, data=body, headers=headers or {}, method=method)
    try:
        with urllib.request.urlopen(req, timeout=8) as response:
            return response.status, response.read().decode()
    except urllib.error.HTTPError as error:
        return error.code, error.read().decode()

def await_ready(base, path):
    for _ in range(40):
        try:
            if request(base, path)[0] == 200:
                return
        except (OSError, urllib.error.URLError):
            pass
        time.sleep(0.25)
    raise AssertionError('Isolated service did not start: ' + base + path)

with tempfile.TemporaryDirectory(prefix='omdrs-gateway-test-') as directory:
    fixtures = Path(directory)
    for name in ['trusted', 'untrusted']:
        subprocess.run(['openssl', 'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1',
                        '-keyout', str(fixtures / (name + '.key')), '-out', str(fixtures / (name + '.crt')),
                        '-subj', '/CN=primary.test', '-addext', 'subjectAltName=DNS:primary.test'],
                       check=True, capture_output=True)
    (fixtures / 'server.cjs').write_text('''
const http=require('node:http'), https=require('node:https'), fs=require('node:fs');
let drops=0, standbyWrites=0;
function handler(instance) { return (req,res)=>{
 if(req.url==='/health/ready'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({status:'Healthy',database:'Healthy',instance}));return;}
 if(req.url==='/api/drop' && instance==='primary'){drops++;req.socket.destroy();return;}
 if(req.url==='/api/count'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({drops,standbyWrites}));return;}
 if(instance==='standby' && req.method==='POST')standbyWrites++;
 let body='';req.on('data',c=>body+=c);req.on('end',()=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify({instance,path:req.url,method:req.method,body,origin:req.headers.origin,cookie:req.headers.cookie,forwarded:req.headers['x-forwarded-proto'],host:req.headers.host}));});
};}
https.createServer({key:fs.readFileSync('/fixtures/trusted.key'),cert:fs.readFileSync('/fixtures/trusted.crt')},handler('primary')).listen(443,'0.0.0.0');
http.createServer(handler('standby')).listen(5000,'0.0.0.0');
''')
    try:
        docker('network', 'create', NETWORK)
        docker('run', '-d', '--name', MOCK, '--network', NETWORK, '--network-alias', 'primary.test',
               '-p', '127.0.0.1::5000', '-v', str(fixtures) + ':/fixtures:ro',
               'node:24-alpine', 'node', '/fixtures/server.cjs')
        standby_port = port(MOCK, 5000)
        mock_url = 'http://127.0.0.1:' + standby_port
        await_ready(mock_url, '/health/ready')

        def gateway(mode='primary', certificate='trusted'):
            docker('rm', '-f', GATEWAY, check=False)
            docker('run', '-d', '--name', GATEWAY, '--network', NETWORK, '-p', '127.0.0.1::80',
                   '-e', 'GATEWAY_PRIMARY_HOST=primary.test', '-e', 'GATEWAY_STANDBY_PORT=' + standby_port,
                   '-e', 'GATEWAY_ACTIVE_BACKEND=' + mode,
                   '-v', str(fixtures / (certificate + '.crt')) + ':/etc/ssl/certs/ca-certificates.crt:ro', IMAGE)
            url = 'http://127.0.0.1:' + port(GATEWAY, 80)
            await_ready(url, '/gateway/live')
            return url

        base = gateway()
        config = docker('exec', GATEWAY, 'nginx', '-T')
        assert '$remote_addr' in config and '$gateway_origin' in config, 'envsubst damaged Nginx variables'
        assert json.loads(request(base, '/health/ready')[1])['instance'] == 'primary'
        code, body = request(base, '/api/echo?order=test', 'POST', b'{"quantity":1}',
                             {'Origin':'https://gateway.example','Cookie':'omdrs=fixture','X-Forwarded-Proto':'https','Content-Type':'application/json'})
        echo = json.loads(body)
        assert code == 200 and echo['instance'] == 'primary'
        assert echo['path'] == '/api/echo?order=test' and echo['method'] == 'POST'
        assert echo['body'] == '{"quantity":1}' and echo['cookie'] == 'omdrs=fixture'
        assert echo['origin'] == 'https://gateway.example' and echo['forwarded'] == 'https'
        assert echo['host'] == 'primary.test'
        assert request(base, '/api/drop', 'POST', b'{}')[0] == 502
        counts = json.loads(request(mock_url, '/api/count')[1])
        assert counts == {'drops':1,'standbyWrites':0}, counts
        assert 'OMDRS' in request(base, '/')[1]
        base = gateway('standby')
        assert json.loads(request(base, '/health/ready')[1])['instance'] == 'standby'
        assert json.loads(request(base, '/gateway/live')[1])['selected'] == 'standby'
        base = gateway('primary', 'untrusted')
        assert request(base, '/health/ready')[0] == 502, 'Untrusted upstream certificate was accepted'
        print('PASS: Primary HTTPS, Standby routing, static frontend, Origin/cookie/body/query forwarding, no write retry, TLS verification.')
    finally:
        docker('rm', '-f', GATEWAY, MOCK, check=False)
        docker('network', 'rm', NETWORK, check=False)
