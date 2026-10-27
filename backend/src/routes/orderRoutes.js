import { Router } from "express";
import * as c from "../controllers/orderController.js";
export const orderRoutes = Router();
orderRoutes.get("/", c.list);
orderRoutes.post("/", c.create);
orderRoutes.get("/:id", c.get);
orderRoutes.patch("/:id/status", c.update);
orderRoutes.get("/:id/history", c.history);
