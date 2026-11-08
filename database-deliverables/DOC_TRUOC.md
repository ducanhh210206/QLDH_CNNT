# Bài bàn giao database — Task 3, Task 4 và Task 5

Mở các thư mục theo thứ tự số:

1. **[03_TAO_BACKUP](03_TAO_BACKUP/HUONG_DAN.md)**: script sao lưu, chứng chỉ CA và file backup mẫu bằng dữ liệu giả.
2. **[04_THU_KHOI_PHUC](04_THU_KHOI_PHUC/HUONG_DAN.md)**: kết quả khôi phục, bảng đối chiếu, file backup thử và công cụ để chạy lại.
3. **[05_CHUYEN_DOI](05_CHUYEN_DOI/huong-dan-chuyen-doi.md)**: runbook failover/failback, trách nhiệm, điều kiện kiểm tra và minh chứng buổi thử ngày 08/11/2026.

Các file SQL trong hai thư mục là **dữ liệu giả**. Bản backup lấy từ Aiven có thể chứa dữ liệu ứng dụng nên vẫn nằm riêng trong `database/backups/` của dự án; không tự động đưa bản đó vào bộ bàn giao này.

Các file trong thư mục này là bản dùng để xem/bàn giao. Mã và cấu hình standby đang chạy trong dự án vẫn ở vị trí ban đầu; thay đổi một bản sao trong đây không tự cập nhật bản gốc và ngược lại.

Tài liệu đồng bộ và minh chứng replication bổ sung nằm trong thư mục `docs` của dự án. Task 4 cần được cập nhật và đối chiếu lại theo schema cuối cùng khi nhóm chốt mã nguồn.

## Lưu ý khi chạy standby trên máy khác

Sau phép thử failover/failback ngày 08/11/2026, Standby hiện tại là `omdrs-standby-sau-failback-mysql-standby-1`, UUID `13bc73d1-db6d-11f1-8c8e-22c586f6983b`, dùng `127.0.0.1:3308` và volume `omdrs-standby-sau-failback-data`. Container cũ `omdrs-standby-20261108-mysql-standby-1` đã nhận ghi và được giữ lại ở trạng thái dừng; không tự nối lại replication cũ trên container đó. Xem các bước trong `05_CHUYEN_DOI/huong-dan-chuyen-doi.md`.

Compose hiện tại đọc CA tại `database/backups/aiven-ca.pem`, một vị trí được Git bỏ qua. Sau khi clone, cần tải CA của service Aiven đang dùng và đặt vào đúng vị trí đó; CA công khai của service đã thử cũng có tại `database-deliverables/03_TAO_BACKUP/aiven-ca.pem`.

Các script khởi động replication gắn với container, UUID và mốc GTID cụ thể. `scripts/khoi-dong-replication-sau-failback.py` dành cho Standby hiện tại sau failback; chỉ dùng khi đã kiểm tra các điều kiện trong runbook. Không chạy nguyên trạng cho standby khác hoặc standby đã nhận ghi; cần xem xét snapshot, kênh replication và dữ liệu phân nhánh trước.
