import { randomUUID } from "node:crypto";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import mysql from "mysql2";
import { pool } from "../backend/src/config/database.js";
import { env, databaseLockName } from "../backend/src/config/env.js";
import { digest } from "../backend/src/utils/integrity.js";
let c,
  locked = false;
try {
  c = await pool.getConnection();
  const [locks] = await c.execute("SELECT GET_LOCK(?,10) AS acquired", [
    databaseLockName(),
  ]);
  if (Number(locks[0].acquired) !== 1)
    throw Error("Không lấy được khóa migration/backup.");
  locked = true;
  const [versions] = await c.query("SELECT version FROM schema_migrations");
  if (versions.some((r) => r.version === "002_user_access")) {
    console.log("Schema 002 đã được áp dụng.");
  } else {
    if (!versions.some((r) => r.version === "001_initial"))
      throw Error("Cần schema 001 trước.");
    const [tables] = await c.execute(
      "SELECT TABLE_NAME name FROM information_schema.TABLES WHERE TABLE_SCHEMA=? AND TABLE_TYPE=? ORDER BY TABLE_NAME",
      [env.db.database, "BASE TABLE"],
    );
    await c.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ");
    await c.query("START TRANSACTION WITH CONSISTENT SNAPSHOT");
    let backup =
      "-- OMDRS pre-migration safety snapshot; restore into a new isolated database only.\nSET FOREIGN_KEY_CHECKS=0;\n";
    for (const { name } of tables) {
      const table = mysql.escapeId(name);
      const [ddl] = await c.query("SHOW CREATE TABLE " + table);
      backup += ddl[0]["Create Table"] + ";\n";
      const [rows] = await c.query("SELECT * FROM " + table);
      for (const row of rows) {
        const columns = Object.keys(row);
        backup +=
          "INSERT INTO " +
          table +
          " (" +
          columns.map(mysql.escapeId).join(",") +
          ") VALUES (" +
          columns
            .map((k) =>
              mysql.escape(
                row[k] !== null && typeof row[k] === "object"
                  ? JSON.stringify(row[k])
                  : row[k],
              ),
            )
            .join(",") +
          ");\n";
      }
    }
    backup += "SET FOREIGN_KEY_CHECKS=1;\n";
    await c.commit();
    await mkdir(env.backups, { recursive: true, mode: 0o700 });
    const file = join(
      env.backups,
      "before-schema-002-" + randomUUID() + ".sql",
    );
    await writeFile(file, backup, { flag: "wx", mode: 0o600 });
    await writeFile(file + ".sha256", digest(backup) + "\n", {
      flag: "wx",
      mode: 0o600,
    });
    console.log("Đã lưu safety snapshot và SHA-256 tại " + file);
    const source = await readFile(
      new URL("../database/migrations/002_user_access.sql", import.meta.url),
      "utf8",
    );
    const statements = source
      .replace(/^--.*$/gm, "")
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean);
    for (const statement of statements) {
      const add = statement.match(/^ALTER TABLE users ADD COLUMN (\w+)/);
      if (add) {
        const [existing] = await c.execute(
          "SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME=? AND COLUMN_NAME=?",
          [env.db.database, "users", add[1]],
        );
        if (existing.length) continue;
      }
      const create = statement.match(/^CREATE TABLE (\w+)/);
      if (create) {
        const [existing] = await c.execute(
          "SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA=? AND TABLE_NAME=?",
          [env.db.database, create[1]],
        );
        if (existing.length) continue;
      }
      await c.query(statement);
    }
    await c.execute("INSERT INTO schema_migrations(version) VALUES(?)", [
      "002_user_access",
    ]);
    console.log(
      "Migration 002 hoàn tất. Tài khoản và dữ liệu hiện có được giữ nguyên.",
    );
  }
} catch (e) {
  if (c) await c.rollback().catch(() => {});
  console.error("Migration chưa hoàn tất:", e.code || e.message);
  process.exitCode = 1;
} finally {
  if (c) {
    if (locked)
      await c
        .execute("SELECT RELEASE_LOCK(?)", [databaseLockName()])
        .catch(() => {});
    c.release();
  }
  await pool.end();
}
