import { Router } from "express";
import * as c from "../controllers/orderController.js";
import { permission } from "../middlewares/authMiddleware.js";
import { orderOptions } from "../services/productService.js";
export const orderRoutes = Router();
orderRoutes.get("/", permission("orders.read"), c.list);
orderRoutes.post("/", permission("orders.create"), c.create);
orderRoutes.get("/products", permission("orders.create"), async (req, res) =>
  res.json(await orderOptions(req.query)),
);
orderRoutes.get("/:id", permission("orders.read"), c.get);
orderRoutes.patch("/:id/status", permission("orders.update"), c.update);
orderRoutes.get("/:id/history", permission("transactions.read"), c.history);
