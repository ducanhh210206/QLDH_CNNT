import { z } from "zod";
import { parse, orderSchema, validId } from "../middlewares/validateOrder.js";
import * as repo from "../repositories/productRepository.js";
export const productSchema = z
  .object({
    sku: z
      .string()
      .trim()
      .min(1)
      .max(64)
      .regex(/^[A-Za-z0-9._-]+$/)
      .transform((s) => s.toUpperCase())
      .optional(),
    name: z.string().trim().min(1).max(200),
    unit_price: orderSchema.shape.total_amount,
    stock_quantity: z.number().int().min(0).max(1000000000),
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

export const addStock = (id, body) =>
  repo.addStock(
    validId(id),
    parse(
      z.object({ quantity: z.number().int().min(1).max(1000000000) }).strict(),
      body,
    ).quantity,
  );
export const orderOptions = (q) =>
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

export const productEditSchema = productSchema
  .pick({ name: true, unit_price: true, stock_quantity: true })
  .extend({ version: z.number().int().min(1).max(4294967295) })
  .strict();
export const update = (id, body) =>
  repo.update(validId(id), parse(productEditSchema, body));
