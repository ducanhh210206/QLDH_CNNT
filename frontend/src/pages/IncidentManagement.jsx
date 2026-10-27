import { useState } from "react";
import { Zap, ServerCrash, WifiOff, Database, Play, Info } from "lucide-react";
import { api, date } from "../services/api";
import {
  useData,
  PageHeading,
  Panel,
  ErrorBox,
  Empty,
  Badge,
  Modal,
} from "../components/common";
const cases = [
  [
    "Power Outage",
    "Mất điện",
    Zap,
    "Quy trình phản ứng khi máy Primary ngừng hoạt động.",
  ],
  [
    "Server Crash",
    "Lỗi máy chủ",
    ServerCrash,
    "Phát hiện lỗi Backend và đánh giá điều kiện chuyển dịch vụ.",
  ],
  [
    "Network Failure",
    "Mất kết nối",
    WifiOff,
    "Giữ bản nháp và xử lý kết quả giao dịch chưa xác định.",
  ],
  [
    "Data Loss",
    "Mất dữ liệu",
    Database,
    "Sao lưu, phục hồi cách ly và đối chiếu dữ liệu.",
  ],
];
export default function IncidentManagement({ notify }) {
  const { data, error, reload } = useData("/api/admin/incidents"),
    [busy, setBusy] = useState(false),
    [err, setErr] = useState(""),
    [selected, setSelected] = useState(null);
  async function run(type) {
    setBusy(true);
    setErr("");
    try {
      const r = await api("/api/admin/simulations", {
        method: "POST",
        body: JSON.stringify({ type }),
      });
      setSelected(r);
      reload();
      notify("Đã ghi nhận mô phỏng. Không thay đổi hạ tầng.");
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeading
        title="Quản lý sự cố"
        description="Chuẩn bị quy trình phục hồi trước khi sự cố xảy ra."
      />
      <div className="notice">
        <Info size={18} />
        <strong>DEMO MODE</strong> · Mô phỏng quy trình trên giao diện. Không
        dừng máy chủ, ngắt mạng hoặc xóa dữ liệu thật.
      </div>
      <ErrorBox error={err || error} />
      <div className="incident-grid">
        {cases.map(([type, name, Icon, desc]) => (
          <Panel
            key={type}
            title={name}
            subtitle={type}
            action={<Icon size={23} />}
          >
            <p className="incident-description">{desc}</p>
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => run(type)}
            >
              <Play size={15} />
              Chạy mô phỏng
            </button>
          </Panel>
        ))}
      </div>
      <Panel
        title="Lịch sử mô phỏng"
        subtitle="Sự kiện Live từ health check nằm trong trang Giám sát hệ thống"
      >
        {!data?.length ? (
          <Empty text="Chưa có mô phỏng nào" />
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>LOẠI SỰ CỐ</th>
                  <th>CHẾ ĐỘ</th>
                  <th>TRẠNG THÁI</th>
                  <th>THỜI ĐIỂM</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.map((i) => (
                  <tr key={i.id}>
                    <td>{i.type}</td>
                    <td>
                      <span className="soft-tag">{i.mode}</span>
                    </td>
                    <td>
                      <Badge status={i.status} />
                    </td>
                    <td>{date(i.created_at)}</td>
                    <td>
                      <button
                        className="text-button"
                        onClick={() => setSelected(i)}
                      >
                        Diễn biến →
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      {selected && (
        <Modal
          title={selected.type + " · DEMO"}
          onClose={() => setSelected(null)}
        >
          <ol className="timeline">
            {(typeof selected.timeline === "string"
              ? JSON.parse(selected.timeline)
              : selected.timeline
            ).map((t, i) => (
              <li key={i}>
                <strong>{t.status}</strong>
                <p>{t.message}</p>
                <small>{date(t.at)}</small>
              </li>
            ))}
          </ol>
        </Modal>
      )}
    </>
  );
}
