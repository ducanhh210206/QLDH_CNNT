const base = import.meta.env.VITE_API_BASE || "";
export async function api(path, options = {}) {
  let response;
  try {
    response = await fetch(base + path, {
      ...options,
      credentials: "include",
      headers: { "Content-Type": "application/json", ...options.headers },
      signal: options.signal || AbortSignal.timeout(120000),
    });
  } catch {
    const e = new Error(
      "Không kết nối được máy chủ. Kết quả ghi dữ liệu có thể chưa xác định; hãy thử lại với cùng yêu cầu.",
    );
    e.uncertain = true;
    throw e;
  }
  if (response.status === 204) return null;
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const e = new Error(body.error?.message || "Yêu cầu thất bại.");
    e.status = response.status;
    e.code = body.error?.code;
    e.uncertain = response.status >= 500;
    throw e;
  }
  return body;
}
export const money = (n) =>
  new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(n || 0);
export const date = (s) =>
  s
    ? new Date(s.includes("T") ? s : s.replace(" ", "T") + "Z").toLocaleString(
        "vi-VN",
      )
    : "—";
export const statusName = (s) =>
  ({ Pending: "Đang chờ", Completed: "Hoàn tất", Cancelled: "Đã hủy" })[s] || s;
