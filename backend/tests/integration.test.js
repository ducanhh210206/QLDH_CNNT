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
      // Manager-issued accounts are active immediately, limited, and audited atomically.
      const issueBody = {
        username: "issued_staff",
        full_name: "Nhân viên được cấp",
        email: "issued@example.com",
        password: "issued-password-123",
        permissions: ["products.read"],
        note: "Cấp tài khoản cho nhân viên mới",
      };
      const issued = await adminAgent.post("/api/admin/users").send(issueBody);
      assert.equal(issued.status, 201, JSON.stringify(issued.body));
      assert.equal(issued.body.role, "Staff");
      assert.equal(issued.body.account_status, "Active");
      assert.deepEqual(issued.body.permissions, ["products.read"]);
      assert.equal(issued.body.password, undefined);
      assert.equal(issued.body.password_hash, undefined);
      const [[issuedStored]] = await c.execute(
        "SELECT * FROM users WHERE id=?",
        [issued.body.id],
      );
      assert.notEqual(issuedStored.password_hash, issueBody.password);
      assert.equal(issuedStored.email_verified, 0);
      assert.ok(issuedStored.reviewed_by);
      const issuedHistory = await adminAgent.get(
        "/api/admin/users/" + issued.body.id + "/history",
      );
      assert.equal(issuedHistory.body.length, 1);
      assert.equal(issuedHistory.body[0].actor, "Admin");
      assert.ok(
        !JSON.stringify(issuedHistory.body).includes(issueBody.password),
      );
      assert.equal(
        (await adminAgent.post("/api/admin/users").send(issueBody)).status,
        409,
      );
      assert.equal(
        (
          await adminAgent
            .post("/api/admin/users")
            .send({ ...issueBody, username: "other_staff" })
        ).status,
        409,
      );
      const issuedAgent = request.agent(app);
      assert.equal(
        (
          await issuedAgent
            .post("/api/auth/login")
            .send({
              username: issueBody.username,
              password: issueBody.password,
            })
        ).status,
        200,
      );
      assert.equal((await issuedAgent.get("/api/products")).status, 200);
      assert.equal(
        (
          await issuedAgent
            .post("/api/admin/users")
            .send({
              ...issueBody,
              username: "forbidden_staff",
              email: "forbidden@example.com",
            })
        ).status,
        403,
      );
      assert.equal((await issuedAgent.get("/api/admin/backups")).status, 403);
      assert.equal(
        (
          await issuedAgent
            .post("/api/products")
            .send({ sku: "NO", name: "Denied", unit_price: "1" })
        ).status,
        403,
      );
      const [[auditCount]] = await c.query(
        "SELECT COUNT(*) total FROM user_access_history WHERE user_id=?",
        [issued.body.id],
      );
      assert.equal(Number(auditCount.total), 1);
      const product = await adminAgent.post("/api/products").send({
        sku: "SP-TEST",
        name: "Sản phẩm thử nghiệm",
        unit_price: "1200.50",
        description: "Isolated test",
      });
      assert.equal(product.status, 201);
      const userRepo = await import("../src/repositories/userRepository.js");
      const googlePending = await userRepo.googleAccount({
        sub: "isolated-google-sub",
        email: "google@example.com",
        name: "Google staff test",
      });
      assert.equal(googlePending.role, "Staff");
      assert.equal(googlePending.account_status, "Pending");
      assert.equal(googlePending.password_hash, null);
      assert.equal(
        (
          await userRepo.googleAccount({
            sub: "isolated-google-sub",
            email: "google@example.com",
            name: "Google staff test",
          })
        ).id,
        googlePending.id,
      );
      const pending = request.agent(app);
      const registration = await pending.post("/api/auth/register").send({
        username: "pendingstaff",
        full_name: "Nhân viên chờ duyệt",
        email: "pending@example.com",
        password: "pending-password-123",
      });
      assert.equal(registration.status, 201);
      await assert.rejects(
        () =>
          userRepo.googleAccount({
            sub: "collision-sub",
            email: "pending@example.com",
            name: "Collision",
          }),
        (e) => e.code === "ACCOUNT_LINK_REQUIRED",
      );
      const pendingLogin = await pending
        .post("/api/auth/login")
        .send({ username: "pendingstaff", password: "pending-password-123" });
      assert.equal(pendingLogin.status, 403);
      assert.equal(pendingLogin.body.error.code, "PENDING_APPROVAL");
      const users = await adminAgent.get("/api/admin/users?status=Pending");
      assert.equal(users.status, 200);
      const target = users.body.data.find((u) => u.id === registration.body.id);
      assert.ok(target);
      assert.equal(target.password_hash, undefined);
      const approval = await adminAgent
        .patch("/api/admin/users/" + target.id + "/access")
        .send({
          version: target.access_version,
          role: "Staff",
          account_status: "Active",
          permissions: ["products.read", "transactions.read"],
          note: "Duyệt nhân viên thử nghiệm",
        });
      assert.equal(approval.status, 200);
      assert.equal(
        (
          await pending.post("/api/auth/login").send({
            username: "pendingstaff",
            password: "pending-password-123",
          })
        ).status,
        200,
      );
      assert.equal((await pending.get("/api/products")).status, 200);
      assert.equal((await pending.post("/api/products").send({})).status, 403);
      assert.equal((await pending.get("/api/dashboard/summary")).status, 403);
      assert.equal((await pending.get("/api/orders")).status, 403);
      assert.equal((await pending.get("/api/transactions")).status, 200);
      assert.equal(
        (await pending.post("/api/admin/backups").send({})).status,
        403,
      );
      const accessHistory = await adminAgent.get(
        "/api/admin/users/" + target.id + "/history",
      );
      assert.equal(accessHistory.body.length, 1);
      const suspended = await adminAgent
        .patch("/api/admin/users/" + target.id + "/access")
        .send({
          version: approval.body.access_version,
          role: "Staff",
          account_status: "Suspended",
          permissions: ["products.read"],
          note: "Tạm khóa thử nghiệm",
        });
      assert.equal(suspended.status, 200);
      assert.equal((await pending.get("/api/auth/me")).status, 401);
      const backup = await adminAgent.post("/api/admin/backups").send({});
      assert.equal(backup.status, 201);
      const restored = await adminAgent.post("/api/admin/restores").send({
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
      const promote = await adminAgent
        .patch("/api/admin/users/" + target.id + "/access")
        .send({
          version: suspended.body.access_version,
          role: "Admin",
          account_status: "Active",
          permissions: [],
          note: "Concurrency test manager",
        });
      assert.equal(promote.status, 200);
      const other = request.agent(app);
      assert.equal(
        (
          await other.post("/api/auth/login").send({
            username: "pendingstaff",
            password: "pending-password-123",
          })
        ).status,
        200,
      );
      const me = (await adminAgent.get("/api/auth/me")).body;
      const reviews = await Promise.all([
        adminAgent.patch("/api/admin/users/" + target.id + "/access").send({
          version: promote.body.access_version,
          role: "Staff",
          account_status: "Active",
          permissions: ["products.read"],
          note: "Concurrent demotion A",
        }),
        other.patch("/api/admin/users/" + me.id + "/access").send({
          version: me.access_version,
          role: "Staff",
          account_status: "Active",
          permissions: ["products.read"],
          note: "Concurrent demotion B",
        }),
      ]);
      assert.deepEqual(reviews.map((r) => r.status).sort(), [200, 403]);
      const [remaining] = await c.query(
        "SELECT COUNT(*) total FROM users WHERE role='Admin' AND account_status='Active'",
      );
      assert.equal(Number(remaining[0].total), 1);
      console.log("Database kiểm thử được giữ lại để kiểm tra: " + name);
    } finally {
      await c.end();
      await pool?.end();
    }
  },
);
