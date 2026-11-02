import { pool } from "../config/database.js";
import { permissionsFor } from "../config/permissions.js";
import { fail } from "../utils/errors.js";

const statusLabels = {
  Pending: "Đang chờ",
  Completed: "Hoàn tất",
  Cancelled: "Đã hủy",
};
const accessLabels = {
  Active: "Đã cấp quyền",
  Pending: "Chờ duyệt",
  Rejected: "Đã từ chối",
  Suspended: "Tạm khóa",
};
const iso = (value) =>
  value instanceof Date
    ? value.toISOString()
    : new Date(
        String(value).replace(" ", "T") +
          (String(value).endsWith("Z") ? "" : "Z"),
      ).toISOString();
const recent = "created_at >= UTC_TIMESTAMP(3) - INTERVAL 90 DAY";

// Derive events from committed business records, so failed/retried writes never emit duplicate notices.
export async function feed(user) {
  const events = [];
  const permissions = permissionsFor(user);
  if (permissions.includes("orders.read")) {
    const [rows] = await pool.query(
      "SELECT h.id,h.order_id,h.old_status,h.new_status,h.created_at FROM order_status_history h WHERE h." +
        recent +
        " ORDER BY h.created_at DESC,h.id DESC LIMIT 100",
    );
    for (const row of rows)
      events.push({
        id: "order:" + row.id,
        type: "order",
        title: row.old_status
          ? "Đơn hàng cập nhật trạng thái"
          : "Có đơn hàng mới",
        message:
          "Đơn " +
          row.order_id.slice(0, 8) +
          ": " +
          (statusLabels[row.new_status] || row.new_status) +
          ".",
        page: "orders",
        created_at: iso(row.created_at),
      });
  }
  if (user.role === "Admin") {
    const [rows] = await pool.query(
      "SELECT id,username,full_name,account_status,created_at FROM users WHERE " +
        recent +
        " ORDER BY created_at DESC,id DESC LIMIT 100",
    );
    for (const row of rows)
      events.push({
        id: "account:" + row.id,
        type: "account",
        title:
          row.account_status === "Pending"
            ? "Tài khoản đang chờ duyệt"
            : "Tài khoản đã được tạo",
        message:
          (row.full_name || row.username) +
          " · " +
          row.username +
          " · " +
          accessLabels[row.account_status] +
          ".",
        page: "users",
        filter_status: row.account_status,
        created_at: iso(row.created_at),
      });
    for (const [table, prefix, label] of [
      ["backup_records", "backup", "Sao lưu"],
      ["restore_records", "restore", "Phục hồi thử"],
    ]) {
      const [jobs] = await pool.query(
        "SELECT id,status,created_at FROM " +
          table +
          " WHERE " +
          recent +
          " AND status IN ('Success','Verified','Failed') ORDER BY created_at DESC,id DESC LIMIT 100",
      );
      for (const row of jobs)
        events.push({
          id: prefix + ":" + row.id,
          type: row.status === "Failed" ? "warning" : prefix,
          title:
            label + (row.status === "Failed" ? " thất bại" : " thành công"),
          message:
            "Tác vụ " + row.id.slice(0, 8) + ". Mở kho sao lưu để xem kết quả.",
          page: "backups",
          created_at: iso(row.created_at),
        });
    }
  }
  // Staff may only inspect their own access decisions, regardless of order permissions.
  const [reviews] = await pool.execute(
    "SELECT id,after_access,created_at FROM user_access_history WHERE " +
      recent +
      (user.role === "Admin" ? "" : " AND user_id=?") +
      " ORDER BY created_at DESC,id DESC LIMIT 100",
    user.role === "Admin" ? [] : [user.id],
  );
  for (const row of reviews) {
    const after =
      typeof row.after_access === "string"
        ? JSON.parse(row.after_access)
        : row.after_access;
    events.push({
      id: "access:" + row.id,
      type: "access",
      title:
        user.role === "Admin"
          ? "Quyền tài khoản đã thay đổi"
          : "Quyền sử dụng của bạn đã được cập nhật",
      message:
        (user.role === "Admin"
          ? (after.full_name || after.username) + " · "
          : "") +
        (accessLabels[after.account_status] || after.account_status) +
        ".",
      page: user.role === "Admin" ? "users" : "settings",
      created_at: iso(row.created_at),
    });
  }
  const latest = events
    .sort(
      (a, b) =>
        b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id),
    )
    .slice(0, 100);
  if (!latest.length) return [];
  const [reads] = await pool.query(
    "SELECT event_key,read_at FROM notification_reads WHERE user_id=? AND event_key IN (?)",
    [user.id, latest.map((event) => event.id)],
  );
  const seen = new Map(reads.map((row) => [row.event_key, iso(row.read_at)]));
  return latest.map((event) => ({
    ...event,
    read_at: seen.get(event.id) || null,
  }));
}

export async function markRead(user, id) {
  const visible = await feed(user);
  const selected = id ? visible.filter((event) => event.id === id) : visible;
  if (id && !selected.length)
    fail(
      404,
      "NOT_FOUND",
      "Không tìm thấy thông báo thuộc quyền truy cập của bạn.",
    );
  if (!selected.length) return;
  await pool.query(
    "INSERT IGNORE INTO notification_reads(user_id,event_key) VALUES ?",
    [selected.map((event) => [user.id, event.id])],
  );
}
