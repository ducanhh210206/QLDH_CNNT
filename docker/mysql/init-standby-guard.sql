-- Chạy một lần khi data directory của Docker MySQL còn mới.
-- Chỉ lưu cấu hình cho lần khởi động chính, không bật khi entrypoint đang tạo root.
SET PERSIST_ONLY super_read_only = ON;
