# Task 3 — Tạo backup

## Các file cần nhớ

| Tên | Nội dung |
|---|---|
| [tao-backup.ps1](tao-backup.ps1) | Script dùng `mysqldump` để sao lưu một database MySQL. |
| [backup-mau-du-lieu-gia.sql](backup-mau-du-lieu-gia.sql) | File SQL mẫu chứa dữ liệu giả; được tạo trong phép thử task 4 bằng `mysqldump` với các tùy chọn snapshot/GTID cơ bản tương tự. |
| [aiven-ca.pem](aiven-ca.pem) | Chứng chỉ CA công khai để xác minh kết nối tới Aiven của nhóm. Không chứa mật khẩu. |

File mẫu là database thử `task4_don_hang_gia`, không phải bản sao dữ liệu thật `order_management`. Các bản backup mới được tạo bằng script này nằm trong `03_TAO_BACKUP/backups/seed_<thoi-diem>_<ma>/`, gồm `seed.sql`, `manifest.json` và bản sao chứng chỉ CA. Thời gian trong manifest là UTC.

## Cách chạy trên máy Windows của nhóm

Mở Docker Desktop và PowerShell tại thư mục gốc dự án, rồi chạy:

```powershell
cd .\database-deliverables\03_TAO_BACKUP
powershell -NoProfile -ExecutionPolicy Bypass -File .\tao-backup.ps1 -SourceHost 'mysql-7b63f20-qldh-demo.b.aivencloud.com' -SourcePort 14586 -SourceUser 'avnadmin'
```

Nhập mật khẩu Aiven khi được hỏi; không ghi mật khẩu vào lệnh. Máy cần có Docker và image `mysql:8.4.13`, đồng thời truy cập được Aiven. Nếu dùng service khác hoặc CA của service thay đổi, cung cấp lại `-SourceHost`, `-SourcePort`, `-SourceUser` và đường dẫn CA qua `-CAFile`.

Script đang tạo bản sao khởi tạo cho standby, dùng `--single-transaction`, mốc binlog và GTID dạng chú thích. Nó chỉ sao lưu database được chọn, mặc định là `order_management`; không tự động kiểm tra toàn bộ dữ liệu sau khôi phục. Việc lấy mốc có thể giữ khóa đọc ngắn. Bản backup từ ứng dụng có thể chứa dữ liệu thật; chọn dữ liệu giả hoặc được nhóm cho phép trước khi chia sẻ.
