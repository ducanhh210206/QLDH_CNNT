import * as svc from "../services/incidentService.js";
import { z } from "zod";
import { parse } from "../middlewares/validateOrder.js";
import { validId } from "../middlewares/validateOrder.js";
export const list = async (req, res) => res.json(await svc.list());
export const get = async (req, res) =>
  res.json(await svc.get(validId(req.params.id)));
export const simulate = async (req, res) => {
  const b = parse(z.object({ type: z.enum(svc.types) }).strict(), req.body);
  res.status(201).json(await svc.simulate(b.type, req.user.id));
};
