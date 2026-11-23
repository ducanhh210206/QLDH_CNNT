import { pool } from "../config/database.js";
import { loadMonitoringWithHistory } from "./monitoringHistory.js";
import { env } from "../config/env.js";
export async function readiness() {
  const start = performance.now();
  try {
    const [schema] = await pool.query(
      "SELECT version FROM schema_migrations WHERE version='005_product_edit'",
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
let monitoringRequest;
export async function refreshMonitoringHistory() {
  if (monitoringRequest) return monitoringRequest;
  monitoringRequest = loadMonitoringWithHistory(async () => {
    const r = await fetch(env.monitor + "/status", {
      headers: { Authorization: "Bearer " + env.monitorToken },
      signal: AbortSignal.timeout(4000),
    });
    if (!r.ok) throw Error('MONITOR_UNAVAILABLE');
    return r.json();
  });
  try { return await monitoringRequest; } finally { monitoringRequest = null; }
}
export async function systemStatus() {
  const monitoring = await refreshMonitoringHistory();
  return {
    backend: await readiness(),
    monitoring,
    standby_database: monitoring.history_only ? "Unknown" : monitoring.replication?.status || "Unknown",
    ha_verified: false,
  };
}
