import { useState } from "react";
import {
  Download,
  RotateCcw,
  ShieldCheck,
  AlertTriangle,
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
    [confirmationCode, setConfirmationCode] = useState(''),
    [uncertainApply, setUncertainApply] = useState(false),
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
    if (busy || uncertainApply) return;
    setBusy(true);
    setErr("");
    try {
      const r = await api("/api/admin/restores/apply", {
        method: "POST",
        body: JSON.stringify({
          backup_id: selected.id,
          confirmation: 'RESTORE_CURRENT_DATABASE:' + selected.id,
        }),
      });
      setResult(r);
      setSelected(null);
      notify(
        r.status === 'Applied' ? 'Đã đưa dữ liệu đang sử dụng về bản backup. Tải lại trang; bạn có thể cần đăng nhập lại.' : r.status === "Verified"
          ? "Đã phục hồi và đối chiếu thành công."
          : "Phục hồi có dữ liệu cần kiểm tra.",
      );
      reload();
    } catch (e) {
      if (e.uncertain) {
        setUncertainApply(true);
        setErr('Chưa xác định tác vụ phục hồi đã hoàn tất chưa. Không bấm lại; kiểm tra dữ liệu và nhật ký restore_records trước.');
      } else setErr(e.message);
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
            Backup SQL nhất quán · SHA-256 · Kiểm chứng trước khi khôi phục dữ liệu đang dùng
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
                      <button className="button secondary" disabled={busy || b.status !== 'Success' || b.file_available === false}
                        onClick={() => {setSelected(b);setConfirmed(false);setConfirmationCode('');setUncertainApply(false);}}>
                        <RotateCcw size={15} /> Khôi phục dữ liệu đang dùng
                      </button>
                      {b.file_available === false && <small>Backend hiện tại không có file backup này.</small>}
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
              Trước: {result.report.current_orders_before ?? result.report.orders_before} đơn · Sau:{" "}
              {result.report.orders_after} đơn
            </p>
            {result.status === 'Applied' && <p>Đơn phát sinh sau backup bị loại bỏ: {result.report.removed_later_orders}. Đối chiếu với backup:</p>}
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
              {result.status === 'Applied' ? 'Dữ liệu đang sử dụng đã quay về bản backup. Tải lại danh sách đơn hàng để kiểm tra.' : 'RTO/RPO: chưa đo. Đây là kết quả phục hồi cách ly.'}
            </p>
            {result.report.rollback_backup_id && <p>Bản sao trước phục hồi để quay lui: {result.report.rollback_backup_id}</p>}
            {result.status === 'Applied' && <button className="button primary" onClick={() => window.location.reload()}>Tải lại hệ thống</button>}
            {result.audit_saved === false && <p>Đã phục hồi dữ liệu nhưng chưa lưu được nhật ký kết quả. Ghi lại bản sao quay lui ở trên.</p>}
          </div>
        </Panel>
      )}
      {selected && (
        <Modal
          title="Khôi phục dữ liệu đang sử dụng"
          onClose={() => {
            if (!busy) setSelected(null);
          }}
        >
          <div className="notice">
            <AlertTriangle size={19} />
            Đơn hàng, sản phẩm, tồn kho, tài khoản và dữ liệu nghiệp vụ sẽ trở về thời điểm backup. Đơn tạo sau đó sẽ bị loại bỏ. Hệ thống tạo bản sao quay lui, kiểm chứng rồi thay dữ liệu trong một giao dịch.
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
            Tôi xác nhận đã tạm dừng thao tác trên cả hai backend và chấp nhận loại bỏ dữ liệu phát sinh sau backup.
          </label>
          <div className="panel-padding">
            <p>Lịch sử backup/restore, phiên bản cấu trúc và mẫu Monitoring được giữ lại. Chỉ các backend cùng database này nhận thay đổi; MySQL replica riêng cần được kiểm tra đồng bộ.</p>
            <label>Nhập mã {selected.id.slice(0,8)} để xác nhận<input value={confirmationCode} onChange={e => setConfirmationCode(e.target.value)} autoComplete="off" /></label>
          </div>
          <div className="form-footer">
            <button
              className="button primary"
              disabled={!confirmed || busy || uncertainApply || confirmationCode !== selected.id.slice(0,8)}
              onClick={restore}
            >
              {busy ? 'Đang phục hồi…' : 'Khôi phục dữ liệu đang dùng'}
            </button>
          </div>
          <ErrorBox error={err} />
        </Modal>
      )}
    </>
  );
}
