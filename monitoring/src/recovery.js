import { randomUUID } from "node:crypto";

export const stages = ["fault_started", "detected", "failover_started", "standby_active", "recovered"];
const detectedAt = incident => Date.parse(incident.timeline.find(e => e.stage === "detected")?.at);
export function sortIncidents(incidents) {
  return incidents.sort((a, b) => (detectedAt(b) || 0) - (detectedAt(a) || 0));
}
export function reconcileIncidentHistory(incidents, events) {
  // Recover only detections actually recorded by a probe. Never infer fault,
  // takeover or successful recovery timestamps from a Healthy event.
  for (const event of events) {
    if (event.component !== "Backend Primary" || event.from !== "Healthy" ||
        !["Offline", "Unhealthy"].includes(event.status) || !Number.isFinite(Date.parse(event.created_at))) continue;
    const matched = incidents.find(i => i.detection_event_id === event.id ||
      // Older versions wrote the timeline a few milliseconds after the health log.
      i.trigger !== "gateway_switch" && Math.abs(detectedAt(i) - Date.parse(event.created_at)) < 1000);
    if (matched) continue;
    incidents.push({ id: randomUUID(), mode: "Live", component: "Backend Primary",
      trigger: "primary_outage", detection_event_id: event.id, restored_from_history: true,
      verified_data_at: null, timeline: [{stage:"detected",at:event.created_at,source:"probe",
        note:"Khôi phục mốc phát hiện từ nhật ký chuyển Primary từ Healthy sang lỗi; chưa có mốc bắt đầu lỗi thực tế."}] });
  }
  sortIncidents(incidents);
  for (let n = 1; n < incidents.length; n++) {
    const older = incidents[n];
    if (!older.tracking_closed_at && !older.timeline.some(e => e.stage === "recovered")) {
      older.tracking_closed_at = incidents[n - 1].timeline.find(e => e.stage === "detected").at;
      older.tracking_close_reason = "new_outage";
    }
  }
  return incidents;
}
export function activeInstance(components) {
  const gateway = components.find((c) => c.name === "API Gateway");
  return gateway?.status === "Healthy" ? gateway.instance || null : null;
}
export function observeIncidents(incidents, previous, next, at) {
  const primary = next.find((c) => c.name === "Backend Primary");
  const old = previous.find((c) => c.name === "Backend Primary");
  let current = incidents.find((i) => !i.tracking_closed_at && !i.timeline.some((e) => e.stage === "recovered"));
  const outage = old?.status === "Healthy" && ["Offline", "Unhealthy"].includes(primary?.status);
  const switched = activeInstance(previous) === "primary" && activeInstance(next) === "standby";
  if (outage || switched && (!current || primary?.status === "Healthy" || current.timeline.some((e) => e.stage === "standby_active"))) {
    if (current) {
      current.tracking_closed_at = at;
      current.tracking_close_reason = "new_outage";
    }
    current = { id: randomUUID(), mode: "Live", component: "Backend Primary", verified_data_at: null,
      trigger: outage ? "primary_outage" : "gateway_switch",
      observation: {
        primary_last_healthy_at: outage ? old?.checked_at || null : null,
        gateway_last_primary_at: activeInstance(previous) === "primary"
          ? previous.find(c => c.name === "API Gateway")?.checked_at || null : null,
      },
      timeline: [{ stage: "detected", at, source: outage ? "probe" : "gateway",
        note: outage ? "Lần kiểm tra đầu tiên ghi nhận Primary không sẵn sàng."
          : "Quan sát Gateway chuyển từ Primary sang Standby; chưa xác nhận thời điểm xảy ra lỗi." }] };
    incidents.unshift(current);
  }
  if (current && !current.api_recovered_at) {
    const gateway = next.find(c => c.name === "API Gateway");
    if (gateway && ["Offline", "Unhealthy"].includes(gateway.status)) {
      current.observation ||= {};
      current.observation.gateway_unavailable_at ||= at;
    }
  }
  if (current && activeInstance(next) === "standby" && !current.timeline.some((e) => e.stage === "standby_active"))
    current.timeline.push({ stage: "standby_active", at, source: "gateway", note: "Gateway trả readiness Healthy từ instance standby; chưa xác nhận an toàn quyền ghi database." });
  if (current && activeInstance(next) === "standby" && !current.api_recovered_at) {
    current.api_recovered_at = current.timeline.find(e => e.stage === "standby_active").at;
    current.api_recovered_instance = "standby";
  }
  if (current && primary?.status === "Healthy" && activeInstance(next) === "primary") {
    current.api_recovered_at ||= at;
    current.api_recovered_instance ||= "primary";
    current.tracking_closed_at = at;
    current.tracking_close_reason = "primary_active";
  }
  return sortIncidents(incidents);
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
