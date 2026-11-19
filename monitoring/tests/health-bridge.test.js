import test from 'node:test';
import assert from 'node:assert/strict';
import { createHealthBridge } from '../../scripts/cau-noi-trang-thai-standby.mjs';

test('health bridge only exposes standby readiness and fails closed', async () => {
  let calls = 0;
  let result = { status: 'Healthy', database: 'Healthy', instance: 'standby', secret: 'must not be exposed' };
  const server = createHealthBridge(async (url) => {
    calls++;
    assert.equal(url, 'http://127.0.0.1:5000/health/ready');
    return { ok: true, json: async () => result };
  });
  const request = (method, url) => new Promise((resolve) => {
    let code;
    const response = {
      setHeader() {},
      writeHead(status) { code = status; },
      end(body) { resolve({ status: code, body: JSON.parse(body) }); },
    };
    server.emit('request', { method, url }, response);
  });
  const healthy = await request('GET', '/health/ready');
  assert.equal(healthy.status, 200);
  assert.deepEqual(healthy.body, { status: 'Healthy', database: 'Healthy', instance: 'standby' });
  assert.equal((await request('POST', '/health/ready')).status, 404);
  assert.equal((await request('GET', '/api/orders')).status, 404);
  assert.equal(calls, 1);
  result = { status: 'Healthy', database: 'Healthy', instance: 'primary' };
  const wrongInstance = await request('GET', '/health/ready');
  assert.equal(wrongInstance.status, 503);
  assert.equal(wrongInstance.body.instance, 'unknown');
});
