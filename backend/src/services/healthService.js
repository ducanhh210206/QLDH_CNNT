import { pool } from "../config/database.js";
import { env } from "../config/env.js";
export async function readiness() {
  const start = performance.now();
  try {
    const [schema] = await pool.query(
      "SELECT version FROM schema_migrations WHERE version='001_initial'",
    );
    if (!schema.length) throw Error("SCHEMA_NOT_READY");
    if (env.jwt.length < 32)
      return {
        status: "Degraded",
        database: "Healthy",
        authentication: "Not Configured",
        instance: env.instance,
        checked_at: new Date().toISOString(),
      };
    return {
      status: "Healthy",
      database: "Healthy",
      instance: env.instance,
      latency_ms: Math.round(performance.now() - start),
      checked_at: new Date().toISOString(),
    };
  } catch {
    return {
      status: "Unhealthy",
      database: "Unhealthy",
      instance: env.instance,
      latency_ms: Math.round(performance.now() - start),
      checked_at: new Date().toISOString(),
    };
  }
}
export async function systemStatus() {
  let monitoring;
  try {
    const r = await fetch(env.monitor + "/status", {
      headers: { Authorization: "Bearer " + env.monitorToken },
      signal: AbortSignal.timeout(3000),
    });
    if (!r.ok) throw Error();
    monitoring = await r.json();
  } catch {
    monitoring = {
      status: "Unknown",
      components: [],
      events: [],
      message: "Không kết nối được dịch vụ giám sát độc lập.",
    };
  }
  return {
    backend: await readiness(),
    monitoring,
    standby_database: "Not Configured",
    ha_verified: false,
  };
}
