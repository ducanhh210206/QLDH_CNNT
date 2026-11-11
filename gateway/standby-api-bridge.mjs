import http from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const hopHeaders = new Set(['connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailer', 'transfer-encoding', 'upgrade']);

// The tunnel reaches only this authenticated bridge; MySQL remains local.
export function createStandbyBridge({ token, backendUrl = 'http://127.0.0.1:5000' }) {
  if (!/^[a-f0-9]{64}$/i.test(token || '')) throw new Error('Bridge token must be 64 hexadecimal characters.');
  const backend = new URL(backendUrl);
  if (backend.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(backend.hostname) || backend.username || backend.password || backend.pathname !== '/' || backend.search || backend.hash) throw new Error('Backend must be a loopback HTTP origin.');
  const expected = Buffer.from(token, 'utf8');
  return http.createServer((req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const keys = req.headersDistinct['x-omdrs-bridge-key'];
    const supplied = Buffer.from(keys?.length === 1 ? keys[0] : '', 'utf8');
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      return res.end('{"error":"Unauthorized"}');
    }
    if (!req.url?.startsWith('/') || req.url.startsWith('//') || req.url.includes('\\')) {
      res.writeHead(400); return res.end();
    }
    const path = new URL(req.url, 'http://localhost').pathname;
    if (!(path.startsWith('/api/') || path === '/health/ready' || path === '/health/live')) {
      res.writeHead(404); return res.end();
    }
    const headers = {};
    for (const [name, value] of Object.entries(req.headers)) {
      if (!hopHeaders.has(name.toLowerCase()) && !['host', 'x-omdrs-bridge-key'].includes(name.toLowerCase())) headers[name] = value;
    }
    headers.host = backend.host;
    const upstream = http.request(new URL(req.url, backend), { method: req.method, headers }, (response) => {
      const out = {};
      for (const [name, value] of Object.entries(response.headers)) if (!hopHeaders.has(name.toLowerCase())) out[name] = value;
      res.writeHead(response.statusCode || 502, out);
      response.pipe(res);
    });
    upstream.setTimeout(120000, () => upstream.destroy());
    upstream.on('error', () => { if (res.headersSent) res.destroy(); else { res.writeHead(502); res.end(); } });
    req.on('aborted', () => upstream.destroy());
    req.pipe(upstream);
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const bridge = createStandbyBridge({ token: process.env.STANDBY_BRIDGE_TOKEN });
  bridge.listen(5052, '127.0.0.1', () => console.log('Standby API bridge listening on 127.0.0.1:5052'));
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => bridge.close());
}
