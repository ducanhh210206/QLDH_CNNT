import test, { after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import jwt from "jsonwebtoken";
import { randomUUID } from "node:crypto";
import { app } from "../src/app.js";
import { env } from "../src/config/env.js";
import { pool } from "../src/config/database.js";
after(() => pool.end());
const staff = {
  id: randomUUID(),
  username: "staff",
  role: "Staff",
  account_status: "Active",
  permissions: [],
  access_version: 1,
};
function setup(t, user = staff) {
  const previous = env.jwt;
  env.jwt = "notification-unit-test-only-secret-1234567890";
  t.after(() => (env.jwt = previous));
  const queries = [];
  t.mock.method(pool, "execute", async (sql, args) => {
    queries.push({ sql, args });
    if (sql.includes("auth_sessions")) return [[user]];
    assert.ok(sql.includes("user_access_history"));
    if (user.role === "Staff") {
      assert.match(sql, /AND user_id=\?/);
      assert.deepEqual(args, [user.id]);
    }
    return [
      [
        {
          id: 1,
          after_access: { full_name: "Employee", account_status: "Active" },
          created_at: "2026-11-02 10:00:00.000",
        },
      ],
    ];
  });
  t.mock.method(pool, "query", async (sql, args) => {
    queries.push({ sql, args });
    if (sql.startsWith("INSERT IGNORE")) return [{ affectedRows: 1 }];
    if (sql.includes("notification_reads")) {
      assert.equal(args[0], user.id);
      return [[]];
    }
    if (user.role === "Staff")
      assert.ok(user.permissions.includes("orders.read"));
    if (sql.includes("order_status_history"))
      return [
        [
          {
            id: 4,
            order_id: randomUUID(),
            old_status: null,
            new_status: "Pending",
            created_at: "2026-11-02 10:01:00.000",
          },
        ],
      ];
    if (sql.includes("FROM users"))
      return [
        [
          {
            id: randomUUID(),
            username: "pending_staff",
            account_status: "Pending",
            created_at: "2026-11-02 10:02:00.000",
          },
        ],
      ];
    if (sql.includes("backup_records"))
      return [
        [
          {
            id: randomUUID(),
            status: "Failed",
            created_at: "2026-11-02 10:03:00.000",
          },
        ],
      ];
    return [[]];
  });
  const token = jwt.sign({ sub: user.id, sid: randomUUID() }, env.jwt, {
    issuer: "omdrs",
    audience: "omdrs-web",
  });
  return { cookie: "omdrs=" + token, queries };
}
test("notification endpoints require authentication", async () => {
  assert.equal((await request(app).get("/api/notifications")).status, 401);
  assert.equal(
    (await request(app).post("/api/notifications/read-all").send({})).status,
    401,
  );
});
test("Staff without order permission sees only own access notices, no management data", async (t) => {
  const { cookie, queries } = setup(t);
  const r = await request(app).get("/api/notifications").set("Cookie", cookie);
  assert.equal(r.status, 200);
  assert.equal(r.body.unread_count, 1);
  assert.deepEqual(
    r.body.data.map((row) => row.type),
    ["access"],
  );
  assert.equal(r.body.data[0].page, "settings");
  assert.equal(
    queries
      .filter((row) => !row.sql.includes("auth_sessions"))
      .some((row) =>
        /backup_records|restore_records|FROM users|order_status_history/.test(
          row.sql,
        ),
      ),
    false,
  );
});
test("order notices require read permission and managers can see pending accounts and failed backups", async (t) => {
  const { cookie } = setup(t, { ...staff, role: "Admin" });
  const r = await request(app)
    .get("/api/notifications?limit=2")
    .set("Cookie", cookie);
  assert.equal(r.status, 200);
  assert.equal(r.body.total, 4);
  assert.equal(r.body.data.length, 2);
  assert.equal(r.body.data[0].type, "warning");
  assert.equal(r.body.data[1].page, "users");
  assert.equal(r.body.data[1].filter_status, "Pending");
});
test("read receipts cannot target another user or unseen event", async (t) => {
  const { cookie, queries } = setup(t);
  assert.equal(
    (
      await request(app)
        .post("/api/notifications/order:999/read")
        .set("Cookie", cookie)
        .send({})
    ).status,
    404,
  );
  assert.equal(
    (
      await request(app)
        .post("/api/notifications/access:1/read")
        .set("Cookie", cookie)
        .send({ user_id: randomUUID() })
    ).status,
    400,
  );
  assert.equal(queries.filter((row) => row.sql.startsWith("INSERT")).length, 0);
  assert.equal(
    (
      await request(app)
        .post("/api/notifications/access:1/read")
        .set("Cookie", cookie)
        .send({})
    ).status,
    204,
  );
  const inserted = queries.find((row) => row.sql.startsWith("INSERT"));
  assert.deepEqual(inserted.args, [[[staff.id, "access:1"]]]);
});
test("notification pagination and event identifiers reject malformed input", async (t) => {
  const { cookie } = setup(t);
  for (const path of [
    "/api/notifications?limit=1000",
    "/api/notifications?limit=0",
    "/api/notifications?user_id=other",
  ])
    assert.equal(
      (await request(app).get(path).set("Cookie", cookie)).status,
      400,
    );
  assert.equal(
    (
      await request(app)
        .post("/api/notifications/unknown/read")
        .set("Cookie", cookie)
        .send({})
    ).status,
    400,
  );
});
