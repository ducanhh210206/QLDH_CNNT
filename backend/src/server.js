import { app } from "./app.js";
import { env } from "./config/env.js";
import { pool } from "./config/database.js";
import { startBackupJob } from "./jobs/backupJob.js";
import { log } from "./utils/logger.js";
const server = app.listen(env.port, env.host, () =>
  log("server_started", {
    port: env.port,
    instance: env.instance,
    auth_configured: env.jwt.length >= 32,
  }),
);
const job = startBackupJob();
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    clearInterval(job);
    server.close(async () => {
      await pool.end();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
  });
