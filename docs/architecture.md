# Kiến trúc & phạm vi

Frontend React/Vite → Gateway Nginx → Express routes → middleware → controller → service → repository → mysql2/promise pool → MySQL InnoDB.

Backend stateless về session: JWT chỉ mang user/session ID; tra session trong MySQL, logout xóa session tại DB. Hai Backend có chung JWT_SECRET và database. Backup file dùng volume chung nếu chạy Docker. Chỉ Primary chạy lịch backup. Backup dùng MySQL GET_LOCK theo tên database, giữ kết nối sở hữu khóa đến khi hoàn tất, để tránh backup đồng thời giữa các Backend. Production nên đưa tác vụ lâu vào worker riêng có trạng thái job bền vững.

Readiness thực hiện truy vấn dependency bắt buộc, liveness độc lập DB. Monitoring riêng kiểm tra `/health/ready` mỗi 10 giây, timeout 4 giây, lưu chuyển trạng thái JSONL tại monitoring/data. `/status` yêu cầu bearer token nội bộ; trình duyệt không biết token. Monitoring trên cùng máy không còn chạy khi mất điện cả máy; cần đặt trên máy độc lập để giám sát liên máy.

Nginx OSS có passive failover: loại node sau lỗi kết nối/502/503/504, không active readiness probe. Một request GET đầu tiên có thể thử Primary rồi Standby. Không bật retry `non_idempotent`, không khẳng định loại node ngay khi readiness đổi. Nếu cần active checks có thể dùng HAProxy/NGINX Plus và thử nghiệm riêng.

Hai Backend dùng chung MySQL không phải database HA. Mẫu Standby MySQL bật read_only/super_read_only và GTID; chưa có nguồn replication, tài khoản replication, TLS hay promotion. Cần xác minh dữ liệu đồng bộ, GTID, độ trễ, fencing Primary, lease/quorum và chuyển endpoint ghi trước khi promotion. Không cho hai DB độc lập cùng nhận ghi.

Backup là snapshot logic toàn bộ bảng ứng dụng trong transaction REPEATABLE READ; không phải physical backup hoặc PITR. Không chạy DDL đồng thời backup. Replication sao chép cả thao tác xóa sai; không thay thế backup. PITR cần binlog và quy trình kiểm chứng riêng.
