import { Router } from "express";
import * as svc from "../services/productService.js";
import { permission } from "../middlewares/authMiddleware.js";
export const productRoutes = Router();
productRoutes.get("/", permission("products.read"), async (req, res) =>
  res.json(await svc.list(req.query)),
);
productRoutes.post("/", permission("products.create"), async (req, res) =>
  res.status(201).json(await svc.create(req.body, req.user.id)),
);
