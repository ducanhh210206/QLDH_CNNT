import test from "node:test";
import assert from "node:assert/strict";
import mysql from "mysql2/promise";
import request from "supertest";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
// Opt-in database test, ALWAYS creates a new test schema. No DROP, DELETE or TRUNCATE.
test(
  "MySQL: auth, duplicate retries, transaction history, locking, Staff permissions",
  { skip: !process.env.RUN_DB_INTEGRATION },
  async () => {
    const name = "omdrs_test_" + randomUUID().replaceAll("-", "");
    process.env.DB_NAME = name;
    process.env.JWT_SECRET = "integration-" + randomUUID() + randomUUID();
    const { env, directDatabaseConfig } = await import("../src/config/env.js");
    const c = await mysql.createConnection({
      ...directDatabaseConfig(),
      database: undefined,
      multipleStatements: true,
    });
    let pool;
    try {
      await c.query("CREATE DATABASE `" + name + "`");
      await c.changeUser({ database: name });
      await c.query(
        await readFile(
          new URL("../../database/init/schema.sql", import.meta.url),
          "utf8",
        ),
      );
      const { hashPassword } = await import("../src/services/authService.js");
      for (const role of ["Admin", "Staff"])
        await c.execute(
          "INSERT INTO users(id,username,password_hash,role) VALUES(?,?,?,?)",
          [
            randomUUID(),
            role,
            await hashPassword("integration-password"),
            role,
          ],
        );
      const { app } = await import("../src/app.js");
      pool = (await import("../src/config/database.js")).pool;
      const agent = request.agent(app);
      assert.equal(
        (
          await agent
            .post("/api/auth/login")
            .send({ username: "Staff", password: "integration-password" })
        ).status,
        200,
      );
      const body = {
        customer_name: "Test",
        product_name: "Product",
        quantity: 1,
        total_amount: "1200.50",
      };
      const key = randomUUID();
      const [a, b] = await Promise.all([
        agent.post("/api/orders").set("Idempotency-Key", key).send(body),
        agent.post("/api/orders").set("Idempotency-Key", key).send(body),
      ]);
      assert.ok([200, 201].includes(a.status));
      assert.ok([200, 201].includes(b.status));
      assert.equal(a.body.order.id, b.body.order.id);
      assert.equal(
        (
          await agent
            .post("/api/orders")
            .set("Idempotency-Key", key)
            .send({ ...body, quantity: 2 })
        ).status,
        409,
      );
      const id = a.body.order.id;
      const updates = await Promise.all(
        ["Completed", "Cancelled"].map((status) =>
          agent
            .patch("/api/orders/" + id + "/status")
            .send({ status, version: 1 }),
        ),
      );
      assert.deepEqual(updates.map((r) => r.status).sort(), [200, 409]);
      const hist = await agent.get("/api/orders/" + id + "/history");
      assert.equal(hist.body.length, 2);
      assert.equal((await agent.get("/api/admin/backups")).status, 403);
      assert.equal((await agent.get("/api/orders?search=Test")).body.total, 1);
      assert.equal((await agent.post("/api/auth/logout").send({})).status, 204);
      assert.equal((await agent.get("/api/orders")).status, 401);
      const adminAgent = request.agent(app);
      assert.equal(
        (
          await adminAgent
            .post("/api/auth/login")
            .send({ username: "Admin", password: "integration-password" })
        ).status,
        200,
      );
      const backup = await adminAgent.post("/api/admin/backups").send({});
      assert.equal(backup.status, 201);
      const restored = await adminAgent
        .post("/api/admin/restores")
        .send({
          backup_id: backup.body.id,
          confirmation: "RESTORE_TO_ISOLATED_DATABASE",
        });
      assert.equal(restored.status, 201);
      assert.equal(restored.body.status, "Verified");
      assert.equal(restored.body.report.test_result, "PASS");
      assert.equal(
        (await adminAgent.get("/api/admin/restores/" + restored.body.id)).body
          .status,
        "Verified",
      );
      console.log("Database kiểm thử được giữ lại để kiểm tra: " + name);
    } finally {
      await c.end();
      await pool?.end();
    }
  },
);
