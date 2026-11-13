import { useEffect, useState } from "react";
import { Server, Database, Activity, Clock } from "lucide-react";
import { useData, PageHeading, Panel, Badge, ErrorBox, Refresh } from "../components/common";
import { date } from "../services/api";
import { automaticRecoveryMetrics } from "../services/recoveryMetrics";
const labels = {
  fault_started: "Bắt đầu lỗi", detected: "Phát hiện lỗi", failover_started: "Bắt đầu failover",
  standby_active: "Máy dự phòng tiếp quản", recovered: "Hoàn tất khôi phục",
};
const duration = (ms) => ms == null ? "Chưa đo" : (ms / 1000).toLocaleString("vi-VN", { maximumFractionDigits: 3 }) + " giây";
export default function SystemMonitoring() {
  const status = useData("/api/admin/system/status", 10000);
  const runtime = useData("/api/admin/system/metrics", 10000);
  const [selected, setSelected] = useState("");
  const [historyPage, setHistoryPage] = useState(0);
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
  const measurement = automaticRecoveryMetrics(incident, serverNow, stale);
  const page = Math.min(historyPage, Math.max(0, Math.ceil(incidents.length / 10) - 1));
  const active = !stale && ["primary", "standby"].includes(monitor?.active_instance)
    ? monitor.active_instance : null;
  const components = monitor?.components?.length ? monitor.components : [
    { name: "Backend đang phục vụ trang này", ...data?.backend },
    { name: "Backend Primary", status: "Unknown" },
    { name: "Backend Standby", status: "Not Configured" },
    { name: "API Gateway", status: "Not Configured" },
  ];
  function refresh() { status.reload(); runtime.reload(); }
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
    <Panel title="3. Recovery Metrics" subtitle="Tự ghi số đo khi phát hiện sự cố và kiểm tra API qua Gateway; bộ đếm chạy mỗi giây, trạng thái lấy lại mỗi 10 giây." action={<Activity size={20} />}>
      <div className="monitor-summary">
        <strong>{selected ? "Đang xem lần đo đã chọn" : "Tự động — lần đo mới nhất"}</strong>
        {incident && <span>{date(incident.timeline.find(e => e.stage === "detected")?.at)} · {incident.id.slice(0, 8)}</span>}
        {selected && <button className="button" onClick={() => setSelected("")}>Theo dõi mới nhất</button>}
      </div>
      {!incident ? <p className="panel-padding muted">Monitoring sẽ tự tạo lần đo khi quan sát Primary từ Healthy sang lỗi hoặc Gateway chuyển từ Primary sang Standby.</p> : <>
        <div className="monitor-summary monitor-live-recovery">
          <strong>{measurement.state}{measurement.live ? ": " + duration(measurement.apiRto) : ""}</strong>
          {measurement.recoveredAt && <span>Gateway xác nhận {measurement.recoveredInstance === "standby" ? "Standby" : "Primary"} Healthy lúc {date(measurement.recoveredAt)}.</span>}
          <small>{stale ? "Đang mất dữ liệu Monitoring mới; bộ đếm tạm dừng. " : ""}Kết quả tự động là số đo quan sát API, chưa chứng minh giao dịch ghi và dữ liệu đã phục hồi đầy đủ.</small>
        </div>
        <div className="stats-grid compact monitor-metrics">{[
          ["RTO API — từ lúc phát hiện", duration(measurement.apiRto), measurement.live ? "Đang đo; tự chốt khi Gateway trả API Healthy." : "Phát hiện sự cố → API Healthy qua Gateway."],
          ["RPO dữ liệu", measurement.rpo == null ? "Chưa xác minh" : duration(measurement.rpo), measurement.rpo == null ? "Chưa có đối chiếu giao dịch tự động. Độ trễ replication không phải RPO." : "Giữ kết quả đối chiếu dữ liệu của bản ghi lịch sử."],
          ["Cửa sổ phát hiện lỗi", measurement.detectionWindow == null ? "Không có mẫu trước lỗi" : "≤ " + duration(measurement.detectionWindow), "Khoảng từ lần Primary Healthy cuối đến lần kiểm tra phát hiện lỗi; không phải giờ gây lỗi chính xác."],
          ["Chuyển Gateway — quan sát", measurement.gatewaySwitch == null ? "Không có mẫu trước chuyển" : (measurement.gatewayBound ? "≤ " : "") + duration(measurement.gatewaySwitch), measurement.gatewayBound ? "Cận trên từ mẫu Gateway phục vụ Primary cuối đến API phục hồi." : "Từ lần Gateway mất sẵn sàng đến khi API phục hồi; không phải thời điểm chạy lệnh failover."],
        ].map(([name, value, note]) => <div className="stat-card" key={name}><span>{name}</span><strong>{value}</strong><small>{note}</small></div>)}</div>
        <p className="panel-padding muted">Nếu phát hiện lỗi và API dự phòng Healthy trong cùng lượt kiểm tra, RTO API quan sát có thể là 0 giây. Bản cũ thiếu mẫu không được tự điền thời gian. Hệ thống chỉ đo và lưu lịch sử, không tự chuyển quyền ghi database.</p>
      </>}
    </Panel>
    <Panel title="4. Lịch sử các lần đo" subtitle="Mỗi sự cố có bản ghi riêng, lưu tại Monitoring và giữ qua các lần khởi động lại. Chọn Xem để đối chiếu số đo cũ." action={<Clock size={20} />}>
      {monitor?.persistence_error && <ErrorBox error="Nhật ký có lỗi đọc/ghi. Chưa thể bảo đảm dữ liệu đã được lưu đầy đủ." />}
      <div className="monitor-summary"><strong>Đã lưu {incidents.length} lần đo</strong></div>
      {incidents.length ? <>
        <div className="table-scroll"><table><thead><tr><th>PHÁT HIỆN / MÃ</th><th>TRẠNG THÁI</th><th>API PHỤC HỒI</th><th>RTO API</th><th>CỬA SỔ PHÁT HIỆN</th><th>CHUYỂN GATEWAY</th><th>RPO DỮ LIỆU</th><th></th></tr></thead>
          <tbody>{incidents.slice(page * 10, page * 10 + 10).map(i => {
            const m = automaticRecoveryMetrics(i, serverNow, stale);
            return <tr key={i.id}><td>{date(i.timeline.find(e => e.stage === "detected")?.at)}<br /><small>{i.id.slice(0, 8)}{i.restored_from_history ? " · Từ nhật ký" : ""}</small></td>
              <td>{m.state}</td><td>{date(m.recoveredAt)}{m.recoveredInstance ? " · " + m.recoveredInstance : ""}</td>
              <td>{duration(m.apiRto)}{m.live ? " (đang đo)" : ""}</td>
              <td>{m.detectionWindow == null ? "—" : "≤ " + duration(m.detectionWindow)}</td>
              <td>{m.gatewaySwitch == null ? "—" : (m.gatewayBound ? "≤ " : "") + duration(m.gatewaySwitch)}</td>
              <td>{m.rpo == null ? "Chưa xác minh" : duration(m.rpo)}</td>
              <td><button className="button" onClick={() => setSelected(i.id)} aria-label={"Xem lần đo " + i.id.slice(0, 8)}>Xem</button></td></tr>;
          })}</tbody></table></div>
        <div className="monitor-summary"><button className="button" disabled={page === 0} onClick={() => setHistoryPage(page - 1)}>Trước</button><span>Trang {page + 1} / {Math.ceil(incidents.length / 10)}</span><button className="button" disabled={(page + 1) * 10 >= incidents.length} onClick={() => setHistoryPage(page + 1)}>Sau</button></div>
        {selected && incident && <details className="panel-padding" key={incident.id} open><summary>Chi tiết bản ghi {incident.id.slice(0, 8)}</summary>
          {incident.restored_from_history && <p className="muted">Khôi phục từ nhật ký quan sát; không suy diễn các mốc chưa có bằng chứng.</p>}
          <ol className="timeline">{incident.timeline.map(e => <li key={e.stage}><strong>{labels[e.stage] || e.stage}</strong><p>{date(e.at)} · {e.note}</p></li>)}</ol>
        </details>}
      </> : <p className="panel-padding muted">Chưa có lần đo. Giữ Monitoring chạy từ lúc Primary còn Healthy để quan sát sự cố tiếp theo.</p>}
      <details className="panel-padding"><summary>Lịch sử chuyển trạng thái máy chủ</summary>
        <ol className="timeline">{[...(monitor?.events || [])].reverse().map(e => <li key={e.id}><strong>{e.component}: {e.from} → {e.status}</strong><p>{date(e.created_at)}</p></li>)}</ol>
      </details>
    </Panel>
    <ErrorBox error={runtime.error} />
    <div className="monitor-summary muted"><span>Backend uptime: {runtime.data ? Math.floor(runtime.data.uptime_seconds) + " s" : "—"}</span>
      <span>Bộ nhớ: {runtime.data ? (runtime.data.memory_bytes / 1048576).toFixed(1) + " MB" : "—"}</span></div>
  </div>;
}
