# Bài bàn giao database — Task 3 và Task 4

Mở hai thư mục theo thứ tự số:

1. **[03_TAO_BACKUP](03_TAO_BACKUP/HUONG_DAN.md)**: script sao lưu, chứng chỉ CA và file backup mẫu bằng dữ liệu giả.
2. **[04_THU_KHOI_PHUC](04_THU_KHOI_PHUC/HUONG_DAN.md)**: kết quả khôi phục, bảng đối chiếu, file backup thử và công cụ để chạy lại.

Các file SQL trong hai thư mục là **dữ liệu giả**. Bản backup lấy từ Aiven có thể chứa dữ liệu ứng dụng nên vẫn nằm riêng trong `database/backups/` của dự án; không tự động đưa bản đó vào bộ bàn giao này.

Các file trong thư mục này là bản dùng để xem/bàn giao. Mã và cấu hình standby đang chạy trong dự án vẫn ở vị trí ban đầu; thay đổi một bản sao trong đây không tự cập nhật bản gốc và ngược lại.

Thư mục này tập trung vào task 3 và task 4; tài liệu đồng bộ và minh chứng replication vẫn ở thư mục `docs` của dự án.

## Lưu ý khi chạy standby trên máy khác

Compose `docker/compose.standby-khoi-tao-moi.yml` đọc CA tại `database/backups/aiven-ca.pem`, một vị trí được Git bỏ qua. Sau khi clone, cần tải CA của service Aiven đang dùng và đặt vào đúng vị trí đó; CA công khai của service đã thử cũng có tại `DATABASE_TEST/03_TAO_BACKUP/aiven-ca.pem`.

Script `scripts/khoi-dong-replication-aiven.py` được viết cho standby cụ thể của lần thử: tên container, UUID, mốc GTID và số lượng bảng đều được kiểm tra. Không chạy nguyên trạng để cấu hình một standby mới trên máy khác; cần tạo snapshot, kênh replication và điều chỉnh kiểm tra theo môi trường mới trước.
