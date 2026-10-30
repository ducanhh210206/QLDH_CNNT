import test, { after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import jwt from "jsonwebtoken";
import { randomUUID, createHash } from "node:crypto";
import { app } from "../src/app.js";
import { pool } from "../src/config/database.js";
import { env } from "../src/config/env.js";
import { permissionsFor, publicUser } from "../src/config/permissions.js";
import {
  hashPassword,
  registrationSchema,
} from "../src/services/authService.js";
import { productSchema } from "../src/services/productService.js";
import { parse } from "../src/middlewares/validateOrder.js";
import {
  beginGoogle,
  readOAuthState,
  validateGoogleClaims,
} from "../src/services/googleAuthService.js";
after(() => pool.end());
function setup(t, user) {
  const previous = env.jwt;
  env.jwt = "test-access-secret-not-for-production-123456789";
  t.after(() => {
    env.jwt = previous;
  });
  t.mock.method(pool, "execute", async () => [[user]]);
  return jwt.sign({ sub: user.id, sid: randomUUID() }, env.jwt, {
    issuer: "omdrs",
    audience: "omdrs-web",
  });
}
const staff = {
  id: "550e8400-e29b-41d4-a716-446655440000",
  username: "staff",
  role: "Staff",
  account_status: "Active",
  permissions: ["products.read"],
  access_version: 1,
};
test("Staff permissions cannot include infrastructure access", () => {
  assert.equal(
    permissionsFor({
      ...staff,
      permissions: ["backups.manage", "users.manage", "products.read"],
    }).includes("backups.manage"),
    false,
  );
  assert.deepEqual(
    permissionsFor({ ...staff, permissions: "invalid-json" }),
    [],
  );
  assert.ok(
    permissionsFor({ ...staff, permissions: null }).includes("orders.create"),
  );
  const visible = publicUser({
    ...staff,
    password_hash: "private",
    google_sub: "private",
  });
  assert.equal(visible.password_hash, undefined);
  assert.equal(visible.google_sub, undefined);
});
test("registration rejects caller-supplied role/status/permissions", () => {
  const base = {
    username: "newstaff",
    full_name: "Nhân viên",
    email: "NEW@example.com",
    password: "strong-password-123",
  };
  assert.equal(parse(registrationSchema, base).email, "new@example.com");
  for (const patch of [
    { role: "Admin" },
    { account_status: "Active" },
    { permissions: ["backups.manage"] },
  ])
    assert.throws(
      () => parse(registrationSchema, { ...base, ...patch }),
      (e) => e.status === 400,
    );
});
test("registration stores Pending Staff and does not create a session", async (t) => {
  const previous = env.jwt;
  env.jwt = "registration-test-secret-1234567890123456789";
  t.after(() => (env.jwt = previous));
  const calls = [];
  t.mock.method(pool, "execute", async (sql, args) => {
    calls.push({ sql, args });
    return [{ affectedRows: 1 }];
  });
  const r = await request(app).post("/api/auth/register").send({
    username: "freshstaff",
    full_name: "Nhân viên mới",
    email: "fresh@example.com",
    password: "strong-password-123",
  });
  assert.equal(r.status, 201);
  assert.equal(r.body.account_status, "Pending");
  assert.equal(r.headers["set-cookie"], undefined);
  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /'Staff','Pending'/);
  assert.equal(calls[0].args.at(-1), "[]");
  assert.notEqual(calls[0].args[4], "strong-password-123");
});
test("pending account with correct password cannot sign in", async (t) => {
  const previous = env.jwt;
  env.jwt = "pending-test-secret-1234567890123456789012";
  t.after(() => (env.jwt = previous));
  const hashed = await hashPassword("correct-password-123");
  let writes = 0;
  t.mock.method(pool, "execute", async (sql) => {
    if (sql.startsWith("SELECT * FROM users"))
      return [[{ ...staff, account_status: "Pending", password_hash: hashed }]];
    writes++;
    return [{ affectedRows: 1 }];
  });
  const r = await request(app)
    .post("/api/auth/login")
    .send({ username: "staff", password: "correct-password-123" });
  assert.equal(r.status, 403);
  assert.equal(r.body.error.code, "PENDING_APPROVAL");
  assert.equal(writes, 0);
  assert.equal(r.headers["set-cookie"], undefined);
});
test("Staff without assigned permissions is denied API operations, not just hidden UI", async (t) => {
  const token = setup(t, staff);
  for (const [method, path] of [
    ["get", "/api/dashboard/summary"],
    ["get", "/api/transactions"],
    ["post", "/api/products"],
    ["post", "/api/orders"],
    ["get", "/api/admin/users"],
    ["post", "/api/admin/users"],
    ["post", "/api/admin/backups"],
  ]) {
    const r = await request(app)
      [method](path)
      .set("Cookie", "omdrs=" + token)
      .send({});
    assert.equal(r.status, 403, path);
  }
});
test("suspended account cannot use an old JWT", async (t) => {
  const token = setup(t, { ...staff, account_status: "Suspended" });
  const r = await request(app)
    .get("/api/products")
    .set("Cookie", "omdrs=" + token);
  assert.equal(r.status, 401);
});
test("manager cannot change own role or status", async (t) => {
  const manager = { ...staff, role: "Admin" };
  const token = setup(t, manager);
  let rolledBack = false;
  const c = {
    beginTransaction: async () => {},
    commit: async () => {},
    rollback: async () => {
      rolledBack = true;
    },
    release: () => {},
    execute: async (sql) =>
      sql.includes("schema_migrations")
        ? [[{ version: "002_user_access" }]]
        : [[manager]],
  };
  t.mock.method(pool, "getConnection", async () => c);
  const r = await request(app)
    .patch("/api/admin/users/" + manager.id + "/access")
    .set("Cookie", "omdrs=" + token)
    .send({
      version: 1,
      role: "Staff",
      account_status: "Suspended",
      permissions: [],
      note: "test",
    });
  assert.equal(r.status, 409);
  assert.equal(r.body.error.code, "SELF_ACCESS_CHANGE");
  assert.ok(rolledBack);
});
test("manager cannot grant infrastructure permissions to Staff through body", async (t) => {
  const token = setup(t, { ...staff, role: "Admin" });
  const r = await request(app)
    .patch("/api/admin/users/" + randomUUID() + "/access")
    .set("Cookie", "omdrs=" + token)
    .send({
      version: 1,
      role: "Staff",
      account_status: "Active",
      permissions: ["backups.manage"],
      note: "",
    });
  assert.equal(r.status, 400);
});
test("product validation preserves decimal values and rejects malformed SKU", () => {
  assert.equal(
    parse(productSchema, {
      sku: "sp-1",
      name: "Sản phẩm",
      unit_price: "1200.50",
    }).sku,
    "SP-1",
  );
  assert.throws(() =>
    parse(productSchema, { sku: "bad sku", name: "X", unit_price: "0" }),
  );
  assert.throws(() =>
    parse(productSchema, { sku: "SP1", name: "X", unit_price: "1.001" }),
  );
});
test("Google button status is explicit when OAuth is not configured", async (t) => {
  const previous = env.google;
  env.google = { ...previous, clientId: "", clientSecret: "" };
  t.after(() => (env.google = previous));
  const r = await request(app).get("/api/auth/providers");
  assert.equal(r.status, 200);
  assert.equal(r.body.google.enabled, false);
});
test("Google OAuth uses state, nonce, PKCE and a signed HttpOnly-compatible state token", async (t) => {
  const previous = { jwt: env.jwt, google: env.google };
  env.jwt = "oauth-unit-secret-1234567890123456789012345";
  env.google = {
    clientId: "test.apps.googleusercontent.com",
    clientSecret: "test-only-secret",
    redirectUri: "http://127.0.0.1:5173/api/auth/google/callback",
    frontendUrl: "http://127.0.0.1:5173",
  };
  t.after(() => Object.assign(env, previous));
  t.mock.method(pool, "execute", async () => [{ affectedRows: 1 }]);
  const result = await beginGoogle();
  const url = new URL(result.url);
  assert.equal(url.origin, "https://accounts.google.com");
  const state = readOAuthState(result.cookie, url.searchParams.get("state"));
  assert.equal(url.searchParams.get("nonce"), state.nonce);
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.equal(
    url.searchParams.get("code_challenge"),
    createHash("sha256").update(state.verifier).digest("base64url"),
  );
  assert.throws(
    () => readOAuthState(result.cookie, "forged"),
    (e) => e.code === "OAUTH_STATE_INVALID",
  );
  assert.throws(
    () => readOAuthState("forged", state.state),
    (e) => e.code === "OAUTH_STATE_INVALID",
  );
});
test("Google identity requires matching nonce and a verified email", () => {
  const valid = {
    sub: "google-sub",
    email: "USER@gmail.com",
    email_verified: true,
    nonce: "nonce",
    name: "Người dùng",
  };
  assert.equal(validateGoogleClaims(valid, "nonce").email, "user@gmail.com");
  assert.throws(() =>
    validateGoogleClaims({ ...valid, nonce: "attacker" }, "nonce"),
  );
  assert.throws(() =>
    validateGoogleClaims({ ...valid, email_verified: false }, "nonce"),
  );
});

test("create permission cannot bypass status-update permission", async (t) => {
  const token = setup(t, {
    ...staff,
    permissions: ["orders.read", "orders.create"],
  });
  const r = await request(app)
    .post("/api/orders")
    .set("Cookie", "omdrs=" + token)
    .set("Idempotency-Key", randomUUID())
    .send({
      customer_name: "X",
      product_name: "Y",
      quantity: 1,
      total_amount: "10",
      status: "Completed",
    });
  assert.equal(r.status, 403);
});

test("manager creation rejects role escalation, invalid password and permission dependencies", async (t) => {
  const token = setup(t, { ...staff, role: "Admin" });
  const body = {
    username: "issuedstaff",
    full_name: "Nhân viên được cấp",
    email: "issued@example.com",
    password: "issued-password-123",
    permissions: ["products.read"],
  };
  for (const patch of [
    { role: "Admin" },
    { account_status: "Active" },
    { password: "short" },
    { permissions: ["users.manage"] },
    { permissions: ["orders.create"] },
  ]) {
    const r = await request(app)
      .post("/api/admin/users")
      .set("Cookie", "omdrs=" + token)
      .send({ ...body, ...patch });
    assert.equal(r.status, 400);
  }
});
test("revoked manager cannot issue a new staff account after authorization races", async (t) => {
  const token = setup(t, { ...staff, role: "Admin" });
  let inserts = 0,
    rolledBack = false;
  t.mock.method(pool, "getConnection", async () => ({
    beginTransaction: async () => {},
    commit: async () => {},
    rollback: async () => {
      rolledBack = true;
    },
    release: () => {},
    execute: async (sql) => {
      if (sql.startsWith("INSERT")) inserts++;
      return sql.includes("schema_migrations")
        ? [[{ version: "002_user_access" }]]
        : [[staff]];
    },
  }));
  const r = await request(app)
    .post("/api/admin/users")
    .set("Cookie", "omdrs=" + token)
    .send({
      username: "issuedstaff",
      full_name: "Nhân viên",
      email: "issued@example.com",
      password: "issued-password-123",
      permissions: ["products.read"],
    });
  assert.equal(r.status, 403);
  assert.equal(inserts, 0);
  assert.ok(rolledBack);
});
