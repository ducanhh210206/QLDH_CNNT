import { systemStatus } from "../services/healthService.js";
import { env } from "../config/env.js";
import { z } from "zod";
import { parse, validId } from "../middlewares/validateOrder.js";
import { fail } from "../utils/errors.js";
export const status = async (req, res) => res.json(await systemStatus());
export const metrics = (req, res) =>
  res.json({
    uptime_seconds: process.uptime(),
    memory_bytes: process.memoryUsage().rss,
    checked_at: new Date().toISOString(),
  });
export const milestone = async (req, res) => {
  const id = validId(req.params.id);
  const body = parse(z.object({
    stage: z.enum(["fault_started", "failover_started", "standby_active", "recovered"]),
    at: z.iso.datetime(), note: z.string().trim().min(1).max(500),
    verified_data_at: z.iso.datetime().optional(),
  }).strict(), req.body);
  let response;
  try {
    response = await fetch(env.monitor + "/incidents/" + id + "/milestones", {
      method: "POST", headers: { Authorization: "Bearer " + env.monitorToken, "Content-Type": "application/json" },
      body: JSON.stringify(body), signal: AbortSignal.timeout(4000),
    });
  } catch { fail(503, "MONITOR_UNAVAILABLE", "Không kết nối được Monitoring để lưu mốc thời gian."); }
  if (!response.ok) fail(400, "INVALID_MILESTONE", "Không lưu được mốc. Kiểm tra thứ tự thời gian; mốc đã lưu không thể ghi đè.");
  res.json({ status: "Saved" });
};
