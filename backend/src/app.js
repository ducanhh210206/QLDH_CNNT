import express from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import { rateLimit } from "express-rate-limit";
import { randomUUID } from "node:crypto";
import { env } from "./config/env.js";
import { errorHandler } from "./middlewares/errorHandler.js";
import { requireAuth, admin } from "./middlewares/authMiddleware.js";
import { authRoutes } from "./routes/authRoutes.js";
import { orderRoutes } from "./routes/orderRoutes.js";
import { adminRoutes } from "./routes/systemRoutes.js";
import * as order from "./controllers/orderController.js";
import { readiness } from "./services/healthService.js";
export const app = express();
app.disable("x-powered-by");
app.use(helmet());
app.use((req, res, next) => {
  req.requestId = randomUUID();
  res.set("X-Request-Id", req.requestId);
  res.set("Cache-Control", "no-store");
  next();
});
app.use(
  cors({
    origin(origin, cb) {
      cb(null, !origin || env.origins.includes(origin));
    },
    credentials: true,
  }),
);
app.use((req, res, next) => {
  if (
    !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
    req.get("Origin") &&
    !env.origins.includes(req.get("Origin"))
  )
    return res
      .status(403)
      .json({
        error: {
          code: "ORIGIN_DENIED",
          message: "Nguồn truy cập không được phép.",
        },
      });
  next();
});
app.use(express.json({ limit: "32kb" }));
app.use(cookieParser());
app.get("/health/live", (req, res) =>
  res.json({
    status: "Healthy",
    instance: env.instance,
    checked_at: new Date().toISOString(),
  }),
);
app.get("/health/ready", async (req, res) => {
  const result = await readiness();
  res.status(result.status === "Healthy" ? 200 : 503).json(result);
});
app.use(
  "/api",
  rateLimit({
    windowMs: 60000,
    limit: 300,
    standardHeaders: true,
    legacyHeaders: false,
  }),
);
app.use("/api/auth", authRoutes);
app.use("/api/orders", requireAuth, orderRoutes);
app.get("/api/dashboard/summary", requireAuth, order.summary);
app.get("/api/dashboard/order-statistics", requireAuth, order.statistics);
app.use("/api/admin", requireAuth, admin, adminRoutes);
app.use((req, res) =>
  res
    .status(404)
    .json({ error: { code: "NOT_FOUND", message: "Không tìm thấy API." } }),
);
app.use(errorHandler);
