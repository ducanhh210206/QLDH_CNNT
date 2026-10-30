import { z } from "zod";
import { parse, orderSchema } from "../middlewares/validateOrder.js";
import * as repo from "../repositories/productRepository.js";
export const productSchema = z
  .object({
    sku: z
      .string()
      .trim()
      .min(1)
      .max(64)
      .regex(/^[A-Za-z0-9._-]+$/)
      .transform((s) => s.toUpperCase()),
    name: z.string().trim().min(1).max(200),
    unit_price: orderSchema.shape.total_amount,
    description: z.string().trim().max(1000).default(""),
  })
  .strict();
export const list = (q) =>
  repo.list(
    parse(
      z.object({
        page: z.coerce.number().int().min(1).max(1000000).default(1),
        limit: z.coerce.number().int().min(1).max(100).default(20),
        search: z.string().max(200).default(""),
      }),
      q,
    ),
  );
export const create = (body, user) =>
  repo.create(parse(productSchema, body), user);
