import { Server, Database, Activity, ShieldCheck } from "lucide-react";
import {
  useData,
  PageHeading,
  Panel,
  Badge,
  ErrorBox,
  Refresh,
} from "../components/common";
import { date } from "../services/api";
export default function SystemMonitoring() {
  const { data, error, reload } = useData("/api/admin/system/status", 10000),
    metrics = useData("/api/admin/system/metrics", 10000);
  const components = [
    ...(data?.monitoring?.components || []),
    { name: "Database Primary", status: data?.backend?.database || "Unknown" },
    { name: "Database Standby", status: "Not Configured" },
    {
      name: "Monitoring Service",
      status: data?.monitoring?.status || "Unknown",
    },
  ];
  return (
    <>
      <PageHeading
        title="Giám sát hệ thống"
        description="Kiểm tra trạng thái thực tế mỗi 10 giây."
      >
        <Refresh onClick={reload} />
      </PageHeading>
      <ErrorBox error={error} />
      <div className="notice">
        <ShieldCheck size={19} />
        Kiến trúc Primary – Standby đang ở giai đoạn chuẩn bị. Chưa xác nhận HA
        hoặc chuyển quyền ghi liên máy.
      </div>
      <div className="service-grid">
        {components.map((c, i) => (
          <Panel
            key={c.name}
            title={c.name}
            action={i % 2 ? <Database size={20} /> : <Server size={20} />}
          >
            <div className="service-status">
              <Badge status={c.status} />
            </div>
            <div className="service-meta">
              <span>
                Phản hồi
                <strong>
                  {c.latency_ms != null ? c.latency_ms + " ms" : "—"}
                </strong>
              </span>
              <span>
                Kiểm tra cuối
                <strong>
                  {date(c.checked_at || data?.backend?.checked_at)}
                </strong>
              </span>
            </div>
          </Panel>
        ))}
      </div>
      <div className="stats-grid compact">
        <div className="stat-card">
          <span>Backend uptime</span>
          <strong>
            {metrics.data
              ? Math.floor(metrics.data.uptime_seconds) + " s"
              : "—"}
          </strong>
        </div>
        <div className="stat-card">
          <span>Bộ nhớ tiến trình</span>
          <strong>
            {metrics.data
              ? (metrics.data.memory_bytes / 1048576).toFixed(1) + " MB"
              : "—"}
          </strong>
        </div>
      </div>
      <Panel
        title="Nhật ký giám sát độc lập"
        subtitle="Lưu bởi tiến trình monitoring kể cả khi Backend mất kết nối"
      >
        <ErrorBox error={data?.monitoring?.message} />
        {data?.monitoring?.events?.length ? (
          <ol className="timeline">
            {[...data.monitoring.events].reverse().map((e) => (
              <li key={e.id}>
                <strong>
                  {e.component}: {e.from} → {e.status}
                </strong>
                <p>LIVE · {date(e.created_at)}</p>
              </li>
            ))}
          </ol>
        ) : (
          <p className="panel-padding muted">
            Chưa có chuyển trạng thái được ghi nhận.
          </p>
        )}
      </Panel>
    </>
  );
}
