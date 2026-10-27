import { env } from "../config/env.js";
import { createBackup, cleanupBackups } from "../services/backupService.js";
import { log } from "../utils/logger.js";
export function startBackupJob() {
  if (env.backupHours <= 0 || env.instance !== "primary") return;
  const timer = setInterval(async () => {
    try {
      await createBackup();
      await cleanupBackups();
    } catch (e) {
      log("scheduled_backup_failed", { code: e.code || "INTERNAL" });
    }
  }, env.backupHours * 3600000);
  timer.unref();
  return timer;
}
