import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import * as c from "../controllers/authController.js";
import * as google from "../controllers/googleAuthController.js";
import { requireAuth } from "../middlewares/authMiddleware.js";
export const authRoutes = Router();
const sensitive = rateLimit({
  windowMs: 900000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
});
authRoutes.get("/providers", google.providers);
authRoutes.post("/login", sensitive, c.login);
authRoutes.post("/register", sensitive, c.register);
authRoutes.get("/google", sensitive, google.start);
authRoutes.get("/google/callback", sensitive, google.callback);
authRoutes.get("/me", requireAuth, c.me);
authRoutes.post("/logout", requireAuth, c.logout);
