import http from "node:http";
import dotenv from "dotenv";
import { mkdir, appendFile, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { timingSafeEqual } from "node:crypto";
dotenv.config({
  path: fileURLToPath(new URL("../.env", import.meta.url)),
  quiet: true,
});
const port = Number(process.env.MONITOR_PORT || 5001),
  host = process.env.MONITOR_HOST || "127.0.0.1";
const dir = fileURLToPath(new URL("../data/", import.meta.url)),
  logFile = dir + "incidents.jsonl";
await mkdir(dir, { recursive: true, mode: 0o700 });
let components = [],
  events = [];
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
  components = next;
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
const server = http.createServer((req, res) => {
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
  if (req.url !== "/status") {
    res.writeHead(404);
    res.end("{}");
    return;
  }
  res.end(
    JSON.stringify({
      status: "Healthy",
      checked_at: new Date().toISOString(),
      components,
      events,
    }),
  );
});
server.listen(port, host, () =>
  console.log("Monitoring listening on " + host + ":" + port),
);
for (const sig of ["SIGINT", "SIGTERM"])
  process.on(sig, () => server.close(() => process.exit(0)));
