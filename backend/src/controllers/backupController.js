import * as svc from "../services/backupService.js";
import { z } from "zod";
import { parse } from "../middlewares/validateOrder.js";
import { validId } from "../middlewares/validateOrder.js";
export const list = async (req, res) => res.json(await svc.listBackups());
export const create = async (req, res) =>
  res.status(201).json(await svc.createBackup(req.user.id));
export const restore = async (req, res) => {
  const b = parse(
    z
      .object({
        backup_id: z.uuid(),
        confirmation: z.literal("RESTORE_TO_ISOLATED_DATABASE"),
      })
      .strict(),
    req.body,
  );
  res
    .status(201)
    .json(await svc.restoreBackup(b.backup_id, req.user.id, b.confirmation));
};
export const getRestore = async (req, res) =>
  res.json(await svc.getRestore(validId(req.params.id)));
