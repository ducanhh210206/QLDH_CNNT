import { Router } from "express";
import { z } from "zod";
import { parse } from "../middlewares/validateOrder.js";
import { feed, markRead } from "../repositories/notificationRepository.js";

export const notificationRoutes = Router();
notificationRoutes.get("/", async (req, res) => {
  const q = parse(
    z
      .object({
        limit: z.coerce.number().int().min(1).max(100).default(20),
        page: z.coerce.number().int().min(1).max(5).default(1),
      })
      .strict(),
    req.query,
  );
  const events = await feed(req.user);
  res.json({
    data: events.slice((q.page - 1) * q.limit, q.page * q.limit),
    total: events.length,
    unread_count: events.filter((event) => !event.read_at).length,
    page: q.page,
    limit: q.limit,
  });
});
notificationRoutes.post("/read-all", async (req, res) => {
  parse(z.object({}).strict(), req.body);
  await markRead(req.user);
  res.status(204).end();
});
notificationRoutes.post("/:id/read", async (req, res) => {
  const id = parse(
    z
      .string()
      .regex(/^(order|account|access|backup|restore):[A-Za-z0-9-]{1,80}$/),
    req.params.id,
  );
  parse(z.object({}).strict(), req.body);
  await markRead(req.user, id);
  res.status(204).end();
});
