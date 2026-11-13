import http from "node:http";
import dotenv from "dotenv";
import { mkdir, appendFile, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { timingSafeEqual } from "node:crypto";
import { resolve } from "node:path";
import { activeInstance, observeIncidents, recordMilestone, recoveryMetrics } from "./recovery.js";
import { probeReplication } from "./replication.js";
dotenv.config({
  path: fileURLToPath(new URL("../.env", import.meta.url)),
  quiet: true,
});
const port = Number(process.env.MONITOR_PORT || 5001),
  host = process.env.MONITOR_HOST || "127.0.0.1";
const dir = process.env.MONITOR_DATA_DIR ? resolve(process.env.MONITOR_DATA_DIR) : fileURLToPath(new URL("../data/", import.meta.url)),
  logFile = resolve(dir, "incidents.jsonl");
const recoveryFile = resolve(dir, "recovery.jsonl");
await mkdir(dir, { recursive: true, mode: 0o700 });
let components = [],
  events = [];
let incidents = [], replication = { status: "Unknown" }, persistenceError = false, lastCheckAt = null;
try {
  const lines = (await readFile(recoveryFile, "utf8")).trim().split("\n").filter(Boolean);
  for (const line of lines) {
    const record = JSON.parse(line);
    incidents = [record, ...incidents.filter((i) => i.id !== record.id)].slice(0, 100);
  }
} catch (e) { if (e.code !== "ENOENT") persistenceError = true; }
let writes = Promise.resolve();
function exclusive(fn) {
  const result = writes.then(fn);
  writes = result.catch(() => {});
  return result;
}
async function persist(next) {
  for (const item of next) {
    if (JSON.stringify(item) !== JSON.stringify(incidents.find((i) => i.id === item.id)))
      await appendFile(recoveryFile, JSON.stringify(item) + "\n", { mode: 0o600 });
  }
  incidents = next;
}
try {
  events = (await readFile(logFile, "utf8"))
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l))
    .slice(-100);
} catch {}
const targets = [
  ["Backend Primary", process.env.PRIMARY_URL || "http://127.0.0.1:5000"],
  ["Backend Standby", process.env.STANDBY_URL],
  ["API Gateway", process.env.GATEWAY_URL],
];
async function check() {
  const next = await Promise.all(
    targets.map(async ([name, url]) => {
      if (!url) return { name, status: "Not Configured" };
      const start = performance.now();
      try {
        const r = await fetch(url + "/health/ready", {
          signal: AbortSignal.timeout(4000),
        });
        const body = await r.json();
        return {
          name,
          status: r.ok && body.status === "Healthy" ? "Healthy" : "Unhealthy",
          database: body.database || "Unknown",
          instance: body.instance || null,
          latency_ms: Math.round(performance.now() - start),
          checked_at: new Date().toISOString(),
        };
      } catch {
        return {
          name,
          status: "Offline",
          database: "Unknown",
          checked_at: new Date().toISOString(),
        };
      }
    }),
  );
  for (const item of next) {
    const previous = components.find((c) => c.name === item.name);
    if (item.status !== "Not Configured" && previous?.status !== item.status) {
      const event = {
        id: crypto.randomUUID(),
        type: "Health transition",
        mode: "Live",
        component: item.name,
        from: previous?.status || "Unknown",
        status: item.status,
        created_at: new Date().toISOString(),
      };
      events.push(event);
      events = events.slice(-100);
      await appendFile(logFile, JSON.stringify(event) + "\n", { mode: 0o600 });
    }
  }
  await exclusive(async () => {
    const updated = observeIncidents(structuredClone(incidents), components, next, new Date().toISOString());
    try { await persist(updated); } catch { persistenceError = true; }
    components = next;
  });
  replication = await probeReplication();
  lastCheckAt = new Date().toISOString();
}
await check();
let running = false;
setInterval(
  async () => {
    if (running) return;
    running = true;
    try {
      await check();
    } catch {
      console.error("monitor_write_failed");
    } finally {
      running = false;
    }
  },
  Math.max(5000, Number(process.env.MONITOR_INTERVAL_MS || 10000)),
).unref();
const server = http.createServer(async (req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  if (req.url === "/health/live") {
    res.end(JSON.stringify({ status: "Healthy" }));
    return;
  }
  const secret = process.env.MONITOR_TOKEN || "",
    provided = req.headers.authorization || "",
    expected = "Bearer " + secret;
  if (
    secret.length < 32 ||
    Buffer.byteLength(provided) !== Buffer.byteLength(expected) ||
    !timingSafeEqual(Buffer.from(provided), Buffer.from(expected))
  ) {
    res.writeHead(401);
    res.end(
      JSON.stringify({ error: "Unauthorized or MONITOR_TOKEN not configured" }),
    );
    return;
  }
  const milestone = req.url?.match(/^\/incidents\/([a-f0-9-]{36})\/milestones$/i);
  if (req.method === "POST" && milestone) {
    try {
      let body = "";
      for await (const chunk of req) {
        body += chunk;
        if (Buffer.byteLength(body) > 4096) throw new Error("Nội dung quá dài.");
      }
      const input = JSON.parse(body);
      await exclusive(async () => {
        const current = incidents.find((i) => i.id === milestone[1]);
        if (!current) throw new Error("Không tìm thấy sự cố.");
        const changed = recordMilestone(current, input);
        await persist(incidents.map((i) => i.id === changed.id ? changed : i));
      });
      res.end(JSON.stringify({ status: "Saved" }));
    } catch { res.writeHead(400); res.end(JSON.stringify({ error: "Không lưu được mốc: kiểm tra thời gian, thứ tự các bước, ghi chú và quyền ghi nhật ký." })); }
    return;
  }
  if (req.url !== "/status" || req.method !== "GET") {
    res.writeHead(404);
    res.end("{}");
    return;
  }
  res.end(
    JSON.stringify({
      status: "Healthy",
      server_time: new Date().toISOString(),
      checked_at: lastCheckAt,
      components,
      events,
      active_instance: activeInstance(components),
      replication,
      incidents: incidents.map((i) => ({ ...i, metrics: recoveryMetrics(i) })),
      persistence_error: persistenceError,
      poll_interval_ms: Math.max(5000, Number(process.env.MONITOR_INTERVAL_MS || 10000)),
    }),
  );
});
server.listen(port, host, () =>
  console.log("Monitoring listening on " + host + ":" + port),
);
for (const sig of ["SIGINT", "SIGTERM"])
  process.on(sig, () => server.close(() => process.exit(0)));
