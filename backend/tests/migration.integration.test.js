import test from "node:test";
import assert from "node:assert/strict";
import mysql from "mysql2/promise";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
test(
  "migration 002 keeps existing users/orders and is safely repeatable",
  { skip: !process.env.RUN_DB_INTEGRATION },
  async () => {
    const { env, directDatabaseConfig } = await import("../src/config/env.js");
    const name = "omdrs_migration_test_" + randomUUID().replaceAll("-", "");
    const c = await mysql.createConnection({
      ...directDatabaseConfig(),
      database: undefined,
      multipleStatements: true,
    });
    try {
      await c.query("CREATE DATABASE `" + name + "`");
      await c.changeUser({ database: name });
      await c.query(
        await readFile(
          new URL("../../database/migrations/001_initial.sql", import.meta.url),
          "utf8",
        ),
      );
      const uid = randomUUID(),
        oid = randomUUID();
      const hash = "existing-hash-kept-by-migration";
      await c.execute(
        "INSERT INTO users(id,username,password_hash,role) VALUES(?,?,?,'Admin')",
        [uid, "legacy_manager", hash],
      );
      await c.execute(
        "INSERT INTO orders(id,customer_name,product_name,quantity,total_amount,status) VALUES(?,?,?,2,'10.50','Pending')",
        [oid, "Legacy customer", "Legacy product"],
      );
      const root = fileURLToPath(new URL("../../", import.meta.url));
      for (let run = 0; run < 2; run++) {
        const result = spawnSync(process.execPath, ["scripts/migrate-db.js"], {
          cwd: root,
          env: { ...process.env, DB_NAME: name },
          encoding: "utf8",
          timeout: 30000,
        });
        assert.equal(result.status, 0, result.stderr + result.stdout);
      }
      const [users] = await c.query("SELECT * FROM users");
      assert.equal(users.length, 1);
      assert.equal(users[0].password_hash, hash);
      assert.equal(users[0].account_status, "Active");
      assert.equal(users[0].role, "Admin");
      assert.equal(users[0].permissions, null);
      const [orders] = await c.query("SELECT * FROM orders");
      assert.equal(orders.length, 1);
      assert.equal(orders[0].id, oid);
      assert.equal(orders[0].total_amount, "10.50");
      const [versions] = await c.query(
        "SELECT version FROM schema_migrations WHERE version='002_user_access'",
      );
      assert.equal(versions.length, 1);
      await c.query("SELECT 1 FROM user_access_history LIMIT 1");
      await c.query("SELECT 1 FROM oauth_login_attempts LIMIT 1");
      await c.query("SELECT 1 FROM products LIMIT 1");
      console.log("Migration test schema retained: " + name);
    } finally {
      await c.end();
      const { pool } = await import("../src/config/database.js");
      await pool.end();
    }
  },
);
