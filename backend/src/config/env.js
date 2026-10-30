import { createHash } from "node:crypto";
import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
dotenv.config({
  path: fileURLToPath(new URL("../../.env", import.meta.url)),
  quiet: true,
});
export const env = {
  port: Number(process.env.PORT || 5000),
  host: process.env.HOST || "127.0.0.1",
  production: process.env.NODE_ENV === "production",
  db: {
    host: process.env.DB_HOST || "127.0.0.1",
    port: Number(process.env.DB_PORT || 3306),
    database: process.env.DB_NAME || "order_management",
    user: process.env.DB_USER || "order_user",
    password: process.env.DB_PASSWORD || "",
    connectionLimit: 10,
    waitForConnections: true,
    queueLimit: 50,
    connectTimeout: 5000,
    charset: "utf8mb4",
    timezone: "Z",
    dateStrings: true,
    supportBigNumbers: true,
    bigNumberStrings: true,
  },
  jwt: process.env.JWT_SECRET || "",
  origins: (
    process.env.CORS_ORIGINS || "http://localhost:5173,http://127.0.0.1:5173"
  ).split(","),
  instance: process.env.INSTANCE_NAME || "primary",
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || "",
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
    redirectUri:
      process.env.GOOGLE_REDIRECT_URI ||
      "http://127.0.0.1:5173/api/auth/google/callback",
    frontendUrl: process.env.FRONTEND_URL || "http://127.0.0.1:5173",
  },
  monitor: process.env.MONITOR_URL || "http://127.0.0.1:5001",
  monitorToken: process.env.MONITOR_TOKEN || "",
  backups: process.env.BACKUP_DIR
    ? resolve(process.env.BACKUP_DIR)
    : resolve(
        fileURLToPath(new URL("../../../database/backups", import.meta.url)),
      ),
  backupHours: Number(process.env.BACKUP_INTERVAL_HOURS || 0),
  retentionDays: Math.max(1, Number(process.env.BACKUP_RETENTION_DAYS || 30)),
};

export function directDatabaseConfig() {
  const { connectionLimit, waitForConnections, queueLimit, ...config } = env.db;
  return config;
}

export const databaseLockName = () =>
  "omdrs:" +
  createHash("sha256").update(env.db.database).digest("hex").slice(0, 48);
