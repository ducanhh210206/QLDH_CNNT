import { randomUUID } from "node:crypto";
import { mkdir, writeFile, readFile, stat, unlink } from "node:fs/promises";
import { join } from "node:path";
import mysql from "mysql2/promise";
import mysqlFormat from "mysql2";
import { pool } from "../config/database.js";
import { env, directDatabaseConfig, databaseLockName } from "../config/env.js";
import { digest, compareOrders } from "../utils/integrity.js";
import { fail } from "../utils/errors.js";
// Only application tables; auth sessions and idempotency keys stay part of consistent snapshot.
const tables = [
  "users",
  "auth_sessions",
  "orders",
  "order_status_history",
  "idempotency_keys",
  "incident_logs",
  "backup_records",
  "restore_records",
  "schema_migrations",
  "user_access_history",
  "oauth_login_attempts",
  "products",
];
let busy = false;
export async function listBackups() {
  const [r] = await pool.query(
    "SELECT * FROM backup_records ORDER BY created_at DESC LIMIT 100",
  );
  return r;
}
export async function createBackup(userId = null) {
  if (busy) fail(409, "BACKUP_BUSY", "Một bản sao lưu đang được tạo.");
  busy = true;
  const id = randomUUID(),
    file = id + ".sql";
  let c,
    locked = false;
  try {
    await mkdir(env.backups, { recursive: true, mode: 0o700 });
    c = await pool.getConnection();
    const [lock] = await c.execute("SELECT GET_LOCK(?,0) AS acquired", [
      databaseLockName(),
    ]);
    if (Number(lock[0].acquired) !== 1)
      fail(409, "BACKUP_BUSY", "Một instance khác đang sao lưu.");
    locked = true;
    await pool.execute(
      "INSERT INTO backup_records(id,file_name,status,user_id) VALUES(?,?,'Running',?)",
      [id, file, userId],
    );
    await c.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ");
    await c.query("START TRANSACTION WITH CONSISTENT SNAPSHOT");
    let sql =
      "-- OMDRS consistent logical backup v1; UTC; application tables only\n";
    const snapshot = {};
    for (const table of tables) {
      const [ddl] = await c.query("SHOW CREATE TABLE `" + table + "`");
      sql += ddl[0]["Create Table"] + ";\n";
      const [rows] = await c.query("SELECT * FROM `" + table + "`");
      snapshot[table] = rows;
      for (const row of rows) {
        const columns = Object.keys(row);
        const values = columns.map((k) => {
          const v = row[k];
          return v !== null && typeof v === "object" ? JSON.stringify(v) : v;
        });
        sql +=
          "INSERT INTO `" +
          table +
          "` (" +
          columns.map((k) => "`" + k + "`").join(",") +
          ") VALUES (" +
          values.map((v) => mysqlFormat.escape(v)).join(",") +
          ");\n";
      }
    }
    await c.commit();
    const hash = digest(sql);
    await writeFile(join(env.backups, file), sql, { mode: 0o600, flag: "wx" });
    const manifest = {
      id,
      created_at: new Date().toISOString(),
      sha256: hash,
      tables: Object.fromEntries(
        tables.map((t) => [
          t,
          { count: snapshot[t].length, sha256: digest(snapshot[t]) },
        ]),
      ),
      orders: snapshot.orders,
    };
    await writeFile(join(env.backups, id + ".json"), JSON.stringify(manifest), {
      mode: 0o600,
      flag: "wx",
    });
    const size = (await stat(join(env.backups, file))).size;
    await pool.execute(
      "UPDATE backup_records SET status='Success',sha256=?,size_bytes=? WHERE id=?",
      [hash, size, id],
    );
    return {
      id,
      file_name: file,
      sha256: hash,
      size_bytes: size,
      status: "Success",
    };
  } catch (e) {
    if (c) await c.rollback().catch(() => {});
    await pool
      .execute(
        "UPDATE backup_records SET status='Failed',error_code=? WHERE id=?",
        [e.code || "BACKUP_FAILED", id],
      )
      .catch(() => {});
    throw e;
  } finally {
    if (c) {
      if (locked)
        await c
          .execute("SELECT RELEASE_LOCK(?)", [databaseLockName()])
          .catch(() => {});
      c.release();
    }
    busy = false;
  }
}
export async function restoreBackup(backupId, userId, confirmation) {
  if (confirmation !== "RESTORE_TO_ISOLATED_DATABASE")
    fail(
      400,
      "CONFIRMATION_REQUIRED",
      "Cần xác nhận phục hồi vào database cách ly.",
    );
  const [records] = await pool.execute(
    "SELECT * FROM backup_records WHERE id=? AND status='Success'",
    [backupId],
  );
  if (!records[0])
    fail(404, "NOT_FOUND", "Không có backup thành công tương ứng.");
  const sql = await readFile(join(env.backups, backupId + ".sql"), "utf8"),
    manifest = JSON.parse(
      await readFile(join(env.backups, backupId + ".json"), "utf8"),
    );
  if (
    digest(sql) !== records[0].sha256 ||
    digest(sql) !== manifest.sha256 ||
    digest(manifest.orders) !== manifest.tables.orders.sha256
  )
    fail(409, "CHECKSUM_MISMATCH", "Checksum không khớp. Dừng phục hồi.");
  const id = randomUUID(),
    target = "omdrs_restore_" + id.replaceAll("-", "");
  await pool.execute(
    "INSERT INTO restore_records(id,backup_id,target_database,status,user_id) VALUES(?,?,?,'Running',?)",
    [id, backupId, target, userId],
  );
  let c;
  const started = Date.now();
  try {
    c = await mysql.createConnection({
      ...directDatabaseConfig(),
      multipleStatements: true,
    });
    // CREATE has no IF NOT EXISTS: an existing target is never reused or overwritten.
    await c.query("CREATE DATABASE `" + target + "` CHARACTER SET utf8mb4");
    await c.changeUser({ database: target });
    await c.query("SET time_zone='+00:00'");
    await c.query(
      "SET SESSION sql_mode='STRICT_TRANS_TABLES,NO_ENGINE_SUBSTITUTION'",
    );
    await c.query(sql);
    const [after] = await c.query("SELECT * FROM orders");
    const report = {
      ...compareOrders(manifest.orders, after),
      started_at: new Date(started).toISOString(),
      recovered_at: new Date().toISOString(),
      restore_duration_ms: Date.now() - started,
      backup_created_at: manifest.created_at,
      tables: {},
    };
    for (const table of tables) {
      const [rows] = await c.query("SELECT * FROM `" + table + "`");
      report.tables[table] = {
        count: rows.length,
        match: digest(rows) === manifest.tables[table].sha256,
      };
      if (!report.tables[table].match) report.test_result = "FAIL";
    }
    await pool.execute(
      "UPDATE restore_records SET status=?,report=? WHERE id=?",
      [
        report.test_result === "PASS" ? "Verified" : "Failed",
        JSON.stringify(report),
        id,
      ],
    );
    return {
      id,
      target_database: target,
      status: report.test_result === "PASS" ? "Verified" : "Failed",
      report,
    };
  } catch (e) {
    await pool.execute(
      "UPDATE restore_records SET status='Failed',report=? WHERE id=?",
      [JSON.stringify({ error_code: e.code || "RESTORE_FAILED" }), id],
    );
    throw e;
  } finally {
    await c?.end();
  }
}
export async function getRestore(id) {
  const [r] = await pool.execute("SELECT * FROM restore_records WHERE id=?", [
    id,
  ]);
  if (!r[0]) fail(404, "NOT_FOUND", "Không tìm thấy lượt phục hồi.");
  return r[0];
}
export async function cleanupBackups() {
  const [rows] = await pool.execute(
    "SELECT id FROM backup_records WHERE status='Success' AND created_at < DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? DAY)",
    [env.retentionDays],
  );
  const all = await listBackups();
  const latest = all.find((r) => r.status === "Success")?.id;
  for (const r of rows) {
    if (r.id === latest) continue;
    await unlink(join(env.backups, r.id + ".sql")).catch((e) => {
      if (e.code !== "ENOENT") throw e;
    });
    await unlink(join(env.backups, r.id + ".json")).catch((e) => {
      if (e.code !== "ENOENT") throw e;
    });
    await pool.execute(
      "UPDATE backup_records SET status='Expired' WHERE id=?",
      [r.id],
    );
  }
}
