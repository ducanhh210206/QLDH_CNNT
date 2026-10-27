import mysql from "mysql2/promise";
import { readFile } from "node:fs/promises";
import { env, directDatabaseConfig } from "../backend/src/config/env.js";
if (process.env.CONFIRM_EMPTY_DATABASE !== "order_management")
  throw Error(
    "Đặt CONFIRM_EMPTY_DATABASE=order_management sau khi kiểm tra tên database.",
  );
if (env.db.database !== "order_management")
  throw Error("Chỉ khởi tạo order_management.");
const c = await mysql.createConnection({
  ...directDatabaseConfig(),
  database: undefined,
  multipleStatements: true,
});
try {
  const [exists] = await c.execute(
    "SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME=?",
    [env.db.database],
  );
  if (exists.length) {
    const [t] = await c.execute(
      "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA=?",
      [env.db.database],
    );
    if (t.length)
      throw Error(
        "Database có bảng. Dừng để bảo toàn dữ liệu; không tự động migration.",
      );
  } else {
    await c.query(
      "CREATE DATABASE `order_management` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci",
    );
  }
  await c.changeUser({ database: env.db.database });
  await c.query(
    await readFile(
      new URL("../database/init/schema.sql", import.meta.url),
      "utf8",
    ),
  );
  console.log("Schema 001 đã được áp dụng.");
} finally {
  await c.end();
}
