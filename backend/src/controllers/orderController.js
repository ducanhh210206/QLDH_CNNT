import * as svc from "../services/orderService.js";
export const list = async (req, res) => res.json(await svc.list(req.query));
export const get = async (req, res) => res.json(await svc.get(req.params.id));
export const create = async (req, res) => {
  const r = await svc.create(req.body, req.user.id, req.get("Idempotency-Key"));
  res.status(r.replayed ? 200 : 201).json(r);
};
export const update = async (req, res) =>
  res.json(await svc.update(req.params.id, req.body, req.user.id));
export const history = async (req, res) =>
  res.json(await svc.history(req.params.id));
export const summary = async (req, res) => res.json(await svc.summary());
export const statistics = async (req, res) => res.json(await svc.statistics());
