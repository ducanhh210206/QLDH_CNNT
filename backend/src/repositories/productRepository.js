import { pool, transaction } from "../config/database.js";
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
  // Generate on the server; ignore legacy caller-supplied SKUs.
  for (let attempt = 0; attempt < 5; attempt++) {
    const id = randomUUID();
    const sku = "SP-" + id.replaceAll("-", "").slice(0, 12).toUpperCase();
    try {
      await pool.execute(
        "INSERT INTO products(id,sku,name,unit_price,description,created_by,stock_quantity) VALUES(?,?,?,?,?,?,?)",
        [
          id,
          sku,
          data.name,
          data.unit_price,
          data.description,
          userId,
          data.stock_quantity,
        ],
      );
    } catch (e) {
      if (e.code === "ER_DUP_ENTRY") continue;
      throw e;
    }
    const [rows] = await pool.execute("SELECT * FROM products WHERE id=?", [
      id,
    ]);
    return rows[0];
  }
  fail(
    503,
    "SKU_GENERATION_FAILED",
    "Chưa tạo được mã sản phẩm duy nhất. Vui lòng thử lại.",
  );
}

export async function addStock(id, quantity) {
  const [result] = await pool.execute(
    "UPDATE products SET stock_quantity=stock_quantity+?,version=version+1 WHERE id=?",
    [quantity, id],
  );
  if (!result.affectedRows)
    fail(404, "PRODUCT_NOT_FOUND", "Không tìm thấy sản phẩm.");
  const [rows] = await pool.execute("SELECT * FROM products WHERE id=?", [id]);
  return rows[0];
}

export async function update(id, data) {
  const [result] = await pool.execute(
    "UPDATE products SET name=?,unit_price=?,stock_quantity=?,version=version+1 WHERE id=? AND version=?",
    [data.name, data.unit_price, data.stock_quantity, id, data.version],
  );
  const [rows] = await pool.execute("SELECT * FROM products WHERE id=?", [id]);
  if (!rows.length) fail(404, "PRODUCT_NOT_FOUND", "Không tìm thấy sản phẩm.");
  if (!result.affectedRows)
    fail(
      409,
      "PRODUCT_VERSION_CONFLICT",
      "Sản phẩm hoặc tồn kho đã thay đổi. Hãy bấm Sửa lại để tải thông tin mới trước khi lưu.",
    );
  return rows[0];
}

export async function remove(id, version) {
  return transaction(async (c) => {
    // Order creation takes the same lock before inserting its product reference.
    const [rows] = await c.execute(
      "SELECT version FROM products WHERE id=? FOR UPDATE",
      [id],
    );
    if (!rows.length) fail(404, "PRODUCT_NOT_FOUND", "Không tìm thấy sản phẩm.");
    if (rows[0].version !== version)
      fail(409, "PRODUCT_VERSION_CONFLICT", "Sản phẩm hoặc tồn kho đã thay đổi. Hãy làm mới danh mục trước khi xoá.");
    const [orders] = await c.execute(
      "SELECT id FROM orders WHERE product_id=? LIMIT 1 FOR UPDATE",
      [id],
    );
    if (orders.length)
      fail(409, "PRODUCT_IN_USE", "Không thể xoá sản phẩm đã có trong đơn hàng, kể cả đơn đã huỷ, để giữ lịch sử giao dịch.");
    await c.execute("DELETE FROM products WHERE id=?", [id]);
  });
}
