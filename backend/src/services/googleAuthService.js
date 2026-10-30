import { OAuth2Client } from "google-auth-library";
import { randomBytes, createHash, timingSafeEqual } from "node:crypto";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { fail } from "../utils/errors.js";
import * as users from "../repositories/userRepository.js";
import { issueSession, requireAuthConfig } from "./authService.js";
const hash = (s) => createHash("sha256").update(s).digest("hex");
const equal = (a, b) =>
  typeof a === "string" &&
  typeof b === "string" &&
  Buffer.byteLength(a) === Buffer.byteLength(b) &&
  timingSafeEqual(Buffer.from(a), Buffer.from(b));
function client() {
  return new OAuth2Client({
    clientId: env.google.clientId,
    clientSecret: env.google.clientSecret,
    redirectUri: env.google.redirectUri,
  });
}
export function googleEnabled() {
  try {
    const frontend = new URL(env.google.frontendUrl),
      redirect = new URL(env.google.redirectUri);
    return !!(
      env.google.clientId &&
      env.google.clientSecret &&
      env.jwt.length >= 32 &&
      env.origins.includes(frontend.origin) &&
      frontend.origin === redirect.origin &&
      (frontend.protocol === "https:" ||
        ["localhost", "127.0.0.1"].includes(frontend.hostname))
    );
  } catch {
    return false;
  }
}
export async function beginGoogle() {
  requireAuthConfig();
  if (!googleEnabled())
    fail(503, "GOOGLE_NOT_CONFIGURED", "Đăng nhập Google chưa được cấu hình.");
  const state = randomBytes(32).toString("base64url"),
    nonce = randomBytes(32).toString("base64url"),
    verifier = randomBytes(48).toString("base64url");
  await users.saveOAuthAttempt(hash(state));
  const cookie = jwt.sign({ state, nonce, verifier }, env.jwt, {
    expiresIn: "10m",
    issuer: "omdrs",
    audience: "omdrs-google-oauth",
  });
  const url = client().generateAuthUrl({
    scope: ["openid", "email", "profile"],
    state,
    nonce,
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    code_challenge_method: "S256",
    prompt: "select_account",
  });
  return { cookie, url };
}
export function readOAuthState(cookie, state) {
  let payload;
  try {
    payload = jwt.verify(cookie, env.jwt, {
      algorithms: ["HS256"],
      issuer: "omdrs",
      audience: "omdrs-google-oauth",
    });
  } catch {
    fail(
      400,
      "OAUTH_STATE_INVALID",
      "Phiên đăng nhập Google hết hạn. Hãy thử lại.",
    );
  }
  if (!equal(payload.state, state))
    fail(
      400,
      "OAUTH_STATE_INVALID",
      "Không xác minh được phiên đăng nhập Google.",
    );
  return payload;
}
export function validateGoogleClaims(payload, nonce) {
  if (
    !payload ||
    !equal(payload.nonce, nonce) ||
    payload.email_verified !== true ||
    typeof payload.sub !== "string" ||
    !payload.sub ||
    payload.sub.length > 255 ||
    typeof payload.email !== "string" ||
    payload.email.length > 254 ||
    !payload.email.includes("@")
  )
    fail(
      401,
      "GOOGLE_IDENTITY_INVALID",
      "Không xác minh được tài khoản Google.",
    );
  return {
    sub: payload.sub,
    email: payload.email.toLowerCase(),
    name: String(payload.name || payload.email).slice(0, 120),
  };
}
export async function finishGoogle(cookie, query) {
  if (!googleEnabled())
    fail(503, "GOOGLE_NOT_CONFIGURED", "Google chưa cấu hình.");
  const state = readOAuthState(cookie, query.state);
  await users.consumeOAuthAttempt(hash(state.state));
  if (query.error)
    fail(400, "GOOGLE_CANCELLED", "Bạn đã hủy đăng nhập Google.");
  if (typeof query.code !== "string" || query.code.length > 4096)
    fail(400, "OAUTH_CODE_INVALID", "Thiếu mã đăng nhập Google.");
  const oauth = client();
  let ticket;
  try {
    const { tokens } = await oauth.getToken({
      code: query.code,
      codeVerifier: state.verifier,
    });
    if (!tokens.id_token) throw Error();
    ticket = await oauth.verifyIdToken({
      idToken: tokens.id_token,
      audience: env.google.clientId,
    });
  } catch {
    fail(
      401,
      "GOOGLE_AUTH_FAILED",
      "Không xác thực được với Google. Vui lòng thử lại.",
    );
  }
  const profile = validateGoogleClaims(ticket.getPayload(), state.nonce);
  const user = await users.googleAccount(profile);
  if (user.account_status === "Pending") return { pending: true };
  return issueSession(user);
}
