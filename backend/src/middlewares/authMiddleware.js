import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { sessionUser } from "../repositories/userRepository.js";
import { publicUser, permissionsFor } from "../config/permissions.js";
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
  if (!user || user.account_status !== "Active")
    fail(
      401,
      "SESSION_EXPIRED",
      "Phiên đăng nhập không còn hợp lệ hoặc quyền đã thay đổi.",
    );
  req.user = publicUser(user);
  req.sessionId = claims.sid;
  next();
}
export function admin(req, res, next) {
  if (req.user.role !== "Admin")
    fail(403, "FORBIDDEN", "Thao tác chỉ dành cho Quản lý.");
  next();
}
export const permission = (name) => (req, res, next) => {
  if (!permissionsFor(req.user).includes(name))
    fail(
      403,
      "FORBIDDEN",
      "Bạn chưa được quản lý cấp quyền cho chức năng này.",
    );
  next();
};
