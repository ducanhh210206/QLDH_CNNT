import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import express from "express";
import request from "supertest";
import { databaseTls } from "../src/config/databaseTls.js";
import { mountFrontend } from "../src/utils/serveFrontend.js";

test("cloud database TLS verifies certificate and hostname, fails for missing CA", async () => {
  assert.deepEqual(databaseTls({}), {});
  assert.equal(databaseTls({ DB_SSL: "true" }).ssl.rejectUnauthorized, true);
  assert.equal(databaseTls({ DB_SSL: "true" }).ssl.verifyIdentity, true);
  assert.throws(() =>
    databaseTls({
      DB_SSL: "true",
      DB_SSL_CA_FILE: "/nonexistent/omdrs-ca.pem",
    }),
  );
  const dir = await mkdtemp(join(tmpdir(), "omdrs-tls-"));
  try {
    const file = join(dir, "ca.pem");
    await writeFile(file, "fixture CA contents");
    assert.equal(
      databaseTls({ DB_SSL: "true", DB_SSL_CA_FILE: file }).ssl.ca,
      "fixture CA contents",
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("same-origin hosting serves the build without swallowing API or private paths", async () => {
  const dir = await mkdtemp(join(tmpdir(), "omdrs-frontend-"));
  try {
    await writeFile(
      join(dir, "index.html"),
      "<!doctype html><div>test frontend</div>",
    );
    await writeFile(join(dir, "bundle.js"), "console.log('fixture');");
    await writeFile(join(dir, ".env"), "must not be served");
    await mkdir(join(dir, "api"));
    await writeFile(join(dir, "api", "secret.txt"), "must not be served");
    const app = express();
    mountFrontend(app, dir);
    app.use((req, res) => res.status(404).json({ error: "NOT_FOUND" }));
    for (const path of ["/", "/orders/123"]) {
      const r = await request(app).get(path);
      assert.equal(r.status, 200);
      assert.match(r.text, /test frontend/);
    }
    assert.equal((await request(app).get("/bundle.js")).status, 200);
    for (const path of [
      "/api/unknown",
      "/api/secret.txt",
      "/health/unknown",
      "/missing.js",
      "/.env",
      "/.hidden/route",
    ]) {
      const r = await request(app).get(path);
      assert.equal(r.status, 404, path);
      assert.equal(r.body.error, "NOT_FOUND");
    }
    assert.equal((await request(app).post("/orders/123")).status, 404);
    assert.throws(
      () => mountFrontend(express(), join(dir, "missing")),
      /FRONTEND_BUILD_MISSING/,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("Render URL configures same-origin CORS and Google callback without local addresses", () => {
  const script = `import {env} from './src/config/env.js'; console.log(JSON.stringify({origins:env.origins,google:env.google.redirectUri,frontend:env.google.frontendUrl,proxy:env.trustProxy}));`;
  const result = execFileSync(
    process.execPath,
    ["--input-type=module", "-e", script],
    {
      cwd: new URL("..", import.meta.url),
      encoding: "utf8",
      env: {
        ...process.env,
        RENDER_EXTERNAL_URL: "https://test-omdrs.onrender.com",
        FRONTEND_URL: "",
        CORS_ORIGINS: "",
        GOOGLE_REDIRECT_URI: "",
        DB_SSL: "false",
        TRUST_PROXY_HOPS: "1",
      },
    },
  );
  const data = JSON.parse(result);
  assert.deepEqual(data.origins, ["https://test-omdrs.onrender.com"]);
  assert.equal(data.frontend, "https://test-omdrs.onrender.com");
  assert.equal(
    data.google,
    "https://test-omdrs.onrender.com/api/auth/google/callback",
  );
  assert.equal(data.proxy, 1);
});
