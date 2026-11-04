# Task 4 — Thử khôi phục và đối chiếu dữ liệu giả

## Mục tiêu và phạm vi

Tạo bản sao bằng `mysqldump`, khôi phục vào một MySQL thử khác và đối chiếu cấu trúc, số lượng cùng nội dung bản ghi. Phép thử chỉ dùng dữ liệu giả, không kết nối Aiven và không ghi vào standby đang đồng bộ.

Hai MySQL thử được tạo **lần lượt** trong hai container riêng, dùng image `mysql:8.4.13`, `--network none` và không publish cổng. Container thử dùng tài khoản root không mật khẩu chỉ trong môi trường cô lập này. Script dừng các container thử sau khi hoàn thành; file backup và kết quả đối chiếu được giữ trên máy trong `docs/evidence/restore/`.

## Chuẩn bị

- Khởi động Docker Desktop, bảo đảm Docker chạy được và máy đã có image `mysql:8.4.13`. Script dùng `--pull=never`, không tải image từ mạng.
- Cần Python 3 và các file `database/init/schema.sql`, `database/seeds/task4_du_lieu_gia.sql` trong dự án.
- Không cần mật khẩu Aiven hoặc mật khẩu standby. Không nhập dữ liệu thật vào file dữ liệu giả.

## Cách chạy trên Windows

Mở PowerShell tại thư mục dự án và chạy:

```powershell
python .\scripts\thu-khoi-phuc.py
```

Script thực hiện:

1. Tạo MySQL nguồn thử, tạo database `task4_don_hang_gia` bằng schema dự án và thêm các bản ghi giả.
2. Dùng `mysqldump` tạo file `.sql` với các tùy chọn snapshot/GTID cơ bản như script khởi tạo ở task 3. Tập GTID trong file được ghi dưới dạng chú thích; đây không phải cấu hình replication.
3. Ghi file ra đĩa, đọc lại và kiểm tra SHA-256. Dừng container nguồn thử.
4. Tạo MySQL đích thử mới, nạp lại file vừa đọc từ đĩa vào database thử, không dùng database ứng dụng.
5. Với từng bảng, so sánh số bản ghi, toàn bộ nội dung theo thứ tự khóa chính và kết quả `SHOW CREATE TABLE`. Script lưu mã SHA-256 của dữ liệu và cấu trúc hai bên trong JSON.
6. Xuất `ket-qua.md`, `ket-qua.json` và `backup-du-lieu-gia.sql`, rồi dừng container đích thử.

`PASS` nghĩa là các bảng, số lượng, nội dung và cấu trúc trong **dữ liệu giả của lần chạy đó** đều khớp; `FAIL` nghĩa là có nội dung chưa khớp. Nếu script báo lỗi, giữ thông báo và kiểm tra trước khi chạy lại. Mỗi lần chạy thành công có thư mục kết quả mới, không ghi đè kết quả trước.

## Kết quả đã thực hiện ngày 04/11/2026

- [Bảng đối chiếu và kết quả khôi phục](evidence/restore/20261104_140148_94936588a7/ket-qua.md)
- [File backup chỉ chứa dữ liệu giả](evidence/restore/20261104_140148_94936588a7/backup-du-lieu-gia.sql)
- [Kết quả chi tiết và checksum](evidence/restore/20261104_140148_94936588a7/ket-qua.json)

Kết quả `PASS`: 13 bảng khớp; `orders` có 2 bản ghi trước và sau, `order_status_history` có 3 bản ghi trước và sau. Các bảng không có dữ liệu giả chỉ được kiểm tra trường hợp rỗng.

Các container thử đã bị dừng và tự xóa sau lần chạy, nên database thử không còn xuất hiện trong Workbench. File SQL vẫn còn trên đĩa để bàn giao. File dump có lệnh tạo/chọn database thử; chỉ khôi phục nó trong môi trường kiểm thử phù hợp, không chạy trên kết nối Aiven hay standby.

## Giới hạn

Đây là kiểm thử restore MySQL bằng dữ liệu giả; không chứng minh khôi phục bản backup dữ liệu thật của Aiven, endpoint/website, mọi loại dữ liệu, hay khả năng failover/failback. Khi trình bày kết quả cần mô tả đúng phạm vi này.
