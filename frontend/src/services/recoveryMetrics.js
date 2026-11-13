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
