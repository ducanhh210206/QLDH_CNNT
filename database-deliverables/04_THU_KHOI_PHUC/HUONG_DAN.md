# Task 4 — Thử khôi phục và đối chiếu

## Các file cần nhớ

| Tên | Nội dung |
|---|---|
| [ket-qua.md](ket-qua.md) | Kết quả restore và bảng đối chiếu 13 bảng. |
| [backup-du-lieu-gia.sql](backup-du-lieu-gia.sql) | Bản backup dữ liệu giả đã dùng trong phép thử. |
| [ket-qua.json](ket-qua.json) | Số lượng và mã băm chi tiết để kiểm tra. |
| `cong-cu/` | Script, schema và dữ liệu giả cần thiết để chạy lại phép thử. |

Kết quả đã ghi nhận: `PASS`; 2 đơn hàng và 3 dòng lịch sử đều khớp trước/sau. Tất cả 13 bảng khớp trong dữ liệu thử; các bảng không có bản ghi chỉ được kiểm tra trường hợp rỗng.

## Chạy lại

Mở Docker Desktop; máy cần Python 3 và image Docker `mysql:8.4.13` đã có sẵn. Mở PowerShell tại thư mục gốc dự án, rồi chạy:

```powershell
cd .\database-deliverables\04_THU_KHOI_PHUC\cong-cu
python .\scripts\thu-khoi-phuc.py
```

Script tạo tuần tự hai container MySQL thử riêng, không nối mạng, dùng dữ liệu giả; backup, đọc lại file, khôi phục và đối chiếu. Các container thử tự dừng sau khi hoàn tất; kết quả lần chạy mới được lưu trong `cong-cu/docs/evidence/restore/`. Không cần nhập mật khẩu Aiven hay standby.

Phép thử này không kiểm chứng việc khôi phục bản backup dữ liệu thật, website hoặc failover. File SQL có lệnh tạo/chọn database thử, chỉ chạy trong môi trường thử phù hợp.
