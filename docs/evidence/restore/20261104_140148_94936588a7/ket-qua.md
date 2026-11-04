# Task 4 — Kết quả thử khôi phục dữ liệu giả

- Kết quả: **PASS**.
- Bắt đầu: 04/11/2026 14:01:48 +0700; hoàn thành: 04/11/2026 14:02:45 +0700.
- Nguồn và đích: hai container MySQL 8.4.13 tạo lần lượt, riêng biệt, không nối mạng và không mở cổng.
- Database thử: `task4_don_hang_gia`; cấu trúc từ `database/init/schema.sql`, dữ liệu từ `database/seeds/task4_du_lieu_gia.sql`.
- Không truy cập Aiven, MySQL standby hoặc dữ liệu thật trong phép thử này.
- Bản sao: [backup-du-lieu-gia.sql](backup-du-lieu-gia.sql); kích thước 15297 byte; SHA-256: `7fed8584e53ba489ff53d439dd8559cec9145313ea7f08378d74a36bb3fc0a84`.
- Bản sao dùng mysqldump với cùng các tùy chọn snapshot/GTID cơ bản như script khởi tạo; GTID trong dump là chú thích, không thiết lập replication.
- Nội dung mỗi bảng được đọc đầy đủ, sắp xếp theo khóa chính và so sánh SHA-256; cấu trúc được so bằng SHA-256 của `SHOW CREATE TABLE`.

| Bảng | Trước backup | Sau restore | Nội dung | Cấu trúc |
|---|---:|---:|---|---|
| `auth_sessions` | 0 | 0 | Khớp | Khớp |
| `backup_records` | 0 | 0 | Khớp | Khớp |
| `idempotency_keys` | 0 | 0 | Khớp | Khớp |
| `incident_logs` | 0 | 0 | Khớp | Khớp |
| `notification_reads` | 0 | 0 | Khớp | Khớp |
| `oauth_login_attempts` | 0 | 0 | Khớp | Khớp |
| `order_status_history` | 3 | 3 | Khớp | Khớp |
| `orders` | 2 | 2 | Khớp | Khớp |
| `products` | 1 | 1 | Khớp | Khớp |
| `restore_records` | 0 | 0 | Khớp | Khớp |
| `schema_migrations` | 3 | 3 | Khớp | Khớp |
| `user_access_history` | 0 | 0 | Khớp | Khớp |
| `users` | 1 | 1 | Khớp | Khớp |

Dữ liệu mẫu gồm 2 đơn, 3 dòng lịch sử trạng thái, 1 sản phẩm và 1 tài khoản giả; hai đơn có số lượng, giá trị và trạng thái khác nhau, tên có tiếng Việt. Đây là thử nghiệm với dữ liệu giả và MySQL cô lập; không chứng minh khả năng khôi phục bản backup dữ liệu thật, ứng dụng, failover hoặc mọi trường hợp sự cố.

Xem chi tiết kết quả và mã băm từng bảng tại [ket-qua.json](ket-qua.json).
