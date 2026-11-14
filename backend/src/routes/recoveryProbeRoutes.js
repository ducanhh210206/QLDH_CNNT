import { timingSafeEqual } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { pool, transaction } from "../config/database.js";
import { env } from "../config/env.js";
import { parse } from "../middlewares/validateOrder.js";
import { fail } from "../utils/errors.js";

export const recoveryProbeRoutes = Router();
const probeId = z.uuid();

recoveryProbeRoutes.use((req, res, next) => {
  if (!env.rpoProbeEnabled) fail(404, "RPO_PROBE_DISABLED", "Chưa bật giao dịch kiểm chứng RPO.");
  const provided = Buffer.from(req.get("Authorization") || "");
  const expected = Buffer.from("Bearer " + env.monitorToken);
  if (env.monitorToken.length < 32 || provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    fail(401, "MONITOR_TOKEN_REQUIRED", "Cần xác thực Monitoring.");
  }
  next();
});

recoveryProbeRoutes.post("/", async (req, res) => {
  if (env.instance !== "primary") fail(409, "PRIMARY_REQUIRED", "Chỉ Primary được ghi giao dịch kiểm chứng.");
  const { id } = parse(z.object({ id: probeId }).strict(), req.body);
  await transaction(async connection => {
    await connection.execute("INSERT INTO recovery_probes (id) VALUES (?) ON DUPLICATE KEY UPDATE id = id", [id]);
    await connection.execute("DELETE FROM recovery_probes WHERE created_at < UTC_TIMESTAMP(3) - INTERVAL 7 DAY LIMIT 500");
  });
  res.json({ instance: env.instance, id });
});

recoveryProbeRoutes.post("/check", async (req, res) => {
  if (env.instance !== "standby") fail(409, "STANDBY_REQUIRED", "Cần đọc dữ liệu kiểm chứng qua Standby.");
  const { ids } = parse(z.object({ ids: z.array(probeId).min(1).max(120) }).strict(), req.body);
  const placeholders = ids.map(() => "?").join(",");
  const [rows] = await pool.execute("SELECT id FROM recovery_probes WHERE id IN (" + placeholders + ")", ids);
  res.json({ instance: env.instance, ids: rows.map(row => row.id) });
});
