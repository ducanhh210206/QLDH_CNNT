"""TC14: cut a private MySQL replication link in disposable Docker containers.

Uses two new synthetic MySQLs on an internal network, no published ports,
credentials or data from the application, and never modifies live resources.
"""
from __future__ import annotations
import json
import re
import secrets
import subprocess
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
IMAGE = 'mysql:8.4.13'
LABEL = 'omdrs-tc14-isolated'

def now(): return datetime.now(timezone.utc).isoformat(timespec='milliseconds')

def run(args, data=None, timeout=70, allowed=False):
    p = subprocess.run(args, input=data, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=timeout)
    if p.returncode and not allowed:
        match = re.search(rb'ERROR\s+\d+(?:\s+\([A-Z0-9]+\))?', p.stderr)
        raise RuntimeError(f'{args[0]} exit {p.returncode}; ' + (match.group().decode() if match else 'operation failed'))
    return p

def net_check(netid):
    n = json.loads(run(['docker','network','inspect',netid]).stdout)[0]
    if not n.get('Internal') or (n.get('Labels') or {}).get('org.omdrs.drill') != LABEL or not n['Name'].startswith('omdrs-tc14-'):
        raise RuntimeError('Network does not match isolated lab.')
    return n

def container_check(cid, netid=None, connected=None):
    c = json.loads(run(['docker','inspect',cid]).stdout)[0]
    if c['Id'] != cid or (c['Config'].get('Labels') or {}).get('org.omdrs.drill') != LABEL or \
       not c['Name'].lstrip('/').startswith('omdrs-tc14-') or c['HostConfig'].get('PortBindings'):
        raise RuntimeError('Container identity or ports do not match isolated lab.')
    networks = c['NetworkSettings']['Networks']
    if netid:
        actual = any(n.get('NetworkID') == netid for n in networks.values())
        if actual != connected or len(networks) != (1 if connected else 0):
            raise RuntimeError('Unexpected container network state.')
    return c

def mysql(cid, sql, allowed=False):
    return run(['docker','exec','-i',cid,'mysql','--no-defaults','--user=root',
                '--batch','--raw','--skip-column-names'], sql.encode(), allowed=allowed)

def start(name, alias, net, server_id):
    result = run(['docker','run','-d','--rm','--pull=never','--name',name,'--network',net,
                  '--network-alias',alias,'--label','org.omdrs.drill='+LABEL,
                  '-e','MYSQL_ALLOW_EMPTY_PASSWORD=yes',IMAGE, f'--server-id={server_id}',
                  '--log-bin=mysql-bin','--gtid-mode=ON','--enforce-gtid-consistency=ON',
                  '--default-time-zone=+00:00'])
    cid = result.stdout.decode().strip()
    container_check(cid,net,True)
    deadline = time.monotonic()+110
    while time.monotonic() < deadline:
        try:
            if mysql(cid,'SELECT @@GLOBAL.skip_networking;').stdout.strip() == b'0': return cid
        except (RuntimeError,subprocess.TimeoutExpired): pass
        time.sleep(1)
    container_check(cid)
    run(['docker','stop','--time','5',cid])
    raise RuntimeError('MySQL lab did not become ready')

def field(status, name):
    match=re.search(r'^\s*'+re.escape(name)+r':\s*(.*)$',status,re.MULTILINE)
    return match.group(1).strip() if match else None

def status(cid):
    text=run(['docker','exec','-i',cid,'mysql','--no-defaults','--user=root','--vertical'],b'SHOW REPLICA STATUS;').stdout.decode()
    return {name:field(text,name) for name in ('Replica_IO_Running','Replica_SQL_Running','Seconds_Behind_Source','Last_IO_Errno','Last_SQL_Errno')}

def wait(check, seconds, label):
    deadline=time.monotonic()+seconds
    while time.monotonic()<deadline:
        value=check()
        if value: return value
        time.sleep(1)
    raise RuntimeError(label+' timeout')

def main():
    run(['docker','image','inspect',IMAGE])
    suffix=uuid.uuid4().hex[:10]
    name='omdrs-tc14-net-'+suffix
    password=secrets.token_hex(16)
    net=None; primary=None; replica=None
    report={'started_utc':now(),'scope':'Two synthetic MySQL containers on internal Docker network; no application services or real data.',
            'gtid_auto_position':True, 'tls':'disabled for isolated lab only; production TLS not assessed'}
    out=ROOT/'docs/evidence'/('tc14_'+datetime.now().strftime('%Y%m%d_%H%M%S')+'_'+suffix)
    out.mkdir(parents=True,exist_ok=False)
    try:
        net=run(['docker','network','create','--internal','--label','org.omdrs.drill='+LABEL,name]).stdout.decode().strip()
        net_check(net)
        print('TC14: starting two MySQLs on an internal lab network...',flush=True)
        primary=start('omdrs-tc14-primary-'+suffix,'tc14-primary',net,461011)
        replica=start('omdrs-tc14-replica-'+suffix,'tc14-replica',net,461012)
        mysql(primary, "CREATE USER 'tc14_repl'@'%' IDENTIFIED BY '"+password+"'; GRANT REPLICATION SLAVE ON *.* TO 'tc14_repl'@'%'; CREATE DATABASE tc14_lab; CREATE TABLE tc14_lab.orders (id INT PRIMARY KEY, description VARCHAR(100) NOT NULL); INSERT INTO tc14_lab.orders VALUES(1,'before_network_failure');")
        mysql(replica, "SET GLOBAL replica_net_timeout=3; CHANGE REPLICATION SOURCE TO SOURCE_HOST='tc14-primary', SOURCE_PORT=3306, SOURCE_USER='tc14_repl', SOURCE_PASSWORD='"+password+"', SOURCE_AUTO_POSITION=1, GET_SOURCE_PUBLIC_KEY=1, SOURCE_SSL=0, SOURCE_CONNECT_RETRY=2; START REPLICA; SET GLOBAL super_read_only=ON;")
        def initial():
            s=status(replica)
            rows=mysql(replica,'SELECT COUNT(*) FROM tc14_lab.orders WHERE id=1;',allowed=True)
            return s if s['Replica_IO_Running']=='Yes' and s['Replica_SQL_Running']=='Yes' and rows.returncode==0 and rows.stdout.strip()==b'1' else None
        report['initial']=wait(initial,45,'Initial replication')
        print('TC14: replication active; disconnecting only the disposable replica...',flush=True)
        net_check(net); container_check(replica,net,True)
        report['network_disconnected_utc']=now()
        run(['docker','network','disconnect',net,replica])
        container_check(replica,net,False)
        mysql(primary,"INSERT INTO tc14_lab.orders VALUES(2,'during_network_failure');")
        def failed_receiver():
            s=status(replica)
            return s if s['Replica_IO_Running'] in ('Connecting','No') else None
        report['during']=wait(failed_receiver,40,'Replica failure detection')
        report['during']['read_only']=mysql(replica,'SELECT @@GLOBAL.read_only,@@GLOBAL.super_read_only;').stdout.decode().strip()
        report['during']['standby_has_new_order']=int(mysql(replica,'SELECT COUNT(*) FROM tc14_lab.orders WHERE id=2;').stdout.strip())
        write_attempt=mysql(replica,"INSERT INTO tc14_lab.orders VALUES(3,'unexpected_write');",allowed=True)
        report['during']['standby_write_rejected']=write_attempt.returncode != 0 and b'ERROR 1290' in write_attempt.stderr
        if report['during']['read_only']!='1\t1' or not report['during']['standby_write_rejected'] or report['during']['standby_has_new_order']!=0:
            raise RuntimeError('Read-only or isolation check failed')
        print('TC14: network loss observed; read-only standby rejected a write. Reconnecting lab...',flush=True)
        net_check(net); container_check(replica,net,False)
        run(['docker','network','connect','--alias','tc14-replica',net,replica])
        container_check(replica,net,True)
        def recovered():
            s=status(replica)
            present=mysql(replica,'SELECT COUNT(*) FROM tc14_lab.orders WHERE id=2;').stdout.strip()==b'1'
            return s if s['Replica_IO_Running']=='Yes' and s['Replica_SQL_Running']=='Yes' and present else None
        report['recovered']=wait(recovered,45,'Replication recovery')
        report['result']='PASS'
        report['completed_utc']=now()
        (out/'ket-qua.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
        (out/'ket-qua.md').write_text('\n'.join(['# TC14 — Mất mạng trong lab cô lập','',
          '- Hai MySQL dữ liệu giả chạy trên mạng Docker internal riêng, không xuất cổng; TLS tắt trong lab này.',
          '- Trước lỗi hai luồng replication đều Yes; sau khi chỉ ngắt mạng replica, luồng nhận chuyển '+str(report['during']['Replica_IO_Running'])+'.',
          '- Primary ghi một đơn giả khi mất mạng; Standby chưa nhận đơn, vẫn read_only=1 và super_read_only=1; lệnh ghi trên Standby bị từ chối.',
          '- Sau kết nối lại, hai luồng Yes và đơn giả xuất hiện ở Standby.',
          '- Đây là thử nghiệm lab MySQL, chưa kiểm thử Gateway/website hoặc chứng minh chống ghi kép trong mọi tình huống.',
          '- Bắt đầu: '+report['started_utc']+'; ngắt mạng: '+report['network_disconnected_utc']+'; hoàn tất: '+report['completed_utc'], '']),encoding='utf-8')
        print('TC14: PASS in isolated database lab. Evidence:',out/'ket-qua.md',flush=True)
    finally:
        for cid in (replica,primary):
            if cid:
                try: container_check(cid); run(['docker','stop','--time','5',cid],timeout=35)
                except Exception as e: print('Lab cleanup requires attention:',str(e),flush=True)
        if net:
            try: net_check(net); run(['docker','network','rm',net])
            except Exception as e: print('Lab network cleanup requires attention:',str(e),flush=True)

if __name__=='__main__':
    try: main()
    except (OSError,RuntimeError,ValueError,subprocess.TimeoutExpired) as e:
        print('TEST STOPPED:',str(e),flush=True); raise SystemExit(1)
