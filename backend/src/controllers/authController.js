import { z } from "zod";
import { parse } from "../middlewares/validateOrder.js";
import * as auth from "../services/authService.js";
import { deleteSession } from "../repositories/userRepository.js";
import { setSessionCookie, clearSessionCookie } from "../utils/authCookies.js";
export async function login(req, res) {
  const b = parse(
    z
      .object({
        username: z.string().min(1).max(254),
        password: z.string().min(1).max(256),
      })
      .strict(),
    req.body,
  );
  const result = await auth.login(b.username, b.password);
  setSessionCookie(res, result.token);
  res.json(result.user);
}
export const register = async (req, res) =>
  res.status(201).json(await auth.register(req.body));
export async function logout(req, res) {
  await deleteSession(req.sessionId);
  clearSessionCookie(res);
  res.status(204).end();
}
export const me = (req, res) => res.json(req.user);
