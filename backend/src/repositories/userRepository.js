import { randomUUID } from "node:crypto";
import { pool, transaction } from "../config/database.js";
import { publicUser, permissionsFor } from "../config/permissions.js";
import { fail } from "../utils/errors.js";
export async function byUsername(name) {
  const [r] = await pool.execute(
    "SELECT * FROM users WHERE username=? OR email=? LIMIT 1",
    [name, name.toLowerCase()],
  );
  return r[0];
}
export async function sessionUser(uid, sid) {
  const [r] = await pool.execute(
    "SELECT u.* FROM users u JOIN auth_sessions s ON s.user_id=u.id WHERE u.id=? AND s.id=? AND s.expires_at>UTC_TIMESTAMP() AND u.account_status='Active'",
    [uid, sid],
  );
  return r[0];
}
export async function createSession(id, uid) {
  const [result] = await pool.execute(
    "INSERT INTO auth_sessions(id,user_id,expires_at) SELECT ?,id,DATE_ADD(UTC_TIMESTAMP(),INTERVAL 8 HOUR) FROM users WHERE id=? AND account_status='Active'",
    [id, uid],
  );
  if (result.affectedRows !== 1)
    fail(403, "ACCOUNT_UNAVAILABLE", "Tài khoản chưa được cấp quyền sử dụng.");
}
export async function deleteSession(id) {
  await pool.execute("DELETE FROM auth_sessions WHERE id=?", [id]);
}
export async function register({ username, email, full_name, password_hash }) {
  const id = randomUUID();
  try {
    await pool.execute(
      "INSERT INTO users(id,username,email,full_name,password_hash,role,account_status,permissions) VALUES(?,?,?,?,?,'Staff','Pending',?)",
      [id, username, email, full_name, password_hash, "[]"],
    );
  } catch (e) {
    if (e.code === "ER_DUP_ENTRY")
      fail(409, "ACCOUNT_EXISTS", "Tên đăng nhập hoặc email đã được sử dụng.");
    throw e;
  }
  return {
    id,
    account_status: "Pending",
    message: "Đăng ký thành công. Vui lòng chờ quản lý duyệt và cấp quyền.",
  };
}
export async function googleAccount(profile) {
  return transaction(async (c) => {
    const [r] = await c.execute(
      "SELECT * FROM users WHERE google_sub=? FOR UPDATE",
      [profile.sub],
    );
    if (r[0]) return r[0];
    const [emails] = await c.execute("SELECT id FROM users WHERE email=?", [
      profile.email,
    ]);
    if (emails.length)
      fail(
        409,
        "ACCOUNT_LINK_REQUIRED",
        "Email này đã có tài khoản mật khẩu. Hãy đăng nhập bằng mật khẩu; không tự động liên kết Google để bảo vệ tài khoản.",
      );
    const id = randomUUID(),
      username = "google_" + id.replaceAll("-", "");
    try {
      await c.execute(
        "INSERT INTO users(id,username,email,full_name,google_sub,auth_provider,email_verified,password_hash,role,account_status,permissions) VALUES(?,?,?,?,?,'Google',TRUE,NULL,'Staff','Pending',?)",
        [id, username, profile.email, profile.name, profile.sub, "[]"],
      );
    } catch (e) {
      if (e.code === "ER_DUP_ENTRY")
        fail(
          409,
          "ACCOUNT_EXISTS",
          "Tài khoản vừa được tạo ở yêu cầu khác. Vui lòng thử lại.",
        );
      throw e;
    }
    const [created] = await c.execute("SELECT * FROM users WHERE id=?", [id]);
    return created[0];
  });
}
export async function listUsers(q) {
  const where = [],
    args = [];
  if (q.status) {
    where.push("account_status=?");
    args.push(q.status);
  }
  if (q.search) {
    where.push("(username LIKE ? OR email LIKE ? OR full_name LIKE ?)");
    args.push(...Array(3).fill("%" + q.search + "%"));
  }
  const clause = where.length ? " WHERE " + where.join(" AND ") : "";
  const [total] = await pool.execute(
    "SELECT COUNT(*) total FROM users" + clause,
    args,
  );
  const [rows] = await pool.query(
    "SELECT * FROM users" +
      clause +
      " ORDER BY (account_status='Pending') DESC,created_at DESC,id LIMIT ? OFFSET ?",
    [...args, q.limit, (q.page - 1) * q.limit],
  );
  return {
    data: rows.map(publicUser),
    total: Number(total[0].total),
    page: q.page,
    limit: q.limit,
  };
}
export async function reviewUser(id, actorId, body) {
  return transaction(async (c) => {
    await lockManager(c, actorId);
    if (id === actorId)
      fail(
        409,
        "SELF_ACCESS_CHANGE",
        "Không thể thay đổi quyền hoặc trạng thái tài khoản đang đăng nhập.",
      );
    const [rows] = await c.execute(
      "SELECT * FROM users WHERE id=? FOR UPDATE",
      [id],
    );
    const target = rows[0];
    if (!target) fail(404, "NOT_FOUND", "Không tìm thấy người dùng.");
    if (target.access_version !== body.version)
      fail(
        409,
        "VERSION_CONFLICT",
        "Tài khoản đã được quản lý khác cập nhật. Hãy tải lại.",
      );
    const before = publicUser(target);
    await c.execute(
      "UPDATE users SET role=?,account_status=?,permissions=?,access_version=access_version+1,reviewed_by=?,reviewed_at=UTC_TIMESTAMP(3),review_note=? WHERE id=?",
      [
        body.role,
        body.account_status,
        JSON.stringify(body.permissions),
        actorId,
        body.note || null,
        id,
      ],
    );
    await c.execute("DELETE FROM auth_sessions WHERE user_id=?", [id]);
    const [updated] = await c.execute("SELECT * FROM users WHERE id=?", [id]);
    const after = publicUser(updated[0]);
    await c.execute(
      "INSERT INTO user_access_history(user_id,actor_id,before_access,after_access,note) VALUES(?,?,?,?,?)",
      [
        id,
        actorId,
        JSON.stringify(before),
        JSON.stringify(after),
        body.note || null,
      ],
    );
    return after;
  });
}
export async function accessHistory(id) {
  const [r] = await pool.execute(
    "SELECT h.id,h.before_access,h.after_access,h.note,h.created_at,u.username actor FROM user_access_history h JOIN users u ON u.id=h.actor_id WHERE h.user_id=? ORDER BY h.id DESC LIMIT 100",
    [id],
  );
  return r;
}
export async function saveOAuthAttempt(id) {
  await pool.execute(
    "INSERT INTO oauth_login_attempts(id,expires_at) VALUES(?,DATE_ADD(UTC_TIMESTAMP(),INTERVAL 10 MINUTE))",
    [id],
  );
}
export async function consumeOAuthAttempt(id) {
  const [r] = await pool.execute(
    "UPDATE oauth_login_attempts SET consumed=TRUE WHERE id=? AND consumed=FALSE AND expires_at>UTC_TIMESTAMP()",
    [id],
  );
  if (r.affectedRows !== 1)
    fail(
      400,
      "OAUTH_REPLAY",
      "Phiên đăng nhập Google đã hết hạn hoặc đã sử dụng.",
    );
}

async function lockManager(c, actorId) {
  // A shared row serializes access changes across instances; recheck actor after acquiring it.
  await c.execute(
    "SELECT version FROM schema_migrations WHERE version='002_user_access' FOR UPDATE",
  );
  const [actors] = await c.execute(
    "SELECT * FROM users WHERE id=? FOR UPDATE",
    [actorId],
  );
  if (actors[0]?.role !== "Admin" || actors[0]?.account_status !== "Active")
    fail(
      403,
      "FORBIDDEN",
      "Quyền quản lý của bạn đã thay đổi. Hãy đăng nhập lại.",
    );
}

export async function createManagedStaff(actorId, data) {
  try {
    return await transaction(async (c) => {
      await lockManager(c, actorId);
      const id = randomUUID();
      await c.execute(
        "INSERT INTO users(id,username,email,full_name,password_hash,role,account_status,permissions,reviewed_by,reviewed_at,review_note) VALUES(?,?,?,?,?,'Staff','Active',?,?,UTC_TIMESTAMP(3),?)",
        [
          id,
          data.username,
          data.email,
          data.full_name,
          data.password_hash,
          JSON.stringify(data.permissions),
          actorId,
          data.note || null,
        ],
      );
      const [rows] = await c.execute("SELECT * FROM users WHERE id=?", [id]);
      const user = publicUser(rows[0]);
      await c.execute(
        "INSERT INTO user_access_history(user_id,actor_id,before_access,after_access,note) VALUES(?,?,?,?,?)",
        [
          id,
          actorId,
          "{}",
          JSON.stringify(user),
          data.note || "Quản lý tạo và cấp tài khoản nhân viên",
        ],
      );
      return user;
    });
  } catch (e) {
    if (e.code === "ER_DUP_ENTRY")
      fail(409, "ACCOUNT_EXISTS", "Tên đăng nhập hoặc email đã được sử dụng.");
    throw e;
  }
}
