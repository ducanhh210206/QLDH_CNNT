// Live counters never manufacture missing fault, failover or data evidence.
export function liveRecoveryMetrics(incident, now, stale = false) {
  const times = Object.fromEntries((incident?.timeline || []).map((event) => [event.stage, Date.parse(event.at)]));
  const delta = (end, start) => Number.isFinite(end) && Number.isFinite(start) && end >= start ? end - start : null;
  const stopped = !!incident?.tracking_closed_at || Number.isFinite(times.recovered);
  const metric = (end, start) => {
    const value = delta(times[end], times[start]);
    if (value != null) return { value, live: false };
    if (!stopped && !stale && Number.isFinite(times[start]) && !Number.isFinite(times[end]))
      return { value: delta(now, times[start]), live: true };
    return { value: null, live: false };
  };
  const observationEnd = times.standby_active ?? times.recovered;
  const observation = delta(observationEnd, times.detected);
  return {
    rto: metric('recovered', 'fault_started'),
    failover: metric('standby_active', 'failover_started'),
    detection: delta(times.detected, times.fault_started),
    rpo: delta(times.fault_started, Date.parse(incident?.verified_data_at)),
    observation: observation ?? (!stopped && !stale ? delta(now, times.detected) : null),
    observationLive: observation == null && !stopped && !stale && Number.isFinite(times.detected),
    standbyObserved: Number.isFinite(times.standby_active),
  };
}

export function automaticRecoveryMetrics(incident, now, stale = false) {
  const time = Object.fromEntries((incident?.timeline || []).map(e => [e.stage, Date.parse(e.at)]));
  const delta = (end, start) => Number.isFinite(end) && Number.isFinite(start) && end >= start ? end - start : null;
  const recovered = Date.parse(incident?.api_recovered_at ||
    incident?.timeline?.find(e => e.stage === 'standby_active')?.at);
  const pending = !!incident && !Number.isFinite(recovered) && !incident.tracking_closed_at;
  const end = Number.isFinite(recovered) ? recovered : !stale && pending ? now : NaN;
  const unavailable = Date.parse(incident?.observation?.gateway_unavailable_at);
  const lastPrimary = Date.parse(incident?.observation?.gateway_last_primary_at);
  const gatewayStart = Number.isFinite(unavailable) ? unavailable : lastPrimary;
  return {
    apiRto: delta(end, time.detected),
    live: pending && !stale,
    detectionWindow: delta(time.detected, Date.parse(incident?.observation?.primary_last_healthy_at)),
    gatewaySwitch: delta(end, gatewayStart),
    gatewayBound: !Number.isFinite(unavailable),
    // Legacy verified evidence remains readable, but replication lag is not RPO.
    rpo: delta(time.fault_started, Date.parse(incident?.verified_data_at)),
    recoveredAt: Number.isFinite(recovered) ? new Date(recovered).toISOString() : null,
    recoveredInstance: incident?.api_recovered_instance || (Number.isFinite(time.standby_active) ? 'standby' : null),
    state: Number.isFinite(recovered) ? 'API đã phục hồi' : incident?.tracking_closed_at
      ? 'Đã kết thúc theo dõi' : stale ? 'Mất dữ liệu giám sát mới' : 'Đang đo',
  };
}
