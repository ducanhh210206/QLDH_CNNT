import { log } from "../utils/logger.js";
export function errorHandler(err, req, res, next) {
  const dbUnavailable =
    /^(ECONN|ETIMEDOUT|EHOST|ENET|PROTOCOL_CONNECTION|ER_CON_COUNT|ER_ACCESS_DENIED|ER_BAD_DB|ER_NO_SUCH_TABLE)/.test(
      err.code || "",
    );
  const status = err.status || (dbUnavailable ? 503 : 500);
  if (status >= 500)
    log("request_failed", {
      requestId: req.requestId,
      code: err.code || "INTERNAL",
      status,
    });
  if (err.type === "entity.parse.failed") {
    err.code = "INVALID_JSON";
    err.message = "JSON không hợp lệ.";
  }
  res
    .status(status)
    .json({
      error: {
        code: dbUnavailable
          ? "DATABASE_UNAVAILABLE"
          : err.code || "INTERNAL_ERROR",
        message: dbUnavailable
          ? "MySQL chưa sẵn sàng. Kiểm tra Docker và cấu hình kết nối."
          : status < 500
            ? err.message
            : "Không thể xử lý yêu cầu. Vui lòng thử lại.",
        request_id: req.requestId,
      },
    });
}
