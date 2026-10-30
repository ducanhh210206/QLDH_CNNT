import {
  scrypt as _scrypt,
  randomBytes,
  timingSafeEqual,
  randomUUID,
} from "node:crypto";
import { promisify } from "node:util";
import jwt from "jsonwebtoken";
import { z } from "zod";
import * as users from "../repositories/userRepository.js";
import { env } from "../config/env.js";
import { publicUser } from "../config/permissions.js";
import { parse } from "../middlewares/validateOrder.js";
import { fail } from "../utils/errors.js";
const scrypt = promisify(_scrypt);
const dummy = "00000000000000000000000000000000:" + "0".repeat(128);
export async function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  return salt + ":" + (await scrypt(password, salt, 64)).toString("hex");
}
export async function verifyPassword(password, hash) {
  const [salt, key] = (hash || dummy).split(":");
  const actual = await scrypt(password, salt, 64);
  const expected = Buffer.from(key, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
export function requireAuthConfig() {
  if (env.jwt.length < 32)
    fail(
      503,
      "AUTH_NOT_CONFIGURED",
      "Cần cấu hình JWT_SECRET tối thiểu 32 ký tự.",
    );
}
export function assertActive(user) {
  if (user.account_status === "Pending")
    fail(
      403,
      "PENDING_APPROVAL",
      "Tài khoản đang chờ quản lý duyệt và cấp quyền.",
    );
  if (user.account_status !== "Active")
    fail(
      403,
      "ACCOUNT_DISABLED",
      "Tài khoản bị từ chối hoặc tạm khóa. Vui lòng liên hệ quản lý.",
    );
}
export async function issueSession(user) {
  requireAuthConfig();
  assertActive(user);
  const sid = randomUUID();
  await users.createSession(sid, user.id);
  return {
    user: publicUser(user),
    token: jwt.sign({ sub: user.id, sid }, env.jwt, {
      expiresIn: "8h",
      issuer: "omdrs",
      audience: "omdrs-web",
    }),
  };
}
export async function login(username, password) {
  requireAuthConfig();
  const user = await users.byUsername(username.trim());
  const valid = await verifyPassword(password, user?.password_hash || dummy);
  if (!user || !valid)
    fail(
      401,
      "INVALID_CREDENTIALS",
      "Tên đăng nhập/email hoặc mật khẩu không đúng.",
    );
  return issueSession(user);
}
export const registrationSchema = z
  .object({
    username: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9._-]{3,100}$/),
    email: z
      .email()
      .max(254)
      .transform((s) => s.toLowerCase()),
    full_name: z.string().trim().min(1).max(120),
    password: z.string().min(12).max(256),
  })
  .strict();
export async function register(body) {
  requireAuthConfig();
  const data = parse(registrationSchema, body);
  return users.register({
    ...data,
    password_hash: await hashPassword(data.password),
  });
}
