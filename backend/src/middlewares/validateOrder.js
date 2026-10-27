import { z } from "zod";
import { fail } from "../utils/errors.js";
export const statuses = ["Pending", "Completed", "Cancelled"];
export const orderSchema = z
  .object({
    customer_name: z.string().trim().min(1).max(200),
    product_name: z.string().trim().min(1).max(200),
    quantity: z.number().int().min(1).max(1000000),
    total_amount: z
      .union([
        z.string().regex(/^\d{1,12}(\.\d{1,2})?$/),
        z
          .number()
          .finite()
          .min(0)
          .max(999999999999.99)
          .refine((n) => Math.abs(n * 100 - Math.round(n * 100)) < 0.001),
      ])
      .transform(String),
    status: z.enum(statuses).default("Pending"),
  })
  .strict();
export function parse(schema, data) {
  const r = schema.safeParse(data);
  if (!r.success)
    fail(
      400,
      "VALIDATION_ERROR",
      "Dữ liệu không hợp lệ: " +
        r.error.issues
          .map((i) => i.path.join(".") + " " + i.message)
          .join("; "),
    );
  return r.data;
}
export function validId(id) {
  if (!z.uuid().safeParse(id).success)
    fail(400, "INVALID_ID", "Mã định danh không hợp lệ.");
  return id;
}
export function listParams(q) {
  return parse(
    z.object({
      page: z.coerce.number().int().min(1).max(1000000).default(1),
      limit: z.coerce.number().int().min(1).max(100).default(10),
      status: z.enum(statuses).optional(),
      search: z.string().max(200).default(""),
      sort: z.enum(["asc", "desc"]).default("desc"),
    }),
    q,
  );
}
