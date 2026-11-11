import http from 'node:http';
import https from 'node:https';
import { readFile, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const hopHeaders = new Set(['connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailer', 'transfer-encoding', 'upgrade']);
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };
const moduleDir = fileURLToPath(new URL('.', import.meta.url));

export function createAutoGateway({ primaryUrl, standbyUrl, staticDir, expectedDbUuid, standbyToken, externalHttps = false, intervalMs = 3000, timeoutMs = 2500, failThreshold = 2, recoveryThreshold = 3, fetchImpl = fetch }) {
  const primary = new URL(primaryUrl);
  const standby = new URL(standbyUrl);
  if (!['http:', 'https:'].includes(primary.protocol) || !['http:', 'https:'].includes(standby.protocol)) throw new Error('Gateway chi ho tro URL HTTP(S).');
  if (primary.protocol !== 'https:' && !['127.0.0.1', 'localhost', '[::1]'].includes(primary.hostname)) throw new Error('Primary phai dung HTTPS hoac localhost.');
  const remoteStandby = !['127.0.0.1', 'localhost', '[::1]'].includes(standby.hostname);
  if (remoteStandby && (standby.protocol !== 'https:' || !/^[a-f0-9]{64}$/i.test(standbyToken || ''))) throw new Error('Standby tu xa can HTTPS va ma xac thuc rieng 64 ky tu hex.');
  if ([primary, standby].some((url) => url.username || url.password || url.pathname !== '/' || url.search || url.hash)) throw new Error('URL backend phai la dia chi goc, khong chua mat khau hay duong dan.');
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(expectedDbUuid || '')) throw new Error('Can UUID Aiven hop le cho Gateway.');
  const baseDir = resolve(staticDir);
  const state = { primary: 'checking', standby: 'checking', active: null, checked_at: null, changed_at: null };
  let primaryFailures = 0, primarySuccesses = 0, standbySuccesses = 0, polling = false;

  async function probe(url, expected, requireShared) {
    try {
      const headers = requireShared && remoteStandby ? { 'x-omdrs-bridge-key': standbyToken } : {};
      const response = await fetchImpl(new URL('/health/ready', url), { headers, signal: AbortSignal.timeout(timeoutMs), redirect: 'error' });
      const data = await response.json();
      return response.ok && data.status === 'Healthy' && data.database === 'Healthy' && data.instance === expected && (!requireShared || (data.shared_database_verified === true && data.verified_database_uuid === expectedDbUuid.toLowerCase()));
    } catch { return false; }
  }
  async function poll() {
    if (polling) return;
    polling = true;
    try {
      const [p, s] = await Promise.all([probe(primary, 'primary', false), probe(standby, 'standby', true)]);
      primaryFailures = p ? 0 : primaryFailures + 1;
      primarySuccesses = p ? primarySuccesses + 1 : 0;
      standbySuccesses = s ? standbySuccesses + 1 : 0;
      state.primary = p ? 'healthy' : 'unhealthy';
      state.standby = s ? 'healthy' : 'unhealthy';
      const prev = state.active;
      if (state.active === 'primary') {
        if (primaryFailures >= failThreshold) state.active = standbySuccesses >= failThreshold ? 'standby' : null;
      } else if (state.active === 'standby') {
        if (!s) state.active = p && primarySuccesses >= recoveryThreshold ? 'primary' : null;
        else if (p && primarySuccesses >= recoveryThreshold) state.active = 'primary';
      } else if (p && primarySuccesses >= recoveryThreshold) state.active = 'primary';
      else if (primaryFailures >= failThreshold && standbySuccesses >= failThreshold) state.active = 'standby';
      state.checked_at = new Date().toISOString();
      if (prev !== state.active) {
        state.changed_at = state.checked_at;
        console.log(JSON.stringify({ event: 'gateway_route_changed', previous: prev, active: state.active, at: state.changed_at }));
      }
    } finally { polling = false; }
  }
  function json(res, code, value) {
    res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(value));
  }
  function proxy(req, res) {
    const target = state.active === 'primary' ? primary : state.active === 'standby' ? standby : null;
    if (!target) return json(res, 503, { error: { code: 'NO_HEALTHY_BACKEND', message: 'Chua co backend san sang.' } });
    const headers = {};
    for (const [name, value] of Object.entries(req.headers)) if (!hopHeaders.has(name.toLowerCase()) && !['host', 'x-omdrs-bridge-key', 'x-forwarded-proto'].includes(name.toLowerCase())) headers[name] = value;
    headers.host = target.host;
    headers['x-forwarded-proto'] = externalHttps ? 'https' : 'http';
    if (state.active === 'standby' && remoteStandby) headers['x-omdrs-bridge-key'] = standbyToken;
    const upstream = (target.protocol === 'https:' ? https : http).request(new URL(req.url, target), { method: req.method, headers }, (response) => {
      const out = {};
      for (const [name, value] of Object.entries(response.headers)) if (!hopHeaders.has(name.toLowerCase())) out[name] = value;
      res.writeHead(response.statusCode || 502, out);
      response.pipe(res);
    });
    upstream.setTimeout(120000, () => upstream.destroy(new Error('upstream timeout')));
    upstream.on('error', () => {
      if (res.headersSent) res.destroy();
      else json(res, 502, { error: { code: 'UPSTREAM_UNAVAILABLE', message: 'Mat ket noi backend; ket qua yeu cau ghi co the chua xac dinh.' } });
    });
    req.on('aborted', () => upstream.destroy());
    req.pipe(upstream);
  }
  const server = http.createServer(async (req, res) => {
    if (!req.url?.startsWith('/') || req.url.startsWith('//') || req.url.includes('\\')) return json(res, 400, { error: 'Bad request' });
    let path;
    try { path = new URL(req.url, 'http://localhost').pathname; } catch { return json(res, 400, { error: 'Bad request' }); }
    if (path === '/gateway/status' && req.method === 'GET') return json(res, 200, { service: 'omdrs-auto-gateway', ...state });
    if (path === '/gateway/live' && req.method === 'GET') return json(res, 200, { status: 'Healthy', routing: 'automatic', selected: state.active });
    if (path.startsWith('/api/') || path.startsWith('/health/')) return proxy(req, res);
    if (!['GET', 'HEAD'].includes(req.method)) return json(res, 405, { error: 'Method not allowed' });
    try {
      const decoded = decodeURIComponent(path);
      const file = resolve(baseDir, '.' + decoded);
      if (file !== baseDir && !file.startsWith(baseDir + sep)) return json(res, 403, { error: 'Forbidden' });
      let selected = file;
      try { if (!(await stat(file)).isFile()) selected = resolve(baseDir, 'index.html'); }
      catch { selected = resolve(baseDir, 'index.html'); }
      const data = await readFile(selected);
      res.writeHead(200, { 'Content-Type': mime[extname(selected)] || 'application/octet-stream', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      res.end(req.method === 'HEAD' ? undefined : data);
    } catch { json(res, 404, { error: 'Frontend chua duoc build.' }); }
  });
  let timer;
  return { server, state, poll, start() { poll(); timer = setInterval(poll, intervalMs); timer.unref(); }, stop() { clearInterval(timer); } };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.env.NODE_ENV === 'production') {
    if (!process.env.GATEWAY_PRIMARY_URL || !process.env.GATEWAY_STANDBY_URL || !process.env.GATEWAY_EXPECTED_DB_UUID || !process.env.GATEWAY_STANDBY_TOKEN) throw new Error('Gateway production requires explicit backend URLs, expected database UUID, and bridge token.');
    if (process.env.RENDER_EXTERNAL_URL && new URL(process.env.GATEWAY_PRIMARY_URL).origin === new URL(process.env.RENDER_EXTERNAL_URL).origin) throw new Error('Gateway primary URL cannot point back to the gateway.');
  }
  const gateway = createAutoGateway({
    primaryUrl: process.env.GATEWAY_PRIMARY_URL || 'https://qldh-demo.onrender.com',
    standbyUrl: process.env.GATEWAY_STANDBY_URL || 'http://127.0.0.1:5000',
    expectedDbUuid: process.env.GATEWAY_EXPECTED_DB_UUID || 'c4ee9c9b-d7fc-11f1-ac26-f2d5b3407bc1',
    staticDir: process.env.GATEWAY_FRONTEND_DIR || resolve(moduleDir, '../frontend/dist'),
    standbyToken: process.env.GATEWAY_STANDBY_TOKEN,
    externalHttps: process.env.GATEWAY_EXTERNAL_HTTPS === 'true',
  });
  gateway.start();
  const port = Number(process.env.PORT || 8080);
  const host = process.env.GATEWAY_HOST || '127.0.0.1';
  gateway.server.listen(port, host, () => console.log(`Gateway tu dong: ${host}:${port}`));
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { gateway.stop(); gateway.server.close(); });
}
