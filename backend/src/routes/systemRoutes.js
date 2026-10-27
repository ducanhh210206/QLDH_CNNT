import { Router } from "express";
import * as s from "../controllers/systemController.js";
import * as b from "../controllers/backupController.js";
import * as i from "../controllers/incidentController.js";
import { rateLimit } from "express-rate-limit";
export const adminRoutes = Router();
adminRoutes.get("/system/status", s.status);
adminRoutes.get("/system/metrics", s.metrics);
adminRoutes.get("/incidents", i.list);
adminRoutes.get("/incidents/:id", i.get);
adminRoutes.post("/simulations", i.simulate);
adminRoutes.get("/backups", b.list);
const limited = rateLimit({
  windowMs: 60000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
});
adminRoutes.post("/backups", limited, b.create);
adminRoutes.post("/restores", limited, b.restore);
adminRoutes.get("/restores/:id", b.getRestore);
