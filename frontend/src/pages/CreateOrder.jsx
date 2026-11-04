import { useState } from "react";
import { Save, ShieldCheck, ArrowLeft, Info } from "lucide-react";
import { api, money } from "../services/api";
import { PageHeading, Panel, ErrorBox, useData } from "../components/common";
const blank = {
  product_id: "",
  customer_name: "",
  product_name: "",
  quantity: 1,
  total_amount: "",
  status: "Pending",
};
import { can } from "../utils/permissions";
export default function CreateOrder({ notify, navigate, user }) {
  const draftKey = "omdrs-draft:" + user.id,
    pendingKey = "omdrs-pending:" + user.id;
  const [productSearch, setProductSearch] = useState("");
  const products = useData(
    "/api/orders/products?limit=100&search=" +
      encodeURIComponent(productSearch),
    15000,
  );
  const [form, setForm] = useState(() => {
      try {
        return { ...blank, ...JSON.parse(localStorage.getItem(draftKey)) };
      } catch {
        return blank;
      }
    }),
    [pending, setPending] = useState(() => {
      try {
        return JSON.parse(localStorage.getItem(pendingKey));
      } catch {
        return null;
      }
    }),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const selected = products.data?.data.find((p) => p.id === form.product_id);
  const insufficient =
    selected && Number(form.quantity) > Number(selected.stock_quantity);
  function selectProduct(e) {
    const item = products.data?.data.find((p) => p.id === e.target.value);
    const next = {
      ...form,
      product_id: item?.id || "",
      product_name: item?.name || "",
      total_amount: item
        ? (Number(item.unit_price) * Number(form.quantity || 1)).toFixed(2)
        : "",
    };
    setForm(next);
    localStorage.setItem(draftKey, JSON.stringify(next));
  }
  function change(e) {
    const next = { ...form, [e.target.name]: e.target.value };
    if (e.target.name === "quantity" && selected)
      next.total_amount = (
        Number(selected.unit_price) * Number(e.target.value || 0)
      ).toFixed(2);
    setForm(next);
    localStorage.setItem(draftKey, JSON.stringify(next));
  }
  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    const body = pending?.body || { ...form, quantity: Number(form.quantity) };
    if (
      !body.product_id ||
      !body.customer_name.trim() ||
      !body.product_name.trim() ||
      !Number.isInteger(body.quantity) ||
      body.quantity < 1 ||
      !/^\d{1,12}(\.\d{1,2})?$/.test(String(body.total_amount))
    ) {
      setError(
        "Chọn sản phẩm trong danh mục; kiểm tra tên, số lượng nguyên dương và tổng tiền không âm (tối đa 2 chữ số thập phân).",
      );
      return;
    }
    if (!pending && insufficient) {
      setError(
        "Không đủ hàng. Sản phẩm chỉ còn " + selected.stock_quantity + ".",
      );
      return;
    }
    const submission = pending || { body, key: crypto.randomUUID() };
    setPending(submission);
    localStorage.setItem(pendingKey, JSON.stringify(submission));
    setBusy(true);
    setError("");
    try {
      const r = await api("/api/orders", {
        method: "POST",
        headers: { "Idempotency-Key": submission.key },
        body: JSON.stringify(submission.body),
      });
      localStorage.removeItem(pendingKey);
      localStorage.removeItem(draftKey);
      setPending(null);
      setForm(blank);
      notify(
        "Đã lưu đơn #" + r.order.id.slice(0, 8).toUpperCase() + " vào MySQL.",
      );
      products.reload();
      navigate("orders");
    } catch (e) {
      setError(e.message);
      products.reload();
      if (!e.uncertain) {
        localStorage.removeItem(pendingKey);
        setPending(null);
      }
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeading
        title="Tạo đơn hàng mới"
        description="Ghi nhận giao dịch mới với thông tin rõ ràng, đầy đủ."
      />
      <div className="form-grid">
        <Panel
          title="Thông tin đơn hàng"
          subtitle="Các trường có dấu * là bắt buộc"
        >
          <form className="order-form" onSubmit={submit}>
            <ErrorBox error={error} />
            {pending && (
              <div className="notice">
                <Info size={18} />
                Yêu cầu đang chờ xác nhận. Thử lại sẽ gửi cùng mã yêu cầu để
                tránh trùng đơn.
              </div>
            )}
            <fieldset disabled={busy || !!pending}>
              <label>
                Tên khách hàng *
                <input
                  name="customer_name"
                  value={form.customer_name}
                  onChange={change}
                  required
                  maxLength={200}
                  placeholder="Ví dụ: Nguyễn Minh Anh"
                />
              </label>
              <label>
                Tìm sản phẩm trong danh mục
                <input
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  placeholder="Tìm theo mã hoặc tên sản phẩm…"
                />
              </label>
              <ErrorBox error={products.error} retry={products.reload} />
              <label>
                Sản phẩm *
                <select
                  name="product_id"
                  value={form.product_id || ""}
                  onChange={selectProduct}
                  required
                >
                  <option value="">
                    {products.loading ? "Đang tải danh mục…" : "Chọn sản phẩm"}
                  </option>
                  {form.product_id && !selected && (
                    <option value={form.product_id}>
                      {form.product_name} · Chọn lại để kiểm tra tồn kho
                    </option>
                  )}
                  {products.data?.data.map((p) => (
                    <option
                      key={p.id}
                      value={p.id}
                      disabled={Number(p.stock_quantity) === 0}
                    >
                      {p.sku} · {p.name} · Còn {p.stock_quantity}
                    </option>
                  ))}
                </select>
                {selected && (
                  <small>
                    Tồn kho: {selected.stock_quantity}. Đơn đang chờ cũng được
                    trừ tồn kho.
                  </small>
                )}
              </label>
              {insufficient && (
                <div className="notice" role="alert">
                  Không đủ hàng: chỉ còn {selected.stock_quantity}, bạn đang đặt{" "}
                  {form.quantity}.
                </div>
              )}
              <div className="two-fields">
                <label>
                  Số lượng *
                  <input
                    name="quantity"
                    type="number"
                    min="1"
                    max="1000000"
                    step="1"
                    value={form.quantity}
                    onChange={change}
                    required
                  />
                </label>
                <label>
                  Tổng tiền (VND) *
                  <input
                    name="total_amount"
                    type="number"
                    min="0"
                    max="999999999999.99"
                    step="0.01"
                    value={form.total_amount}
                    onChange={change}
                    required
                    placeholder="0"
                  />
                </label>
              </div>
              <label>
                Trạng thái ban đầu
                <select name="status" value={form.status} onChange={change}>
                  <option value="Pending">Đang chờ</option>
                  {can(user, "orders.update") && (
                    <>
                      <option value="Completed">Hoàn tất</option>
                      <option value="Cancelled">Đã hủy</option>
                    </>
                  )}
                </select>
              </label>
            </fieldset>
            <div className="form-footer">
              <button
                type="button"
                className="button secondary"
                onClick={() => navigate("orders")}
              >
                <ArrowLeft size={16} />
                Danh sách đơn
              </button>
              <button
                className="button primary"
                disabled={busy || (!pending && !!insufficient)}
              >
                <Save size={16} />
                {busy
                  ? "Đang gửi…"
                  : pending
                    ? "Kiểm tra / gửi lại yêu cầu"
                    : "Lưu đơn hàng"}
              </button>
            </div>
          </form>
        </Panel>
        <aside>
          <Panel title="Tóm tắt giao dịch">
            <div className="order-summary">
              <div>
                <span>Khách hàng</span>
                <strong>{form.customer_name || "Chưa nhập"}</strong>
              </div>
              <div>
                <span>Sản phẩm</span>
                <strong>{form.product_name || "Chưa nhập"}</strong>
              </div>
              <div>
                <span>Số lượng</span>
                <strong>{form.quantity}</strong>
              </div>
              <div className="summary-total">
                <span>Tổng giá trị đơn</span>
                <strong>{money(form.total_amount)}</strong>
              </div>
            </div>
          </Panel>
          <div className="guidance">
            <ShieldCheck size={25} />
            <h3>Lưu an toàn, không trùng lặp</h3>
            <p>
              Chỉ xác nhận thành công khi MySQL đã ghi nhận. Bản nháp được giữ
              trên trình duyệt nếu mất kết nối.
            </p>
            <p>
              Chỉ tạo đơn khi đủ tồn kho. Hủy đơn đang chờ sẽ hoàn lại số lượng
              vào kho. Đơn đã hoàn tất hoặc hủy không thể đổi về đang chờ.
            </p>
          </div>
        </aside>
      </div>
    </>
  );
}
