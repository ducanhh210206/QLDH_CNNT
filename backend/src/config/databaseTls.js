import { readFileSync } from "node:fs";

export function databaseTls(settings = process.env) {
  if (settings.DB_SSL !== "true") return {};
  return {
    ssl: {
      rejectUnauthorized: true,
      verifyIdentity: true,
      ...(settings.DB_SSL_CA_FILE
        ? { ca: readFileSync(settings.DB_SSL_CA_FILE, "utf8") }
        : {}),
    },
  };
}
