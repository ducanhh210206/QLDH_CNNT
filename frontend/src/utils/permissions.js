export const permissionLabels = {
  "products.read": "Xem sản phẩm",
  "products.create": "Thêm sản phẩm",
  "orders.read": "Xem đơn hàng",
  "orders.create": "Tạo đơn hàng",
  "orders.update": "Cập nhật trạng thái đơn",
  "statistics.read": "Xem thống kê",
  "transactions.read": "Xem lịch sử giao dịch",
};
export const can = (user, key) =>
  user?.role === "Admin" || !!user?.permissions?.includes(key);
export const roleLabel = (user) =>
  user?.role === "Admin" ? "Quản lý" : "Nhân viên";
export const accountLabel = (status) =>
  ({
    Pending: "Chờ duyệt",
    Active: "Đang hoạt động",
    Rejected: "Đã từ chối",
    Suspended: "Tạm khóa",
  })[status] || status;
