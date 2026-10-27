import { createHash } from "node:crypto";
export function canonical(rows) {
  return rows
    .map((row) =>
      Object.fromEntries(
        Object.entries(row).sort(([a], [b]) => a.localeCompare(b)),
      ),
    )
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));
}
export function digest(data) {
  return createHash("sha256")
    .update(typeof data === "string" ? data : JSON.stringify(canonical(data)))
    .digest("hex");
}
export function compareOrders(before, after) {
  const a = new Map(canonical(before).map((r) => [r.id, r])),
    b = new Map(canonical(after).map((r) => [r.id, r]));
  const missing = [...a.keys()].filter((id) => !b.has(id)),
    unexpected = [...b.keys()].filter((id) => !a.has(id)),
    changed = [...a.keys()].filter(
      (id) =>
        b.has(id) && JSON.stringify(a.get(id)) !== JSON.stringify(b.get(id)),
    );
  return {
    orders_before: a.size,
    orders_after: b.size,
    missing_orders: missing,
    unexpected_orders: unexpected,
    changed_orders: changed,
    test_result:
      missing.length || unexpected.length || changed.length ? "FAIL" : "PASS",
    rpo: null,
    rto: null,
  };
}
