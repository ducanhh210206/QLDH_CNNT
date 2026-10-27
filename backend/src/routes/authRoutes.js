import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import * as c from "../controllers/authController.js";
import { requireAuth } from "../middlewares/authMiddleware.js";
export const authRoutes = Router();
authRoutes.post(
  "/login",
  rateLimit({
    windowMs: 900000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
  }),
  c.login,
);
authRoutes.get("/me", requireAuth, c.me);
authRoutes.post("/logout", requireAuth, c.logout);
