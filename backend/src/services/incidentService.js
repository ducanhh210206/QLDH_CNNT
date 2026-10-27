import { pool } from "../config/database.js";
import { randomUUID } from "node:crypto";
import { fail } from "../utils/errors.js";
export const types = [
  "Power Outage",
  "Server Crash",
  "Network Failure",
  "Data Loss",
];
export async function list() {
  const [r] = await pool.query(
    "SELECT * FROM incident_logs ORDER BY created_at DESC LIMIT 100",
  );
  return r;
}
export async function get(id) {
  const [r] = await pool.execute("SELECT * FROM incident_logs WHERE id=?", [
    id,
  ]);
  if (!r[0]) fail(404, "NOT_FOUND", "Không tìm thấy sự cố.");
  return r[0];
}
export async function simulate(type, uid) {
  if (!types.includes(type))
    fail(400, "INVALID_INCIDENT", "Loại sự cố không hợp lệ.");
  const id = randomUUID(),
    at = new Date().toISOString();
  const timeline = [
    {
      at,
      status: "Detected",
      message: "DEMO: giả lập " + type + ". Không tác động hạ tầng.",
    },
    {
      at,
      status: "Investigating",
      message: "DEMO: mô phỏng phát hiện dependency không sẵn sàng.",
    },
    {
      at,
      status: "Recovering",
      message:
        type === "Data Loss"
          ? "DEMO: quy trình thực tế cần backup, restore cách ly và đối chiếu checksum."
          : "DEMO: cần kiểm tra standby, quyền ghi và chống split-brain trước chuyển dịch vụ.",
    },
    {
      at,
      status: "Resolved",
      message: "Kết thúc mô phỏng. Không có kết quả RTO/RPO thực tế.",
    },
  ];
  await pool.execute(
    "INSERT INTO incident_logs(id,type,mode,severity,component,status,timeline,recovered_at,user_id) VALUES(?,?,'Demo','Info',?,'Resolved',?,UTC_TIMESTAMP(3),?)",
    [
      id,
      type,
      type === "Data Loss" ? "Database" : "Primary",
      JSON.stringify(timeline),
      uid,
    ],
  );
  return get(id);
}
