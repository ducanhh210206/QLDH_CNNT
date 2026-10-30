import { z } from "zod";
import { parse, validId } from "../middlewares/validateOrder.js";
import { STAFF_PERMISSIONS, PERMISSION_LABELS } from "../config/permissions.js";
import { registrationSchema, hashPassword } from "../services/authService.js";
import * as repo from "../repositories/userRepository.js";
export const list = async (req, res) => {
  const q = parse(
    z.object({
      page: z.coerce.number().int().min(1).max(1000000).default(1),
      limit: z.coerce.number().int().min(1).max(100).default(20),
      status: z.enum(["Pending", "Active", "Rejected", "Suspended"]).optional(),
      search: z.string().max(200).default(""),
    }),
    req.query,
  );
  res.json(await repo.listUsers(q));
};
export const permissions = (req, res) =>
  res.json({
    permissions: STAFF_PERMISSIONS.map((key) => ({
      key,
      label: PERMISSION_LABELS[key],
    })),
  });
export const review = async (req, res) => {
  const b = parse(
    z
      .object({
        version: z.number().int().positive(),
        role: z.enum(["Admin", "Staff"]),
        account_status: z.enum(["Active", "Rejected", "Suspended"]),
        permissions: z
          .array(z.enum(STAFF_PERMISSIONS))
          .max(STAFF_PERMISSIONS.length)
          .refine((a) => new Set(a).size === a.length),
        note: z.string().trim().max(500).default(""),
      })
      .strict()
      .superRefine(validateDependencies),
    req.body,
  );
  res.json(await repo.reviewUser(validId(req.params.id), req.user.id, b));
};
export const history = async (req, res) =>
  res.json(await repo.accessHistory(validId(req.params.id)));

const permissionList = z
  .array(z.enum(STAFF_PERMISSIONS))
  .max(STAFF_PERMISSIONS.length)
  .refine((a) => new Set(a).size === a.length);
const validateDependencies = (data, ctx) => {
  for (const [child, parent] of [
    ["products.create", "products.read"],
    ["orders.create", "orders.read"],
    ["orders.update", "orders.read"],
  ])
    if (
      data.role === "Staff" &&
      data.permissions.includes(child) &&
      !data.permissions.includes(parent)
    )
      ctx.addIssue({
        code: "custom",
        path: ["permissions"],
        message: "Quyền thao tác cần đi kèm quyền xem dữ liệu.",
      });
};

export const createStaff = async (req, res) => {
  const data = parse(
    registrationSchema
      .extend({
        permissions: permissionList,
        note: z.string().trim().max(500).default(""),
      })
      .strict()
      .superRefine((data, ctx) =>
        validateDependencies({ ...data, role: "Staff" }, ctx),
      ),
    req.body,
  );
  const { password, ...profile } = data;
  const user = await repo.createManagedStaff(req.user.id, {
    ...profile,
    password_hash: await hashPassword(password),
  });
  res.status(201).json(user);
};
