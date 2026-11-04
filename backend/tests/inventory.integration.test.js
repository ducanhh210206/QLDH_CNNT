import test from "node:test";
import assert from "node:assert/strict";
import mysql from "mysql2/promise";
import request from "supertest";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";

test(
  "MySQL inventory: no overselling, safe retries, cancellation, stock permissions, concurrent edits and rollback",
  { skip: !process.env.RUN_DB_INTEGRATION },
  async () => {
    process.env.DB_NAME =
      "omdrs_stock_test_" + randomUUID().replaceAll("-", "");
    process.env.JWT_SECRET = "stock-test-" + randomUUID() + randomUUID();
    const { directDatabaseConfig } = await import("../src/config/env.js");
    const c = await mysql.createConnection({
      ...directDatabaseConfig(),
      database: undefined,
      multipleStatements: true,
    });
    let pool;
    try {
      await c.query("CREATE DATABASE `" + process.env.DB_NAME + "`");
      await c.changeUser({ database: process.env.DB_NAME });
      await c.query(
        await readFile(
          new URL("../../database/init/schema.sql", import.meta.url),
          "utf8",
        ),
      );
      const { hashPassword } = await import("../src/services/authService.js");
      const uid = randomUUID();
      const hash = await hashPassword("inventory-test-password");
      await c.execute(
        "INSERT INTO users(id,username,password_hash,role,permissions) VALUES(?,'manager',?,'Admin',NULL)",
        [uid, hash],
      );
      await c.execute(
        "INSERT INTO users(id,username,password_hash,role,permissions) VALUES(?,'employee',?,'Staff',?)",
        [randomUUID(), hash, JSON.stringify(["orders.read", "orders.create"])],
      );
      const { app } = await import("../src/app.js");
      pool = (await import("../src/config/database.js")).pool;
      const manager = request.agent(app),
        staff = request.agent(app);
      for (const [agent, username] of [
        [manager, "manager"],
        [staff, "employee"],
      ])
        assert.equal(
          (
            await agent
              .post("/api/auth/login")
              .send({ username, password: "inventory-test-password" })
          ).status,
          200,
        );
      const product = await manager.post("/api/products").send({
        name: "Hàng tồn kho",
        unit_price: "100.50",
        stock_quantity: 5,
      });
      assert.equal(product.status, 201, JSON.stringify(product.body));
      assert.match(product.body.sku, /^SP-[A-F0-9]{12}$/);
      const another = await manager
        .post("/api/products")
        .send({
          sku: product.body.sku,
          name: "Tên trùng vẫn có mã riêng",
          unit_price: "1",
          stock_quantity: 0,
        });
      assert.equal(another.status, 201);
      assert.notEqual(another.body.sku, product.body.sku);
      const pid = product.body.id;
      const stock = async () =>
        Number(
          (
            await c.execute("SELECT stock_quantity FROM products WHERE id=?", [
              pid,
            ])
          )[0][0].stock_quantity,
        );
      const submit = (
        quantity,
        key = randomUUID(),
        status = "Pending",
        product_id = pid,
      ) =>
        manager.post("/api/orders").set("Idempotency-Key", key).send({
          product_id,
          customer_name: "Khách thử",
          product_name: "Tên giả gửi từ client",
          quantity,
          total_amount: "100.50",
          status,
        });
      assert.equal((await staff.get("/api/products")).status, 403);
      assert.equal((await staff.get("/api/orders/products")).status, 200);
      assert.equal(
        (
          await staff
            .post("/api/products/" + pid + "/stock")
            .send({ quantity: 100 })
        ).status,
        403,
      );
      for (const quantity of [-1, 0, 1.5])
        assert.equal(
          (
            await manager
              .post("/api/products/" + pid + "/stock")
              .send({ quantity })
          ).status,
          400,
        );
      const over = await submit(6);
      assert.equal(over.status, 409);
      assert.equal(over.body.error.code, "INSUFFICIENT_STOCK");
      assert.equal(await stock(), 5);
      const [[counts]] = await c.query(
        "SELECT (SELECT COUNT(*) FROM orders) orders_count,(SELECT COUNT(*) FROM idempotency_keys) keys_count,(SELECT COUNT(*) FROM order_status_history) history_count",
      );
      assert.equal(Number(counts.orders_count), 0);
      assert.equal(Number(counts.keys_count), 0);
      assert.equal(Number(counts.history_count), 0);
      assert.equal(
        (await submit(1, randomUUID(), "Pending", randomUUID())).status,
        404,
      );
      const competing = await Promise.all([submit(4), submit(4)]);
      assert.deepEqual(competing.map((r) => r.status).sort(), [201, 409]);
      assert.equal(await stock(), 1);
      const winning = competing.find((r) => r.status === 201).body.order;
      assert.equal(winning.product_name, "Hàng tồn kho");
      assert.equal(winning.product_id, pid);
      const cancelled = await manager
        .patch("/api/orders/" + winning.id + "/status")
        .send({ status: "Cancelled", version: 1 });
      assert.equal(cancelled.status, 200);
      assert.equal(await stock(), 5);
      assert.equal(
        (
          await manager
            .patch("/api/orders/" + winning.id + "/status")
            .send({ status: "Cancelled", version: 1 })
        ).status,
        409,
      );
      assert.equal(await stock(), 5);
      const key = randomUUID();
      const duplicate = await Promise.all([submit(5, key), submit(5, key)]);
      assert.deepEqual(duplicate.map((r) => r.status).sort(), [200, 201]);
      assert.equal(duplicate[0].body.order.id, duplicate[1].body.order.id);
      assert.equal(await stock(), 0);
      assert.equal((await submit(4, key)).status, 409);
      assert.equal(await stock(), 0);
      const completed = await manager
        .patch("/api/orders/" + duplicate[0].body.order.id + "/status")
        .send({ status: "Completed", version: 1 });
      assert.equal(completed.status, 200);
      assert.equal(await stock(), 0);
      assert.equal(
        (
          await manager
            .post("/api/products/" + pid + "/stock")
            .send({ quantity: 8 })
        ).status,
        200,
      );
      assert.equal(await stock(), 8);
      assert.equal((await submit(3, randomUUID(), "Completed")).status, 201);
      assert.equal(await stock(), 5);
      assert.equal((await submit(2, randomUUID(), "Cancelled")).status, 201);
      assert.equal(await stock(), 5);
      // Force a late FK failure: stock decrement and order insert must roll back together.
      const repo = await import("../src/repositories/orderRepository.js");
      await assert.rejects(() =>
        repo.create(
          {
            product_id: pid,
            customer_name: "rollback",
            product_name: "X",
            quantity: 2,
            total_amount: "1",
            status: "Pending",
          },
          randomUUID(),
          randomUUID(),
        ),
      );
      assert.equal(await stock(), 5);
      const legacy = randomUUID();
      await c.execute(
        "INSERT INTO orders(id,customer_name,product_name,quantity,total_amount,status) VALUES(?,'Old','Legacy',9,1,'Pending')",
        [legacy],
      );
      assert.equal(
        (
          await manager
            .patch("/api/orders/" + legacy + "/status")
            .send({ status: "Cancelled", version: 1 })
        ).status,
        200,
      );
      assert.equal(await stock(), 5);
      // Product edits use a revision shared with every stock movement.
      const currentProduct = async () =>
        (await c.execute("SELECT * FROM products WHERE id=?", [pid]))[0][0];
      const beforeEdit = await currentProduct();
      const editBody = {
        name: "  Sản phẩm đã sửa  ",
        unit_price: "250.75",
        stock_quantity: 12,
        version: beforeEdit.version,
      };
      assert.equal(
        (await staff.patch("/api/products/" + pid).send(editBody)).status,
        403,
      );
      for (const patch of [
        { name: " " },
        { unit_price: "-1" },
        { unit_price: "1.001" },
        { stock_quantity: -1 },
        { stock_quantity: 1.5 },
        { version: 0 },
        { sku: "CHANGE-SKU" },
      ]) {
        assert.equal(
          (
            await manager
              .patch("/api/products/" + pid)
              .send({ ...editBody, ...patch })
          ).status,
          400,
        );
      }
      assert.equal(
        (await manager.patch("/api/products/" + randomUUID()).send(editBody))
          .status,
        404,
      );
      const edited = await manager.patch("/api/products/" + pid).send(editBody);
      assert.equal(edited.status, 200, JSON.stringify(edited.body));
      assert.equal(edited.body.name, "Sản phẩm đã sửa");
      assert.equal(edited.body.unit_price, "250.75");
      assert.equal(Number(edited.body.stock_quantity), 12);
      assert.equal(edited.body.version, beforeEdit.version + 1);
      assert.equal(
        (await manager.patch("/api/products/" + pid).send(editBody)).status,
        409,
      );
      assert.equal(await stock(), 12);
      const [[oldOrder]] = await c.execute(
        "SELECT product_name,total_amount FROM orders WHERE id=?",
        [winning.id],
      );
      assert.equal(oldOrder.product_name, "Hàng tồn kho");
      assert.equal(oldOrder.total_amount, "100.50");
      const concurrentVersion = (await currentProduct()).version;
      const edits = await Promise.all(
        [8, 9].map((stock_quantity) =>
          manager
            .patch("/api/products/" + pid)
            .send({ ...editBody, version: concurrentVersion, stock_quantity }),
        ),
      );
      assert.deepEqual(edits.map((r) => r.status).sort(), [200, 409]);
      assert.equal(
        await stock(),
        Number(edits.find((r) => r.status === 200).body.stock_quantity),
      );
      const stale = await currentProduct();
      const ordered = await submit(1);
      assert.equal(ordered.status, 201);
      assert.equal(ordered.body.order.product_name, "Sản phẩm đã sửa");
      assert.equal(
        (
          await manager
            .patch("/api/products/" + pid)
            .send({ ...editBody, version: stale.version })
        ).status,
        409,
      );
      // Stock returning to the same count must not make an old edit valid (ABA).
      assert.equal(
        (
          await manager
            .patch("/api/orders/" + ordered.body.order.id + "/status")
            .send({ status: "Cancelled", version: 1 })
        ).status,
        200,
      );
      assert.equal(await stock(), Number(stale.stock_quantity));
      assert.equal(
        (
          await manager
            .patch("/api/products/" + pid)
            .send({ ...editBody, version: stale.version })
        ).status,
        409,
      );
      const beforeReceive = (await currentProduct()).version;
      assert.equal(
        (
          await manager
            .post("/api/products/" + pid + "/stock")
            .send({ quantity: 1 })
        ).status,
        200,
      );
      assert.equal(
        (
          await manager
            .patch("/api/products/" + pid)
            .send({ ...editBody, version: beforeReceive })
        ).status,
        409,
      );
      const raceVersion = (await currentProduct()).version;
      const race = await Promise.all([
        submit(2),
        manager
          .patch("/api/products/" + pid)
          .send({ ...editBody, version: raceVersion, stock_quantity: 7 }),
      ]);
      assert.equal(race[0].status, 201);
      assert.ok([200, 409].includes(race[1].status));
      const expected =
        race[1].status === 200 ? 5 : Number(stale.stock_quantity) - 1;
      assert.equal(await stock(), expected);
      console.log("Inventory integration checks passed in isolated schema.");
    } finally {
      await c.end();
      await pool?.end();
    }
  },
);
