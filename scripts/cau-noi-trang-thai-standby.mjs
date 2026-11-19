import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

// The tunnel must expose this small health-only service, not the application API.
export function createHealthBridge(fetchImpl = fetch) {
  return http.createServer(async (request, response) => {
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.setHeader('Cache-Control', 'no-store');

    if (request.method !== 'GET' || request.url !== '/health/ready') {
      response.writeHead(404);
      response.end(JSON.stringify({ status: 'Not Found' }));
      return;
    }

    try {
      const upstream = await fetchImpl('http://127.0.0.1:5000/health/ready', {
        signal: AbortSignal.timeout(2500),
        redirect: 'error',
      });
      const result = await upstream.json();
      const isStandby = result.instance === 'standby';
      const healthy = upstream.ok && isStandby && result.status === 'Healthy';
      response.writeHead(healthy ? 200 : 503);
      response.end(JSON.stringify({
        status: healthy ? 'Healthy' : 'Unhealthy',
        database: result.database === 'Healthy' ? 'Healthy' : 'Unknown',
        instance: isStandby ? 'standby' : 'unknown',
      }));
    } catch {
      response.writeHead(503);
      response.end(JSON.stringify({ status: 'Unhealthy', database: 'Unknown', instance: 'unknown' }));
    }
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = createHealthBridge();
  server.listen(5051, '127.0.0.1', () => {
    console.log('Cau noi trang thai standby dang chay tai 127.0.0.1:5051');
  });
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => server.close(() => process.exit(0)));
  }
}
