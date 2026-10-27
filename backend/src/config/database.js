import mysql from "mysql2/promise";
import { env } from "./env.js";
export const pool = mysql.createPool(env.db);
pool.on("connection", (c) => c.query("SET time_zone='+00:00'"));
export async function transaction(fn) {
  const c = await pool.getConnection();
  try {
    await c.beginTransaction();
    const result = await fn(c);
    await c.commit();
    return result;
  } catch (e) {
    await c.rollback();
    throw e;
  } finally {
    c.release();
  }
}
