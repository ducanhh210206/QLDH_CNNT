import { Router } from "express";
import * as c from "../controllers/userController.js";
export const userRoutes = Router();
userRoutes.get("/", c.list);
userRoutes.post("/", c.createStaff);
userRoutes.get("/permissions", c.permissions);
userRoutes.patch("/:id/access", c.review);
userRoutes.get("/:id/history", c.history);
