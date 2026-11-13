import { useEffect, useState } from "react";
import { Server, Database, Activity, Clock } from "lucide-react";
import { useData, PageHeading, Panel, Badge, ErrorBox, Refresh } from "../components/common";
import { api, date } from "../services/api";
import { liveRecoveryMetrics } from "../services/recoveryMetrics";
const labels = {
  fault_started: "Bắt đầu lỗi", detected: "Phát hiện lỗi", failover_started: "Bắt đầu failover",
  standby_active: "Máy dự phòng tiếp quản", recovered: "Hoàn tất khôi phục",
};
const duration = (ms) => ms == null ? "Chưa đo" : (ms / 1000).toLocaleString("vi-VN", { maximumFractionDigits: 3 }) + " giây";
export default function SystemMonitoring() {
  const status = useData("/api/admin/system/status", 10000);
  const runtime = useData("/api/admin/system/metrics", 10000);
  const [selected, setSelected] = useState("");
  const [saveError, setSaveError] = useState("");
  const [busy, setBusy] = useState(false);
  const [clock, setClock] = useState(() => ({ now: Date.now(), receivedAt: Date.now() }));
  const data = status.data, monitor = data?.monitoring;
  useEffect(() => {
    const receivedAt = Date.now();
    setClock({ now: receivedAt, receivedAt });
    const timer = setInterval(() => setClock({ now: Date.now(), receivedAt }), 1000);
    return () => clearInterval(timer);
  }, [monitor]);
  const incidents = monitor?.incidents || [];
  const incident = incidents.find((i) => i.id === selected) || incidents[0];
  const replication = monitor?.replication;
  const checked = Date.parse(monitor?.checked_at);
  const stale = !!status.error || !Number.isFinite(checked) || Date.now() - checked > Math.max(30000, (monitor?.poll_interval_ms || 10000) * 2 + 10000);
  const serverNow = Date.parse(monitor?.server_time || monitor?.checked_at) + Math.max(0, clock.now - clock.receivedAt);
  const liveMetrics = liveRecoveryMetrics(incident, serverNow, stale);
  const active = !stale && ["primary", "standby"].includes(monitor?.active_instance)
    ? monitor.active_instance : null;
  const components = monitor?.components?.length ? monitor.components : [
    { name: "Backend đang phục vụ trang này", ...data?.backend },
    { name: "Backend Primary", status: "Unknown" },
    { name: "Backend Standby", status: "Not Configured" },
    { name: "API Gateway", status: "Not Configured" },
  ];
  function refresh() { status.reload(); runtime.reload(); }
  async function save(e) {
    e.preventDefault();
    if (busy) return;
    const form = e.currentTarget, values = Object.fromEntries(new FormData(form));
    setBusy(true); setSaveError("");
    try {
      await api("/api/admin/system/incidents/" + incident.id + "/milestones", {
        method: "POST", body: JSON.stringify({ stage: values.stage, note: values.note,
          at: new Date(values.at).toISOString(),
          ...(values.verified_data_at ? { verified_data_at: new Date(values.verified_data_at).toISOString() } : {}) }),
      });
      form.reset(); status.reload();
    } catch (e) { setSaveError(e.message); } finally { setBusy(false); }
  }
  return <div className="monitoring-page">
    <PageHeading title="Giám sát hệ thống" description="Theo dõi máy chủ, đồng bộ dữ liệu và thời gian khôi phục mỗi 10 giây.">
      <Refresh onClick={refresh} />
    </PageHeading>
    <div className={`monitor-active-line${active ? " is-" + active : ""}`} role="status" aria-live="polite">
      <Server size={22} aria-hidden="true" />
      <div><strong>{active === "primary" ? "Đang phục vụ qua Gateway: PRIMARY — Máy chính"
        : active === "standby" ? "Đang phục vụ qua Gateway: STANDBY — Máy dự phòng"
        : "Đang phục vụ qua Gateway: Chưa xác định"}</strong>
        <p>{active ? "Kiểm tra cuối: " + date(monitor?.checked_at)
          : "Chưa có xác nhận mới từ Monitoring và Gateway. Bấm Làm mới để kiểm tra."}</p>
      </div>
    </div>
    <ErrorBox error={status.error || monitor?.message} retry={refresh} />
    {stale && <div className="notice">Chưa có dữ liệu giám sát mới. Trạng thái dưới đây có thể đã cũ; chưa thể xác nhận máy đang Active.</div>}
    <Panel title="1. Server Status" subtitle="Active được xác định từ instance trả về qua API Gateway; không suy đoán từ việc máy còn chạy." action={<Server size={20} />}>
      <div className="service-grid monitor-services">{components.map((c) => <div className="monitor-service" key={c.name}>
        <h4>{c.name}</h4><Badge status={stale ? "Unknown" : c.status || "Unknown"} />
        <p>Database: {c.database || "Chưa xác định"}</p>
        <p>Phản hồi: {c.latency_ms == null ? "—" : c.latency_ms + " ms"}</p>
        <small>Kiểm tra: {date(c.checked_at)}</small>
      </div>)}</div>
    </Panel>
    <Panel title="2. Database Replication" subtitle="Đọc trực tiếp MySQL Standby. Độ trễ replication không phải RPO và không chứng minh toàn bộ dữ liệu giống nhau." action={<Database size={20} />}>
      <div className="monitor-summary"><Badge status={stale ? "Unknown" : replication?.status || "Not Configured"} />
        <span>Độ trễ: {stale || replication?.lag_seconds == null ? "Chưa đo" : replication.lag_seconds + " giây"}</span>
        <span>Áp dụng giao dịch cuối: {date(replication?.last_applied_at)}</span>
        <span>Kiểm tra cuối: {date(replication?.checked_at)}</span>
      </div>
      {(replication?.message || replication?.timestamp_message) && <p className="panel-padding muted">{replication.message || replication.timestamp_message}</p>}
      {!replication && <p className="panel-padding muted">Chưa có nguồn đọc replication. Cấu hình MySQL Standby tại tiến trình Monitoring.</p>}
      {!!replication?.channels?.length && <div className="table-scroll"><table><thead><tr><th>KÊNH</th><th>LUỒNG NHẬN</th><th>LUỒNG ÁP DỤNG</th><th>TRẠNG THÁI</th></tr></thead>
        <tbody>{replication.channels.map((c) => <tr key={c.name}><td>{c.name}</td><td>{c.io_running}</td><td>{c.sql_running}</td><td><Badge status={stale ? "Unknown" : c.status} /></td></tr>)}</tbody></table></div>}
    </Panel>
    <Panel title="3. Recovery Metrics" subtitle="Bộ đếm cập nhật mỗi giây; trạng thái máy được lấy lại mỗi 10 giây. Mặc định tự theo dõi sự cố mới nhất." action={<Activity size={20} />}>
      <div className="monitor-summary"><label>Sự cố <select aria-label="Chọn sự cố" value={selected} onChange={(e) => { setSelected(e.target.value); setSaveError(""); }}>
        <option value="">{incidents.length ? "Tự động — sự cố mới nhất" : "Chưa ghi nhận sự cố thực tế"}</option>
        {incidents.map((i) => <option key={i.id} value={i.id}>{date(i.timeline.find((e) => e.stage === "detected")?.at)} · {i.id.slice(0, 8)}</option>)}
      </select></label><span>Đã lưu {incidents.length} lần theo dõi. Chọn một lần cũ để xem lại timeline và số đo.</span></div>
      {incident?.restored_from_history && <p className="panel-padding muted">Lần này được khôi phục từ nhật ký phát hiện lỗi. Những mốc không có trong nhật ký vẫn để trống; không phải một lần diễn tập mới vừa bắt đầu.</p>}
      {incident && <div className="monitor-summary monitor-live-recovery">
        <strong>{liveMetrics.observationLive ? "Đang theo dõi chuyển đổi: " : "Từ lần ghi nhận sự cố đến Standby Healthy: "}{duration(liveMetrics.observation)}</strong>
        <span>Sự cố: {date(incident.timeline.find((e) => e.stage === "detected")?.at)} · {incident.id.slice(0, 8)}</span>
        <span>{stale ? "Tạm dừng bộ đếm: chưa có dữ liệu Monitoring mới."
          : liveMetrics.standbyObserved ? "Gateway đã quan sát Standby Healthy. Cần kiểm chứng giao dịch để xác nhận hoàn tất khôi phục."
          : incident.tracking_closed_at ? "Đã kết thúc theo dõi lần chuyển này; các mốc xác nhận còn thiếu vẫn được giữ nguyên."
          : "Đang chờ Gateway xác nhận Standby tiếp quản."}</span>
        <small>Đây là thời gian quan sát, không thay thế RTO/RPO thực tế. Nếu cả phát hiện và tiếp quản được ghi trong cùng lượt kiểm tra, kết quả có thể là 0 giây.</small>
      </div>}
      <div className="stats-grid compact monitor-metrics">{[
        ["RTO", liveMetrics.rto.value, liveMetrics.rto.live, "Cần mốc bắt đầu lỗi và hoàn tất khôi phục."],
        ["RPO theo mốc dữ liệu đã đối chiếu", liveMetrics.rpo, false, "Cần mốc bắt đầu lỗi và dữ liệu phục hồi đã đối chiếu."],
        ["Thời gian phát hiện", liveMetrics.detection, false, "Cần mốc bắt đầu lỗi và phát hiện lỗi."],
        ["Thời gian chuyển sang dự phòng", liveMetrics.failover.value, liveMetrics.failover.live, "Cần mốc bắt đầu failover và Standby tiếp quản."],
      ].map(([name, value, running, missing]) => <div className="stat-card" key={name}><span>{name}</span><strong>{duration(value)}</strong>
        <small>{running ? "Đang đo — chưa chốt kết quả." : value == null ? missing : "Tính từ các mốc đã ghi nhận."}</small></div>)}</div>
      <p className="panel-padding muted">RTO = khôi phục − bắt đầu lỗi. RPO = bắt đầu lỗi − mốc dữ liệu cuối đã phục hồi và đối chiếu. Phát hiện = phát hiện − bắt đầu lỗi. Chuyển máy = tiếp quản − bắt đầu failover. Thiếu mốc sẽ hiện “Chưa đo”. Sai số quan sát chịu ảnh hưởng chu kỳ kiểm tra và thời gian phản hồi.</p>
    </Panel>
    <Panel title="4. Incident Timeline" subtitle="Lưu bởi Monitoring độc lập; vẫn ghi khi Backend Primary mất kết nối. Không tự thực hiện failover." action={<Clock size={20} />}>
      {monitor?.persistence_error && <ErrorBox error="Nhật ký có lỗi đọc/ghi. Chưa thể bảo đảm dữ liệu đã được lưu đầy đủ." />}
      {incident ? <>
        <ol className="timeline">{Object.entries(labels).map(([stage, label]) => {
          const entry = incident.timeline.find((e) => e.stage === stage);
          return <li key={stage}><strong>{label}</strong><p>{entry ? date(entry.at) : "Chưa ghi nhận"}</p>
            {entry && <p>{entry.source === "operator" ? "Người vận hành" : entry.source === "gateway" ? "Quan sát Gateway" : "Kiểm tra tự động"} · {entry.note}</p>}</li>;
        })}</ol>
        <form className="order-form monitor-form" onSubmit={save} key={incident.id}>
          <h4>Bổ sung mốc thực tế</h4><p className="muted">Nhập giờ xảy ra sự kiện theo bằng chứng. Thời gian trên form theo múi giờ máy bạn; dữ liệu lưu UTC. Mốc đã lưu không được ghi đè.</p>
          <ErrorBox error={saveError} />
          <fieldset disabled={busy || stale}><label>Mốc sự kiện<select name="stage" required>
            {Object.entries(labels).filter(([key]) => key !== "detected" && !incident.timeline.some((e) => e.stage === key)).map(([key, text]) => <option key={key} value={key}>{text}</option>)}
          </select></label><label>Thời điểm xảy ra<input type="datetime-local" name="at" step="0.001" required /></label>
          <label>Mốc dữ liệu cuối đã phục hồi và đối chiếu (chỉ khi hoàn tất khôi phục)<input type="datetime-local" name="verified_data_at" step="0.001" /></label>
          <label>Ghi chú / bằng chứng<textarea name="note" required maxLength={500} /></label></fieldset>
          <button className="button primary" disabled={busy || stale || incident.timeline.length >= 5}>{busy ? "Đang lưu…" : "Lưu mốc thời gian"}</button>
        </form>
      </> : <p className="panel-padding muted">Chưa ghi nhận sự cố thực tế. Monitoring tạo timeline khi quan sát Primary chuyển từ Healthy sang lỗi; sự cố Demo không được dùng để tính số đo thực tế.</p>}
      <details className="panel-padding"><summary>Lịch sử chuyển trạng thái máy chủ</summary>
        <ol className="timeline">{[...(monitor?.events || [])].reverse().map((e) => <li key={e.id}><strong>{e.component}: {e.from} → {e.status}</strong><p>{date(e.created_at)}</p></li>)}</ol>
      </details>
    </Panel>
    <ErrorBox error={runtime.error} />
    <div className="monitor-summary muted"><span>Backend uptime: {runtime.data ? Math.floor(runtime.data.uptime_seconds) + " s" : "—"}</span>
      <span>Bộ nhớ: {runtime.data ? (runtime.data.memory_bytes / 1048576).toFixed(1) + " MB" : "—"}</span></div>
  </div>;
}
