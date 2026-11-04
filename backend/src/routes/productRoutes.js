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

productRoutes.post(
  "/:id/stock",
  permission("products.create"),
  async (req, res) => res.json(await svc.addStock(req.params.id, req.body)),
);

productRoutes.patch("/:id", permission("products.create"), async (req, res) =>
  res.json(await svc.update(req.params.id, req.body)),
);

productRoutes.delete("/:id", permission("products.create"), async (req, res) => {
  await svc.remove(req.params.id, req.body);
  res.status(204).end();
});
