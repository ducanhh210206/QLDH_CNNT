# Thiết kế dữ liệu

`database/init/schema.sql` chứa migration đầu tiên, InnoDB/UTF8MB4.

| Bảng | Mục đích |
|---|---|
| users | UUID, username unique, salted scrypt hash, Admin/Staff |
| auth_sessions | Session được thu hồi trong DB, expires_at |
| orders | UUID, customer/product, quantity>0, DECIMAL(14,2)>=0, status, version, UTC timestamps |
| order_status_history | FK order/user, trạng thái cũ/mới, UTC timestamp |
| idempotency_keys | PK user/key, SHA-256 payload, FK order |
| incident_logs | Phân biệt Live/Demo, timeline JSON |
| backup_records | Trạng thái, file name, checksum, kích thước, người thao tác |
| restore_records | Database đích cách ly, trạng thái, JSON báo cáo |
| schema_migrations | Phiên bản schema đã áp dụng |

Index trên status/created_at, created_at, customer_name, lịch sử order/time. Tìm kiếm LIKE có wildcard đầu không tận dụng đầy đủ index; với quy mô lớn cần index tìm kiếm riêng. Parameterize mọi giá trị; chỉ sort ASC/DESC từ enum được ghép SQL.

Pool giới hạn 10 connection, timeout 5 giây, hàng đợi 50. Mỗi kết nối dùng timezone UTC. Tiền API gửi chuỗi thập phân để tránh sai số JS; MySQL quyết định giá trị lưu. Không sửa schema hiện có hoặc tự áp dụng DDL khi startup. Migration tiếp theo phải được review cùng backup và thử trên bản phục hồi.

Idempotency record không tự hết hạn để tránh tạo lại đơn sau sự cố kéo dài. Session hết hạn bị từ chối; cần chính sách dọn session cũ trong vận hành quy mô lớn. Không có API xóa đơn hàng thật.
