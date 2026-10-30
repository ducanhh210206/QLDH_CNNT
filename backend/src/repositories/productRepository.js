import { pool } from "../config/database.js";
import { randomUUID } from "node:crypto";
import { fail } from "../utils/errors.js";
export async function list(q) {
  const args = ["%" + q.search + "%", "%" + q.search + "%"];
  const where = " WHERE (sku LIKE ? OR name LIKE ?)";
  const [count] = await pool.execute(
    "SELECT COUNT(*) total FROM products" + where,
    args,
  );
  const [rows] = await pool.query(
    "SELECT * FROM products" +
      where +
      " ORDER BY created_at DESC,id LIMIT ? OFFSET ?",
    [...args, q.limit, (q.page - 1) * q.limit],
  );
  return {
    data: rows,
    total: Number(count[0].total),
    page: q.page,
    limit: q.limit,
  };
}
export async function create(data, userId) {
  const id = randomUUID();
  try {
    await pool.execute(
      "INSERT INTO products(id,sku,name,unit_price,description,created_by) VALUES(?,?,?,?,?,?)",
      [id, data.sku, data.name, data.unit_price, data.description, userId],
    );
  } catch (e) {
    if (e.code === "ER_DUP_ENTRY")
      fail(409, "SKU_EXISTS", "Mã sản phẩm đã tồn tại.");
    throw e;
  }
  const [rows] = await pool.execute("SELECT * FROM products WHERE id=?", [id]);
  return rows[0];
}
