import { z } from "zod";
import { parse } from "../middlewares/validateOrder.js";
import * as auth from "../services/authService.js";
import { deleteSession } from "../repositories/userRepository.js";
import { env } from "../config/env.js";
export async function login(req, res) {
  const b = parse(
    z.object({
      username: z.string().min(1).max(100),
      password: z.string().min(1).max(256),
    }),
    req.body,
  );
  const result = await auth.login(b.username, b.password);
  res
    .cookie("omdrs", result.token, {
      httpOnly: true,
      secure: env.production,
      sameSite: "strict",
      maxAge: 8 * 3600000,
      path: "/",
    })
    .json(result.user);
}
export async function logout(req, res) {
  await deleteSession(req.sessionId);
  res
    .clearCookie("omdrs", {
      httpOnly: true,
      secure: env.production,
      sameSite: "strict",
      path: "/",
    })
    .status(204)
    .end();
}
export const me = (req, res) => res.json(req.user);
