import { app } from "./app.js";
import { env } from "./config/env.js";
import { pool } from "./config/database.js";
import { startBackupJob } from "./jobs/backupJob.js";
import { refreshMonitoringHistory } from "./services/healthService.js";
import { log } from "./utils/logger.js";
const server = app.listen(env.port, env.host, () =>
  log("server_started", {
    port: env.port,
    instance: env.instance,
    auth_configured: env.jwt.length >= 32,
  }),
);
const job = startBackupJob();
const historyJob = setInterval(() => {
  if (env.monitorToken.length >= 32) refreshMonitoringHistory().catch(() => log('monitor_history_failed', {}));
}, 30000);
historyJob.unref();
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    clearInterval(job);
    clearInterval(historyJob);
    server.close(async () => {
      await pool.end();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
  });
