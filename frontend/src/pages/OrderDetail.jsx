import { useState } from "react";
import {
  useData,
  Modal,
  Badge,
  Loading,
  ErrorBox,
  Panel,
} from "../components/common";
import { api, money, date, statusName } from "../services/api";
export default function OrderDetail({ id, onClose, onChanged, notify }) {
  const order = useData("/api/orders/" + id),
    history = useData("/api/orders/" + id + "/history");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function update(status) {
    setBusy(true);
    setError("");
    try {
      await api("/api/orders/" + id + "/status", {
        method: "PATCH",
        body: JSON.stringify({ status, version: order.data.version }),
      });
      order.reload();
      history.reload();
      onChanged();
      notify("Đã cập nhật trạng thái và lịch sử.");
    } catch (e) {
      setError(e.message);
      if (e.code === "VERSION_CONFLICT") order.reload();
    } finally {
      setBusy(false);
    }
  }
  const o = order.data;
  return (
    <Modal title="Chi tiết đơn hàng" onClose={onClose}>
      <ErrorBox error={error || order.error} />
      {order.loading ? (
        <Loading />
      ) : (
        o && (
          <>
            <div className="detail-code">#{o.id}</div>
            <Badge status={o.status} />
            <div className="detail-grid">
              {[
                ["Khách hàng", o.customer_name],
                ["Sản phẩm", o.product_name],
                ["Số lượng", o.quantity],
                ["Tổng tiền", money(o.total_amount)],
                ["Ngày tạo", date(o.created_at)],
                ["Cập nhật lần cuối", date(o.updated_at)],
                ["Phiên bản", o.version],
              ].map(([k, v]) => (
                <div key={k}>
                  <small>{k}</small>
                  <strong>{v}</strong>
                </div>
              ))}
            </div>
            {o.status === "Pending" && (
              <div className="form-footer">
                <button
                  disabled={busy}
                  className="button danger"
                  onClick={() => update("Cancelled")}
                >
                  Hủy đơn
                </button>
                <button
                  disabled={busy}
                  className="button primary"
                  onClick={() => update("Completed")}
                >
                  Hoàn tất đơn
                </button>
              </div>
            )}
            <h3 className="section-title">Lịch sử thay đổi</h3>
            <ErrorBox error={history.error} />
            <ol className="timeline">
              {history.data?.map((h) => (
                <li key={h.id}>
                  <strong>
                    {h.old_status ? statusName(h.old_status) + " → " : ""}
                    {statusName(h.new_status)}
                  </strong>
                  <p>
                    {h.username} · {date(h.created_at)}
                  </p>
                </li>
              ))}
            </ol>
          </>
        )
      )}
    </Modal>
  );
}
