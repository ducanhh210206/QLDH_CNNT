import { systemStatus } from "../services/healthService.js";
export const status = async (req, res) => res.json(await systemStatus());
export const metrics = (req, res) =>
  res.json({
    uptime_seconds: process.uptime(),
    memory_bytes: process.memoryUsage().rss,
    checked_at: new Date().toISOString(),
  });
