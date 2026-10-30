import * as google from "../services/googleAuthService.js";
import { env } from "../config/env.js";
import {
  oauthCookieOptions,
  setSessionCookie,
  clearSessionCookie,
} from "../utils/authCookies.js";
export const providers = (req, res) =>
  res.json({ google: { enabled: google.googleEnabled() } });
export async function start(req, res) {
  const result = await google.beginGoogle();
  res
    .cookie("omdrs_google", result.cookie, oauthCookieOptions())
    .redirect(302, result.url);
}
export async function callback(req, res) {
  const { maxAge, ...options } = oauthCookieOptions();
  res.clearCookie("omdrs_google", options);
  let resultCode = "google_failed";
  try {
    const result = await google.finishGoogle(
      req.cookies.omdrs_google,
      req.query,
    );
    if (result.pending) {
      clearSessionCookie(res);
      resultCode = "pending";
    } else {
      setSessionCookie(res, result.token);
      resultCode = "success";
    }
  } catch (e) {
    resultCode =
      {
        ACCOUNT_LINK_REQUIRED: "link_required",
        ACCOUNT_DISABLED: "disabled",
        PENDING_APPROVAL: "pending",
        GOOGLE_CANCELLED: "cancelled",
        GOOGLE_NOT_CONFIGURED: "not_configured",
      }[e.code] || "google_failed";
  }
  const redirect = new URL(env.google.frontendUrl);
  redirect.searchParams.set("auth_result", resultCode);
  res.redirect(303, redirect.toString());
}
