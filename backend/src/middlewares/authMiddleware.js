import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { sessionUser } from "../repositories/userRepository.js";
import { fail } from "../utils/errors.js";
export async function requireAuth(req, res, next) {
  let claims;
  try {
    claims = jwt.verify(req.cookies.omdrs, env.jwt, {
      algorithms: ["HS256"],
      issuer: "omdrs",
      audience: "omdrs-web",
    });
  } catch {
    fail(401, "UNAUTHORIZED", "Vui lòng đăng nhập.");
  }
  const user = await sessionUser(claims.sub, claims.sid);
  if (!user) fail(401, "SESSION_EXPIRED", "Phiên đăng nhập đã hết hạn.");
  req.user = user;
  req.sessionId = claims.sid;
  next();
}
export function admin(req, res, next) {
  if (req.user.role !== "Admin")
    fail(403, "FORBIDDEN", "Thao tác yêu cầu quyền Admin.");
  next();
}
