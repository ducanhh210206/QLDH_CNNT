import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createAutoGateway } from './auto-gateway.mjs';

async function listen(server) {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${server.address().port}`;
}
async function close(server) { await new Promise((resolve) => server.close(resolve)); }

test('routes only to a verified standby, does not replay writes and recovers primary', async (t) => {
  let primaryHealthy = true, standbyVerified = false, standbyUuid = 'different-database', standbyWrites = 0;
  const primary = http.createServer((req, res) => {
    if (req.url === '/health/ready') {
      res.writeHead(primaryHealthy ? 200 : 503, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ status: primaryHealthy ? 'Healthy' : 'Unhealthy', database: 'Healthy', instance: 'primary' }));
    }
    if (req.url === '/api/uncertain') return req.socket.destroy();
    res.end('primary');
  });
  const standby = http.createServer((req, res) => {
    if (req.url === '/health/ready') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ status: 'Healthy', database: 'Healthy', instance: 'standby', shared_database_verified: standbyVerified, verified_database_uuid: standbyUuid }));
    }
    if (req.method === 'POST') standbyWrites++;
    res.end('standby');
  });
  const p = await listen(primary), s = await listen(standby);
  const dir = await mkdtemp(join(tmpdir(), 'omdrs-gateway-'));
  await writeFile(join(dir, 'index.html'), '<h1>demo</h1>');
  const gateway = createAutoGateway({ primaryUrl: p, standbyUrl: s, staticDir: dir, expectedDbUuid: 'c4ee9c9b-d7fc-11f1-ac26-f2d5b3407bc1', failThreshold: 2, recoveryThreshold: 3 });
  const g = await listen(gateway.server);
  t.after(async () => { gateway.stop(); await close(gateway.server); await close(primary); await close(standby); await rm(dir, { recursive: true, force: true }); });

  await gateway.poll(); await gateway.poll(); await gateway.poll();
  assert.equal((await (await fetch(g + '/gateway/status')).json()).active, 'primary');
  assert.equal(await (await fetch(g + '/api/orders')).text(), 'primary');
  assert.equal((await fetch(g + '/api/uncertain', { method: 'POST', body: 'one' })).status, 502);
  assert.equal(standbyWrites, 0, 'A failed write must not be replayed');

  primaryHealthy = false;
  await gateway.poll(); await gateway.poll();
  assert.equal((await (await fetch(g + '/gateway/status')).json()).active, null);
  assert.equal((await fetch(g + '/api/orders')).status, 503);
  standbyVerified = true;
  await gateway.poll(); await gateway.poll();
  assert.equal(gateway.state.active, null, 'Standby on the wrong MySQL server must not be selected');
  standbyUuid = 'c4ee9c9b-d7fc-11f1-ac26-f2d5b3407bc1';
  await gateway.poll(); await gateway.poll();
  assert.equal((await (await fetch(g + '/gateway/status')).json()).active, 'standby');
  assert.equal(await (await fetch(g + '/api/orders', { method: 'POST', body: 'new request' })).text(), 'standby');
  assert.equal(standbyWrites, 1);

  primaryHealthy = true;
  await gateway.poll(); await gateway.poll();
  assert.equal(gateway.state.active, 'standby');
  await gateway.poll();
  assert.equal(gateway.state.active, 'primary');
  assert.match(await (await fetch(g + '/')).text(), /demo/);
});

test('remote standby requires HTTPS and private bridge credentials on health probes', async () => {
  const options = { primaryUrl: 'https://primary.example', standbyUrl: 'https://standby.example', staticDir: '.', expectedDbUuid: 'c4ee9c9b-d7fc-11f1-ac26-f2d5b3407bc1' };
  assert.throws(() => createAutoGateway(options));
  assert.throws(() => createAutoGateway({ ...options, standbyUrl: 'http://standby.example', standbyToken: 'a'.repeat(64) }));
  const calls = [];
  const gateway = createAutoGateway({ ...options, standbyToken: 'a'.repeat(64), fetchImpl: async (url, config) => {
    calls.push({ host: url.hostname, key: config.headers['x-omdrs-bridge-key'] });
    const standby = url.hostname === 'standby.example';
    return { ok: true, json: async () => ({ status: 'Healthy', database: 'Healthy', instance: standby ? 'standby' : 'primary', shared_database_verified: true, verified_database_uuid: options.expectedDbUuid }) };
  }});
  await gateway.poll();
  assert.equal(calls.find((x) => x.host === 'primary.example').key, undefined);
  assert.equal(calls.find((x) => x.host === 'standby.example').key, 'a'.repeat(64));
});
