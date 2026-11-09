import mysql from "mysql2/promise";
import { readFileSync } from "node:fs";

export function replicationSnapshot(rows, checkedAt) {
  if (!rows.length) return { status: "Not Configured", checked_at: checkedAt, message: "Standby chưa có kênh replication." };
  const channels = rows.map((r) => {
    const io = r.Replica_IO_Running ?? r.Slave_IO_Running;
    const sql = r.Replica_SQL_Running ?? r.Slave_SQL_Running;
    const lag = r.Seconds_Behind_Source ?? r.Seconds_Behind_Master;
    const healthy = io === "Yes" && sql === "Yes" && !Number(r.Last_IO_Errno) && !Number(r.Last_SQL_Errno);
    return { name: r.Channel_Name || "default", io_running: io, sql_running: sql,
      status: healthy ? "Healthy" : "Unhealthy",
      lag_seconds: healthy && lag != null && Number.isFinite(Number(lag)) ? Number(lag) : null };
  });
  return { status: channels.every((c) => c.status === "Healthy") ? "Healthy" : "Unhealthy",
    checked_at: checkedAt, channels, last_applied_at: null,
    lag_seconds: channels.every((c) => c.lag_seconds != null) ? Math.max(...channels.map((c) => c.lag_seconds)) : null };
}
export async function probeReplication(settings = process.env) {
  if (!settings.REPLICA_DB_HOST) return { status: "Not Configured", message: "Chưa cấu hình kết nối MySQL Standby cho Monitoring." };
  let connection;
  const at = new Date().toISOString();
  try {
    connection = await mysql.createConnection({
      host: settings.REPLICA_DB_HOST, port: Number(settings.REPLICA_DB_PORT || 3306),
      user: settings.REPLICA_DB_USER, password: settings.REPLICA_DB_PASSWORD,
      connectTimeout: 2000, timezone: "Z", dateStrings: true,
      ...(settings.REPLICA_DB_SSL === "true" ? { ssl: { rejectUnauthorized: true,
        ...(settings.REPLICA_DB_SSL_CA_FILE ? { ca: readFileSync(settings.REPLICA_DB_SSL_CA_FILE, "utf8") } : {}) } } : {}),
    });
    await connection.query({ sql: "SET time_zone='+00:00'", timeout: 2000 });
    const [rows] = await connection.query({ sql: "SHOW REPLICA STATUS", timeout: 2000 });
    const snapshot = replicationSnapshot(rows, at);
    try {
      const [[last]] = await connection.query({ sql: "SELECT MAX(LAST_APPLIED_TRANSACTION_END_APPLY_TIMESTAMP) applied_at FROM performance_schema.replication_applier_status_by_worker", timeout: 2000 });
      if (last?.applied_at && !String(last.applied_at).startsWith("0000"))
        snapshot.last_applied_at = new Date(String(last.applied_at).replace(" ", "T") + "Z").toISOString();
    } catch { snapshot.timestamp_message = "Chưa đọc được thời điểm áp dụng giao dịch từ performance_schema."; }
    return snapshot;
  } catch {
    return { status: "Unknown", checked_at: at, lag_seconds: null, last_applied_at: null,
      message: "Không đọc được replication. Kiểm tra kết nối, TLS và quyền REPLICATION CLIENT của tài khoản giám sát." };
  } finally { connection?.destroy(); }
}
