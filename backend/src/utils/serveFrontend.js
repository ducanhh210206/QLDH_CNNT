import express from "express";
import { existsSync } from "node:fs";
import { resolve, extname } from "node:path";

export function mountFrontend(app, directory) {
  const root = resolve(directory);
  const index = resolve(root, "index.html");
  if (!existsSync(index)) throw new Error("FRONTEND_BUILD_MISSING");
  const reserved = (path) => /^\/(api|health)(\/|$)/.test(path);
  const assets = express.static(root, { index: false, dotfiles: "deny" });
  app.use((req, res, next) =>
    reserved(req.path) ? next() : assets(req, res, next),
  );
  app.use((req, res, next) => {
    if (
      !["GET", "HEAD"].includes(req.method) ||
      reserved(req.path) ||
      extname(req.path) ||
      req.path.split("/").some((part) => part.startsWith("."))
    )
      return next();
    res.sendFile(index);
  });
}
