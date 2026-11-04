-- Bước kiểm tra trước khi cấu hình replication MySQL 8.0.22+.
-- Chỉ đọc thông tin cấu hình, không thay đổi database hoặc bật replication.
-- Chạy lần lượt trên kết nối Workbench của máy 1 và của máy 2.

SELECT VERSION() AS mysql_version,
       @@hostname AS server_hostname,
       @@port AS server_port,
       @@server_uuid AS server_uuid,
       @@server_id AS server_id,
       @@GLOBAL.log_bin AS binary_log_enabled,
       @@GLOBAL.gtid_mode AS gtid_mode,
       @@GLOBAL.enforce_gtid_consistency AS enforce_gtid_consistency,
       @@GLOBAL.read_only AS read_only,
       @@GLOBAL.super_read_only AS super_read_only;

-- Danh sách các bảng trong schema ứng dụng, nếu tài khoản được phép xem.
SELECT TABLE_NAME, ENGINE
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = 'order_management'
  AND TABLE_TYPE = 'BASE TABLE'
ORDER BY TABLE_NAME;

-- Trả về thông tin replica khi instance này có channel replication.
-- Yêu cầu quyền REPLICATION CLIENT; không hiện hàng nếu chưa có channel.
SHOW REPLICA STATUS;
