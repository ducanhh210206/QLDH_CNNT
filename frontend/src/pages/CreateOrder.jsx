import { useState } from "react";
import { Save, ShieldCheck, ArrowLeft, Info } from "lucide-react";
import { api, money } from "../services/api";
import { PageHeading, Panel, ErrorBox } from "../components/common";
const blank = {
  customer_name: "",
  product_name: "",
  quantity: 1,
  total_amount: "",
  status: "Pending",
};
export default function CreateOrder({ notify, navigate }) {
  const [form, setForm] = useState(() => {
      try {
        return JSON.parse(localStorage.getItem("omdrs-draft")) || blank;
      } catch {
        return blank;
      }
    }),
    [pending, setPending] = useState(() => {
      try {
        return JSON.parse(localStorage.getItem("omdrs-pending"));
      } catch {
        return null;
      }
    }),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  function change(e) {
    const next = { ...form, [e.target.name]: e.target.value };
    setForm(next);
    localStorage.setItem("omdrs-draft", JSON.stringify(next));
  }
  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    const body = pending?.body || { ...form, quantity: Number(form.quantity) };
    if (
      !body.customer_name.trim() ||
      !body.product_name.trim() ||
      !Number.isInteger(body.quantity) ||
      body.quantity < 1 ||
      !/^\d{1,12}(\.\d{1,2})?$/.test(String(body.total_amount))
    ) {
      setError(
        "Kiểm tra tên, số lượng nguyên dương và tổng tiền không âm (tối đa 2 chữ số thập phân).",
      );
      return;
    }
    const submission = pending || { body, key: crypto.randomUUID() };
    setPending(submission);
    localStorage.setItem("omdrs-pending", JSON.stringify(submission));
    setBusy(true);
    setError("");
    try {
      const r = await api("/api/orders", {
        method: "POST",
        headers: { "Idempotency-Key": submission.key },
        body: JSON.stringify(submission.body),
      });
      localStorage.removeItem("omdrs-pending");
      localStorage.removeItem("omdrs-draft");
      setPending(null);
      setForm(blank);
      notify(
        "Đã lưu đơn #" + r.order.id.slice(0, 8).toUpperCase() + " vào MySQL.",
      );
      navigate("orders");
    } catch (e) {
      setError(e.message);
      if (!e.uncertain) {
        localStorage.removeItem("omdrs-pending");
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
                Tên sản phẩm *
                <input
                  name="product_name"
                  value={form.product_name}
                  onChange={change}
                  required
                  maxLength={200}
                  placeholder="Nhập tên sản phẩm"
                />
              </label>
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
                  <option value="Completed">Hoàn tất</option>
                  <option value="Cancelled">Đã hủy</option>
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
              <button className="button primary" disabled={busy}>
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
            <p>Đơn đã hoàn tất hoặc hủy sẽ không thể đổi về đang chờ.</p>
          </div>
        </aside>
      </div>
    </>
  );
}
