import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createStandbyBridge } from './standby-api-bridge.mjs';

async function listen(server) {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${server.address().port}`;
}
async function close(server) { await new Promise((resolve) => server.close(resolve)); }

test('bridge authorizes API calls and never forwards its secret to the backend', async (t) => {
  const token = 'a'.repeat(64);
  const backend = http.createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ path: req.url, bridgeKey: req.headers['x-omdrs-bridge-key'] || null, cookie: req.headers.cookie || null }));
  });
  const backendUrl = await listen(backend);
  const bridge = createStandbyBridge({ token, backendUrl });
  const url = await listen(bridge);
  t.after(async () => { await close(bridge); await close(backend); });
  assert.equal((await fetch(url + '/api/orders')).status, 401);
  assert.equal((await fetch(url + '/api/orders', { headers: { 'x-omdrs-bridge-key': 'b'.repeat(64) } })).status, 401);
  assert.equal((await fetch(url + '/private', { headers: { 'x-omdrs-bridge-key': token } })).status, 404);
  const response = await fetch(url + '/api/orders?limit=1', { headers: { 'x-omdrs-bridge-key': token, cookie: 'session=test' } });
  assert.deepEqual(await response.json(), { path: '/api/orders?limit=1', bridgeKey: null, cookie: 'session=test' });
  assert.equal((await fetch(url + '/health/ready', { headers: { 'x-omdrs-bridge-key': token } })).status, 200);
});

test('bridge refuses weak credentials and non-loopback backend', () => {
  assert.throws(() => createStandbyBridge({ token: 'short' }));
  assert.throws(() => createStandbyBridge({ token: 'a'.repeat(64), backendUrl: 'http://example.com' }));
});
