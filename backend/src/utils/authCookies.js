import { env } from "../config/env.js";
export const sessionCookieOptions = () => ({
  httpOnly: true,
  secure: env.production,
  sameSite: "strict",
  maxAge: 8 * 3600000,
  path: "/",
});
export const oauthCookieOptions = () => ({
  httpOnly: true,
  secure: env.production,
  sameSite: "lax",
  maxAge: 10 * 60000,
  path: "/api/auth/google",
});
export function setSessionCookie(res, token) {
  res.cookie("omdrs", token, sessionCookieOptions());
}
export function clearSessionCookie(res) {
  const { maxAge, ...options } = sessionCookieOptions();
  res.clearCookie("omdrs", options);
}
