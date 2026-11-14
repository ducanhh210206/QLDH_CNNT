import test, { after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { app } from "../src/app.js";
import jwt from "jsonwebtoken";
import { env } from "../src/config/env.js";
import { pool } from "../src/config/database.js";
import { randomUUID } from "node:crypto";
after(() => pool.end());
test("liveness is independent of MySQL", async () => {
  const r = await request(app).get("/health/live");
  assert.equal(r.status, 200);
  assert.equal(r.body.status, "Healthy");
  assert.equal(r.headers["cache-control"], "no-store");
});
test("all business and admin routes require authentication", async () => {
  for (const route of [
    "/api/orders",
    "/api/dashboard/summary",
    "/api/admin/backups",
    "/api/admin/incidents",
    "/api/admin/system/status",
  ]) {
    const r = await request(app).get(route);
    assert.equal(r.status, 401);
    assert.equal(r.body.error.code, "UNAUTHORIZED");
  }
});
test("invalid JWT cannot access APIs", async () => {
  const r = await request(app).get("/api/orders").set("Cookie", "omdrs=forged");
  assert.equal(r.status, 401);
});

test("RPO probes require the monitor token and write only on Primary", async (t) => {
  const previous = { rpoProbeEnabled: env.rpoProbeEnabled, instance: env.instance, monitorToken: env.monitorToken };
  t.after(() => Object.assign(env, previous));
  const path = "/api/monitoring/recovery-probes";
  const id = randomUUID();
  env.rpoProbeEnabled = false;
  assert.equal((await request(app).post(path).send({ id })).status, 404);
  env.rpoProbeEnabled = true;
  env.monitorToken = "test-only-monitor-token-32-characters";
  const bearer = "Bearer " + env.monitorToken;
  assert.equal((await request(app).post(path).send({ id })).status, 401);
  env.instance = "standby";
  assert.equal((await request(app).post(path).set("Authorization", bearer).send({ id })).status, 409);
  t.mock.method(pool, "execute", async (_sql, values) => {
    assert.deepEqual(values, [id]);
    return [[{ id }]];
  });
  const checked = await request(app).post(path + "/check").set("Authorization", bearer).send({ ids: [id] });
  assert.deepEqual(checked.body, { instance: "standby", ids: [id] });
  env.instance = "primary";
  const connection = {
    beginTransaction: async () => {},
    execute: async () => {},
    commit: async () => {},
    release: () => {},
  };
  t.mock.method(pool, "getConnection", async () => connection);
  const commit = t.mock.method(connection, "commit");
  const written = await request(app).post(path).set("Authorization", bearer).send({ id });
  assert.deepEqual(written.body, { instance: "primary", id });
  assert.equal(commit.mock.callCount(), 1);
  assert.equal((await request(app).post(path + "/check").set("Authorization", bearer).send({ ids: [id] })).status, 409);
});
test("untrusted origins cannot mutate data", async () => {
  const r = await request(app)
    .post("/api/orders")
    .set("Origin", "https://evil.example")
    .send({});
  assert.equal(r.status, 403);
  assert.equal(r.body.error.code, "ORIGIN_DENIED");
});
test("malformed login payload rejected before SQL", async () => {
  const r = await request(app)
    .post("/api/auth/login")
    .send({ username: [], password: 123 });
  assert.equal(r.status, 400);
});
test("unknown route returns structured 404", async () => {
  const r = await request(app).get("/missing");
  assert.equal(r.status, 404);
  assert.ok(r.body.error.code);
  assert.ok(r.headers["x-request-id"]);
});

test("readiness returns 503 when mandatory DB dependency is unavailable", async (t) => {
  t.mock.method(pool, "query", async () => {
    throw Object.assign(new Error(), { code: "ECONNREFUSED" });
  });
  const r = await request(app).get("/health/ready");
  assert.equal(r.status, 503);
  assert.equal(r.body.database, "Unhealthy");
});
test("standby readiness verifies the expected shared MySQL server", async (t) => {
  const previous = { jwt: env.jwt, expectedDbUuid: env.expectedDbUuid, instance: env.instance };
  t.after(() => Object.assign(env, previous));
  env.jwt = "test-only-not-a-production-secret-1234567890";
  env.instance = "standby";
  env.expectedDbUuid = "aiven-test-uuid";
  t.mock.method(pool, "query", async (sql) => sql.includes("schema_migrations")
    ? [[{ version: "005_product_edit" }]] : [[{ server_uuid: "aiven-test-uuid" }]]);
  const r = await request(app).get("/health/ready");
  assert.equal(r.status, 200);
  assert.equal(r.body.shared_database_verified, true);
  assert.equal(r.body.verified_database_uuid, "aiven-test-uuid");
});
test("standby readiness refuses an unexpected MySQL server", async (t) => {
  const previous = { jwt: env.jwt, expectedDbUuid: env.expectedDbUuid, instance: env.instance };
  t.after(() => Object.assign(env, previous));
  env.jwt = "test-only-not-a-production-secret-1234567890";
  env.instance = "standby";
  env.expectedDbUuid = "aiven-test-uuid";
  t.mock.method(pool, "query", async (sql) => sql.includes("schema_migrations")
    ? [[{ version: "005_product_edit" }]] : [[{ server_uuid: "other-uuid" }]]);
  const r = await request(app).get("/health/ready");
  assert.equal(r.status, 503);
  assert.equal(r.body.database, "Unhealthy");
});
test("authenticated Staff is denied infrastructure operations", async (t) => {
  const old = env.jwt;
  env.jwt = "test-only-not-a-production-secret-1234567890";
  t.after(() => {
    env.jwt = old;
  });
  t.mock.method(pool, "execute", async () => [
    [
      {
        id: "test-staff",
        username: "staff",
        role: "Staff",
        account_status: "Active",
        permissions: null,
        access_version: 1,
      },
    ],
  ]);
  const token = jwt.sign({ sub: "test-staff", sid: "session" }, env.jwt, {
    issuer: "omdrs",
    audience: "omdrs-web",
  });
  const r = await request(app)
    .post("/api/admin/backups")
    .set("Cookie", "omdrs=" + token)
    .send({});
  assert.equal(r.status, 403);
  assert.equal(r.body.error.code, "FORBIDDEN");
});
test("authenticated order query fails with structured 503 instead of fake data", async (t) => {
  const old = env.jwt;
  env.jwt = "test-only-not-a-production-secret-1234567890";
  t.after(() => {
    env.jwt = old;
  });
  t.mock.method(pool, "execute", async (sql) => {
    if (sql.includes("auth_sessions"))
      return [
        [
          {
            id: "test-staff",
            username: "staff",
            role: "Staff",
            account_status: "Active",
            permissions: null,
            access_version: 1,
          },
        ],
      ];
    throw Object.assign(new Error(), { code: "ECONNREFUSED" });
  });
  const token = jwt.sign({ sub: "test-staff", sid: "session" }, env.jwt, {
    issuer: "omdrs",
    audience: "omdrs-web",
  });
  const r = await request(app)
    .get("/api/orders")
    .set("Cookie", "omdrs=" + token);
  assert.equal(r.status, 503);
  assert.equal(r.body.error.code, "DATABASE_UNAVAILABLE");
  assert.ok(r.body.error.request_id);
});
test("malformed JSON gets a stable client error code", async () => {
  const r = await request(app)
    .post("/api/auth/login")
    .set("Content-Type", "application/json")
    .send("{broken");
  assert.equal(r.status, 400);
  assert.equal(r.body.error.code, "INVALID_JSON");
});
