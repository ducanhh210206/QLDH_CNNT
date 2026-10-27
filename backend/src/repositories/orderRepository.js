import { pool, transaction } from "../config/database.js";
import { randomUUID, createHash } from "node:crypto";
import { fail } from "../utils/errors.js";
export async function get(id, c = pool) {
  const [r] = await c.execute("SELECT * FROM orders WHERE id=?", [id]);
  return r[0];
}
export async function list(q) {
  const where = [],
    args = [];
  if (q.status) {
    where.push("status=?");
    args.push(q.status);
  }
  if (q.search) {
    where.push("(customer_name LIKE ? OR id LIKE ?)");
    args.push("%" + q.search + "%", "%" + q.search + "%");
  }
  const clause = where.length ? " WHERE " + where.join(" AND ") : "";
  const [n] = await pool.execute(
    "SELECT COUNT(*) AS total FROM orders" + clause,
    args,
  );
  const [rows] = await pool.query(
    "SELECT * FROM orders" +
      clause +
      " ORDER BY created_at " +
      (q.sort === "asc" ? "ASC" : "DESC") +
      ",id LIMIT ? OFFSET ?",
    [...args, q.limit, (q.page - 1) * q.limit],
  );
  return { data: rows, total: n[0].total, page: q.page, limit: q.limit };
}
export async function create(data, userId, key) {
  const hash = createHash("sha256").update(JSON.stringify(data)).digest("hex");
  const replay = async () => {
    const [r] = await pool.execute(
      "SELECT request_hash,order_id FROM idempotency_keys WHERE user_id=? AND idem_key=?",
      [userId, key],
    );
    if (!r[0]) return null;
    if (r[0].request_hash !== hash)
      fail(
        409,
        "IDEMPOTENCY_CONFLICT",
        "Khóa yêu cầu đã được dùng với nội dung khác.",
      );
    return { order: await get(r[0].order_id), replayed: true };
  };
  const existing = await replay();
  if (existing) return existing;
  try {
    return await transaction(async (c) => {
      const id = randomUUID();
      await c.execute(
        "INSERT INTO orders(id,customer_name,product_name,quantity,total_amount,status) VALUES(?,?,?,?,?,?)",
        [
          id,
          data.customer_name,
          data.product_name,
          data.quantity,
          data.total_amount,
          data.status,
        ],
      );
      await c.execute(
        "INSERT INTO idempotency_keys(user_id,idem_key,request_hash,order_id) VALUES(?,?,?,?)",
        [userId, key, hash, id],
      );
      await c.execute(
        "INSERT INTO order_status_history(order_id,old_status,new_status,user_id) VALUES(?,NULL,?,?)",
        [id, data.status, userId],
      );
      return { order: await get(id, c), replayed: false };
    });
  } catch (e) {
    if (e.code === "ER_DUP_ENTRY") {
      const r = await replay();
      if (r) return r;
    }
    throw e;
  }
}
export function assertTransition(current, next, version) {
  if (current.version !== version)
    fail(409, "VERSION_CONFLICT", "Đơn hàng đã thay đổi. Hãy tải lại.");
  if (
    current.status !== "Pending" ||
    !["Completed", "Cancelled"].includes(next)
  )
    fail(
      409,
      "INVALID_TRANSITION",
      "Chỉ đơn đang chờ mới được hoàn tất hoặc hủy.",
    );
}
export async function updateStatus(id, status, version, userId) {
  return transaction(async (c) => {
    const [r] = await c.execute("SELECT * FROM orders WHERE id=? FOR UPDATE", [
      id,
    ]);
    const old = r[0];
    if (!old) fail(404, "NOT_FOUND", "Không tìm thấy đơn hàng.");
    assertTransition(old, status, version);
    await c.execute(
      "UPDATE orders SET status=?,version=version+1,updated_at=UTC_TIMESTAMP(3) WHERE id=? AND version=?",
      [status, id, version],
    );
    await c.execute(
      "INSERT INTO order_status_history(order_id,old_status,new_status,user_id) VALUES(?,?,?,?)",
      [id, old.status, status, userId],
    );
    return get(id, c);
  });
}
export async function history(id) {
  const [r] = await pool.execute(
    "SELECT h.*,u.username FROM order_status_history h JOIN users u ON u.id=h.user_id WHERE order_id=? ORDER BY h.id",
    [id],
  );
  return r;
}
export async function summary() {
  const [r] = await pool.query(
    "SELECT COUNT(*) total,COALESCE(SUM(status='Pending'),0) pending,COALESCE(SUM(status='Completed'),0) completed,COALESCE(SUM(status='Cancelled'),0) cancelled,COALESCE(SUM(CASE WHEN status='Completed' THEN total_amount ELSE 0 END),0) revenue FROM orders",
  );
  return r[0];
}
export async function statistics() {
  const [r] = await pool.query(
    "SELECT DATE(created_at) day,COUNT(*) count FROM orders WHERE created_at>=UTC_DATE()-INTERVAL 29 DAY GROUP BY DATE(created_at) ORDER BY day",
  );
  return r;
}
