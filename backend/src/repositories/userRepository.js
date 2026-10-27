import { pool } from "../config/database.js";
export async function byUsername(name) {
  const [r] = await pool.execute("SELECT * FROM users WHERE username=?", [
    name,
  ]);
  return r[0];
}
export async function sessionUser(uid, sid) {
  const [r] = await pool.execute(
    "SELECT u.id,u.username,u.role FROM users u JOIN auth_sessions s ON s.user_id=u.id WHERE u.id=? AND s.id=? AND s.expires_at>UTC_TIMESTAMP()",
    [uid, sid],
  );
  return r[0];
}
export async function createSession(id, uid) {
  await pool.execute(
    "INSERT INTO auth_sessions(id,user_id,expires_at) VALUES(?,?,DATE_ADD(UTC_TIMESTAMP(),INTERVAL 8 HOUR))",
    [id, uid],
  );
}
export async function deleteSession(id) {
  await pool.execute("DELETE FROM auth_sessions WHERE id=?", [id]);
}
