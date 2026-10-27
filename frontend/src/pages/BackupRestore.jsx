import { useState } from "react";
import {
  Download,
  RotateCcw,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import { api, date } from "../services/api";
import {
  useData,
  PageHeading,
  Panel,
  Empty,
  ErrorBox,
  Modal,
  Badge,
  Refresh,
} from "../components/common";
export default function BackupRestore({ notify }) {
  const { data, error, reload } = useData("/api/admin/backups"),
    [busy, setBusy] = useState(false),
    [err, setErr] = useState(""),
    [selected, setSelected] = useState(null),
    [confirmed, setConfirmed] = useState(false),
    [result, setResult] = useState(null);
  async function backup() {
    setBusy(true);
    setErr("");
    try {
      await api("/api/admin/backups", { method: "POST", body: "{}" });
      reload();
      notify("Đã tạo backup nhất quán và checksum SHA-256.");
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function restore() {
    setBusy(true);
    setErr("");
    try {
      const r = await api("/api/admin/restores", {
        method: "POST",
        body: JSON.stringify({
          backup_id: selected.id,
          confirmation: "RESTORE_TO_ISOLATED_DATABASE",
        }),
      });
      setResult(r);
      setSelected(null);
      notify(
        r.status === "Verified"
          ? "Đã phục hồi và đối chiếu thành công."
          : "Phục hồi có dữ liệu cần kiểm tra.",
      );
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeading
        title="Backup & Restore"
        description="Bảo vệ dữ liệu bằng những bản sao có thể kiểm chứng."
      >
        <Refresh onClick={reload} />
        <button className="button primary" disabled={busy} onClick={backup}>
          <Download size={17} />
          {busy ? "Đang xử lý…" : "Tạo bản sao lưu"}
        </button>
      </PageHeading>
      <div className="backup-intro">
        <ShieldCheck size={32} />
        <div>
          <h3>Phục hồi có kiểm chứng</h3>
          <p>
            Backup SQL nhất quán · SHA-256 · Database phục hồi cách ly · Đối
            chiếu từng bản ghi
          </p>
        </div>
        <span className="outline-tag">ADMIN ONLY</span>
      </div>
      <ErrorBox error={err || error} />
      <Panel
        title="Kho sao lưu"
        subtitle="File SQL lưu riêng trên máy chủ, không tải dữ liệu nhạy cảm ra trình duyệt"
      >
        {!data?.length ? (
          <Empty text="Chưa có bản sao lưu" />
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>BẢN SAO LƯU</th>
                  <th>THỜI ĐIỂM</th>
                  <th>KÍCH THƯỚC</th>
                  <th>TRẠNG THÁI</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.map((b) => (
                  <tr key={b.id}>
                    <td>
                      <strong className="order-code">
                        {b.id.slice(0, 8)}.sql
                      </strong>
                      <small title={b.sha256}>
                        SHA-256: {b.sha256?.slice(0, 18) || "—"}…
                      </small>
                    </td>
                    <td>{date(b.created_at)}</td>
                    <td>
                      {b.size_bytes
                        ? (b.size_bytes / 1024).toFixed(1) + " KB"
                        : "—"}
                    </td>
                    <td>
                      <Badge status={b.status} />
                    </td>
                    <td>
                      <button
                        className="button secondary"
                        disabled={busy || b.status !== "Success"}
                        onClick={() => {
                          setSelected(b);
                          setConfirmed(false);
                        }}
                      >
                        <RotateCcw size={15} />
                        Phục hồi thử
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      {result && (
        <Panel title="Kết quả đối chiếu" subtitle={result.target_database}>
          <div className="panel-padding">
            <Badge status={result.status} />
            <p>
              Trước: {result.report.orders_before} đơn · Sau:{" "}
              {result.report.orders_after} đơn
            </p>
            <p>
              Thiếu: {result.report.missing_orders.length} · Thay đổi:{" "}
              {result.report.changed_orders.length} · Phát sinh:{" "}
              {result.report.unexpected_orders.length}
            </p>
            <p>
              Kết quả tất cả bảng: <strong>{result.report.test_result}</strong>{" "}
              · Thời gian chạy restore: {result.report.restore_duration_ms} ms
            </p>
            <p className="muted">
              RTO/RPO: chưa đo. Database đang sử dụng không được chuyển đổi tự
              động.
            </p>
          </div>
        </Panel>
      )}
      {selected && (
        <Modal
          title="Xác nhận phục hồi cách ly"
          onClose={() => {
            if (!busy) setSelected(null);
          }}
        >
          <div className="notice">
            <AlertTriangle size={19} />
            Hệ thống tạo database mới omdrs_restore_… để kiểm chứng. Cần tài
            khoản MySQL có quyền CREATE DATABASE.
          </div>
          <p className="panel-padding">
            Bản sao: {selected.id}
            <br />
            Thời điểm: {date(selected.created_at)}
          </p>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            Tôi xác nhận phục hồi vào database cách ly mới và đối chiếu dữ liệu.
          </label>
          <div className="form-footer">
            <button
              className="button primary"
              disabled={!confirmed || busy}
              onClick={restore}
            >
              {busy ? "Đang phục hồi…" : "Phục hồi & kiểm chứng"}
            </button>
          </div>
          <ErrorBox error={err} />
        </Modal>
      )}
    </>
  );
}
