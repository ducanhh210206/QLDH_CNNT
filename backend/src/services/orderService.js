import * as repo from "../repositories/orderRepository.js";
import {
  orderSchema,
  parse,
  validId,
  listParams,
} from "../middlewares/validateOrder.js";
import { fail } from "../utils/errors.js";
import { z } from "zod";
export const list = (q) => repo.list(listParams(q));
export async function get(id) {
  const order = await repo.get(validId(id));
  if (!order) fail(404, "NOT_FOUND", "Không tìm thấy đơn hàng.");
  return order;
}
export function create(body, uid, key) {
  if (typeof key !== "string" || !/^[-a-zA-Z0-9]{16,100}$/.test(key))
    fail(
      400,
      "IDEMPOTENCY_REQUIRED",
      "Cần Idempotency-Key hợp lệ (16–100 ký tự).",
    );
  return repo.create(parse(orderSchema, body), uid, key);
}
export function update(id, body, uid) {
  validId(id);
  const data = parse(
    z
      .object({
        status: z.enum(["Completed", "Cancelled"]),
        version: z.number().int().positive(),
      })
      .strict(),
    body,
  );
  return repo.updateStatus(id, data.status, data.version, uid);
}
export async function history(id) {
  await get(id);
  return repo.history(id);
}
export const summary = repo.summary;
export const statistics = repo.statistics;
