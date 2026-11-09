import { randomUUID } from "node:crypto";

export const stages = ["fault_started", "detected", "failover_started", "standby_active", "recovered"];
export function activeInstance(components) {
  const gateway = components.find((c) => c.name === "API Gateway");
  return gateway?.status === "Healthy" ? gateway.instance || null : null;
}
export function observeIncidents(incidents, previous, next, at) {
  const primary = next.find((c) => c.name === "Backend Primary");
  const old = previous.find((c) => c.name === "Backend Primary");
  let current = incidents.find((i) => !i.timeline.some((e) => e.stage === "recovered"));
  if (!current && old?.status === "Healthy" && ["Offline", "Unhealthy"].includes(primary?.status)) {
    current = { id: randomUUID(), mode: "Live", component: "Backend Primary", verified_data_at: null,
      timeline: [{ stage: "detected", at, source: "probe", note: "Lần kiểm tra đầu tiên ghi nhận Primary không sẵn sàng." }] };
    incidents.unshift(current);
  }
  if (current && activeInstance(next) === "standby" && !current.timeline.some((e) => e.stage === "standby_active"))
    current.timeline.push({ stage: "standby_active", at, source: "gateway", note: "Gateway trả readiness Healthy từ instance standby; chưa xác nhận an toàn quyền ghi database." });
  return incidents.slice(0, 100);
}
export function recordMilestone(incident, input, now = Date.now()) {
  const stage = input.stage;
  const timestamp = Date.parse(input.at);
  if (!stages.includes(stage) || stage === "detected" || !Number.isFinite(timestamp) || timestamp > now ||
      typeof input.note !== "string" || !input.note.trim() || input.note.length > 500)
    throw new Error("Mốc thời gian hoặc ghi chú không hợp lệ.");
  if (incident.timeline.some((e) => e.stage === stage)) throw new Error("Mốc này đã được ghi nhận, không thể ghi đè.");
  const events = [...incident.timeline, { stage, at: new Date(timestamp).toISOString(), note: input.note.trim(), source: "operator" }]
    .sort((a, b) => stages.indexOf(a.stage) - stages.indexOf(b.stage));
  if (events.some((e, index) => index && Date.parse(e.at) < Date.parse(events[index - 1].at)))
    throw new Error("Các mốc phải theo thứ tự bắt đầu lỗi → phát hiện → failover → tiếp quản → khôi phục.");
  if (stage === "recovered" && !events.some((e) => e.stage === "standby_active"))
    throw new Error("Cần ghi nhận máy dự phòng tiếp quản trước khi hoàn tất khôi phục.");
  let verified = incident.verified_data_at;
  if (input.verified_data_at) {
    const value = Date.parse(input.verified_data_at);
    const fault = events.find((e) => e.stage === "fault_started");
    if (stage !== "recovered" || !fault || !Number.isFinite(value) || value > Date.parse(fault.at))
      throw new Error("Mốc dữ liệu đối chiếu phải không muộn hơn lúc bắt đầu lỗi; cần ghi nhận bắt đầu lỗi trước.");
    verified = new Date(value).toISOString();
  }
  return { ...incident, timeline: events, verified_data_at: verified };
}
export function recoveryMetrics(incident) {
  const time = Object.fromEntries((incident?.timeline || []).map((e) => [e.stage, Date.parse(e.at)]));
  const difference = (end, start) => Number.isFinite(end) && Number.isFinite(start) && end >= start ? end - start : null;
  return {
    rto_ms: difference(time.recovered, time.fault_started),
    rpo_ms: difference(time.fault_started, incident?.verified_data_at ? Date.parse(incident.verified_data_at) : NaN),
    detection_ms: difference(time.detected, time.fault_started),
    failover_ms: difference(time.standby_active, time.failover_started),
    observed_recovery_ms: difference(time.recovered, time.detected),
  };
}
