export const STAFF_PERMISSIONS = [
  "products.read",
  "products.create",
  "orders.read",
  "orders.create",
  "orders.update",
  "statistics.read",
  "transactions.read",
];
export const PERMISSION_LABELS = {
  "products.read": "Xem sản phẩm",
  "products.create": "Thêm sản phẩm",
  "orders.read": "Xem đơn hàng",
  "orders.create": "Tạo đơn hàng",
  "orders.update": "Cập nhật trạng thái đơn",
  "statistics.read": "Xem thống kê",
  "transactions.read": "Xem lịch sử giao dịch",
};
export function permissionsFor(user) {
  if (user.role === "Admin")
    return [
      ...STAFF_PERMISSIONS,
      "users.manage",
      "backups.manage",
      "system.manage",
    ];
  let permissions = user.permissions;
  if (typeof permissions === "string") {
    try {
      permissions = JSON.parse(permissions);
    } catch {
      permissions = [];
    }
  }
  return permissions === null
    ? STAFF_PERMISSIONS
    : Array.isArray(permissions)
      ? permissions.filter((p) => STAFF_PERMISSIONS.includes(p))
      : [];
}
export function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    full_name: user.full_name || user.username,
    email: user.email || null,
    email_verified: !!user.email_verified,
    auth_provider: user.auth_provider || "Local",
    role: user.role,
    role_label: user.role === "Admin" ? "Quản lý" : "Nhân viên",
    account_status: user.account_status,
    permissions: permissionsFor(user),
    access_version: user.access_version,
    created_at: user.created_at,
    reviewed_at: user.reviewed_at,
    review_note: user.review_note || null,
  };
}
