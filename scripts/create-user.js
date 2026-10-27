import { randomUUID } from "node:crypto";
import { pool } from "../backend/src/config/database.js";
import { hashPassword } from "../backend/src/services/authService.js";
const { NEW_USERNAME, NEW_PASSWORD, NEW_ROLE = "Admin" } = process.env;
try {
  if (
    !NEW_USERNAME ||
    !NEW_PASSWORD ||
    NEW_PASSWORD.length < 12 ||
    !["Admin", "Staff"].includes(NEW_ROLE)
  )
    throw Error(
      "Cung cấp NEW_USERNAME, NEW_PASSWORD tối thiểu 12 ký tự và NEW_ROLE=Admin hoặc Staff qua môi trường.",
    );
  await pool.execute(
    "INSERT INTO users(id,username,password_hash,role) VALUES(?,?,?,?)",
    [randomUUID(), NEW_USERNAME, await hashPassword(NEW_PASSWORD), NEW_ROLE],
  );
  console.log("Đã tạo tài khoản " + NEW_USERNAME + " (" + NEW_ROLE + ").");
} finally {
  await pool.end();
}
