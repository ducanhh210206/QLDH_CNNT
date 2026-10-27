import {
  scrypt as _scrypt,
  randomBytes,
  timingSafeEqual,
  randomUUID,
} from "node:crypto";
import { promisify } from "node:util";
import jwt from "jsonwebtoken";
import * as users from "../repositories/userRepository.js";
import { env } from "../config/env.js";
import { fail } from "../utils/errors.js";
const scrypt = promisify(_scrypt);
export async function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  return salt + ":" + (await scrypt(password, salt, 64)).toString("hex");
}
export async function verifyPassword(password, hash) {
  const [salt, key] = hash.split(":");
  const actual = await scrypt(password, salt, 64);
  const expected = Buffer.from(key, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
export async function login(username, password) {
  if (env.jwt.length < 32)
    fail(
      503,
      "AUTH_NOT_CONFIGURED",
      "Cần cấu hình JWT_SECRET tối thiểu 32 ký tự.",
    );
  const user = await users.byUsername(username);
  const valid = await verifyPassword(
    password,
    user?.password_hash ||
      "00000000000000000000000000000000:" + "0".repeat(128),
  );
  if (!user || !valid)
    fail(401, "INVALID_CREDENTIALS", "Tên đăng nhập hoặc mật khẩu không đúng.");
  const sid = randomUUID();
  await users.createSession(sid, user.id);
  return {
    user: { id: user.id, username: user.username, role: user.role },
    token: jwt.sign({ sub: user.id, sid }, env.jwt, {
      expiresIn: "8h",
      issuer: "omdrs",
      audience: "omdrs-web",
    }),
  };
}
