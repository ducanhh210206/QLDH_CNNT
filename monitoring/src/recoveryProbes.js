import { randomUUID } from "node:crypto";

const path = "/api/monitoring/recovery-probes";
const maxProbes = 120;
const maxAgeMs = 30 * 60_000;

export function createRecoveryProbes({ gateway, token, fetchProbe = fetch, now = Date.now }) {
  const configured = Boolean(gateway) && token.length >= 32;
  async function post(route, body) {
    const response = await fetchProbe(gateway.replace(/\/+$/, "") + path + route, {
      method: "POST",
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(4000),
      redirect: "error",
    });
    if (!response.ok) throw new Error("Probe API returned HTTP " + response.status);
    return response.json();
  }

  return {
    configured,
    async record(samples) {
      const id = randomUUID();
      const response = await post("", { id });
      if (response.instance !== "primary" || response.id !== id) throw new Error("Invalid Primary probe");
      const timestamp = now();
      return [...samples.filter(sample => Date.parse(sample.at) >= timestamp - maxAgeMs), {
        id, at: new Date(timestamp).toISOString(),
      }].slice(-maxProbes);
    },
    async verify(incident, samples) {
      const detectedAt = incident.timeline.find(event => event.stage === "detected")?.at;
      const faultAt = incident.timeline.find(event => event.stage === "fault_started")?.at;
      const referenceAt = faultAt || detectedAt;
      const referenceMs = Date.parse(referenceAt);
      const candidates = samples
        .filter(sample => {
          const timestamp = Date.parse(sample.at);
          return timestamp <= referenceMs && timestamp >= referenceMs - maxAgeMs;
        })
        .slice(-maxProbes);
      const selection = { reference_at: referenceAt, reference: faultAt ? "fault_started" : "detected" };
      if (!candidates.length) return { ...selection, status: "no_samples" };
      const ids = candidates.map(sample => sample.id);
      const response = await post("/check", { ids });
      if (response.instance !== "standby" || !Array.isArray(response.ids) || response.ids.some(id => !ids.includes(id))) {
        throw new Error("Invalid Standby probe result");
      }
      const found = new Set(response.ids);
      const firstMissing = candidates.findIndex(sample => !found.has(sample.id));
      const verified = firstMissing < 0 ? candidates.at(-1) : candidates[firstMissing - 1];
      return {
        ...selection,
        status: verified ? "verified" : "no_matching_prefix",
        checked_at: new Date(now()).toISOString(),
        samples: candidates.length,
        missing: candidates.length - found.size,
        ...(verified && { probe_id: verified.id, verified_at: verified.at, rpo_ms: referenceMs - Date.parse(verified.at) }),
      };
    },
  };
}
