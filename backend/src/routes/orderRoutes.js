import { Router } from "express";
import * as c from "../controllers/orderController.js";
import { permission } from "../middlewares/authMiddleware.js";
export const orderRoutes = Router();
orderRoutes.get("/", permission("orders.read"), c.list);
orderRoutes.post("/", permission("orders.create"), c.create);
orderRoutes.get("/:id", permission("orders.read"), c.get);
orderRoutes.patch("/:id/status", permission("orders.update"), c.update);
orderRoutes.get("/:id/history", permission("transactions.read"), c.history);
