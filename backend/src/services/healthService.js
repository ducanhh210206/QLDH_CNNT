import { pool } from "../config/database.js";
import { env } from "../config/env.js";
export async function readiness() {
  const start = performance.now();
  try {
    const [schema] = await pool.query(
      "SELECT version FROM schema_migrations WHERE version='005_product_edit'",
    );
    if (!schema.length) throw Error("SCHEMA_NOT_READY");
    let sharedDatabaseVerified = false;
    if (env.expectedDbUuid) {
      const [[server]] = await pool.query("SELECT @@server_uuid AS server_uuid");
      if (String(server.server_uuid).toLowerCase() !== env.expectedDbUuid.toLowerCase())
        throw Error("UNEXPECTED_DATABASE_SERVER");
      sharedDatabaseVerified = true;
    }
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
      shared_database_verified: sharedDatabaseVerified,
      verified_database_uuid: sharedDatabaseVerified ? env.expectedDbUuid.toLowerCase() : null,
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
      signal: AbortSignal.timeout(4000),
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
    standby_database: monitoring.replication?.status || "Unknown",
    ha_verified: false,
  };
}
