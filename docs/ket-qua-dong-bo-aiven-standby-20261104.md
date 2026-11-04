# Kết quả thử đồng bộ MySQL Aiven sang standby

Ngày thử: 04/11/2026. Bản ghi thử có tên khách hàng `TEST_DONG_BO_20261104_01`; đây là dữ liệu giả được tạo trên website đang kết nối Aiven. Kết quả dưới đây chỉ phản ánh các thao tác và thời điểm đã quan sát.

## Môi trường

- Nguồn: MySQL Aiven 8.4.11, database ứng dụng `order_management`.
- Đích thử: MySQL 8.4.13 trong container `omdrs-standby-moi-mysql-standby-1` trên máy Windows; cổng máy chủ `127.0.0.1:3308`, `server_id=3`.
- Bản khởi tạo: `database/backups/seed_20261104_061446_3bb5aca5/seed.sql` (file dữ liệu ứng dụng, không đưa lên kho mã nguồn công khai).
- Đồng bộ theo GTID, kết nối TLS xác thực chứng chỉ Aiven; tài khoản `replica_phuc` có quyền `REPLICATION SLAVE`.
- Bộ lọc khởi động `REPLICATE_WILD_DO_TABLE=order\_management.%`. Dấu gạch dưới được escape để chỉ khớp tên database dự kiến. Đây là bộ lọc bảng, không chứng minh mọi lệnh quản trị hoặc đối tượng ngoài bảng đều được lọc/đồng bộ đầy đủ.
- Aiven hiển thị `binlog_retention_period=14400` giây. Đây không phải cam kết dữ liệu không bao giờ bị mất; cần theo dõi dung lượng, kết nối và trạng thái thực tế.

## Kết quả

| Bước | Kết quả thực tế | Bằng chứng |
|---|---|---|
| Khởi động replication | `Replica_IO_Running=Yes`, `Replica_SQL_Running=Yes`, `Seconds_Behind_Source=0` lúc kiểm tra. | [Trạng thái replication](evidence/replication-20261104/01-trang-thai-replication.png) |
| Tạo đơn thử | Cùng ID `41f75b87-0eda-46d5-9aff-ca7b6a73bc42`, số lượng `1`, tổng tiền `200000.00`, `Pending`, phiên bản `1`. | [Aiven](evidence/replication-20261104/02-tao-don-aiven.png), [standby](evidence/replication-20261104/03-tao-don-standby.png) |
| Kiểm tra tên sản phẩm | `HEX(CONVERT(product_name USING utf8mb4))` đều là `C3816F20526574726F`. Ký tự bị hiển thị khác ở PowerShell không làm thay đổi kết quả UTF-8 đã kiểm tra. | [Aiven](evidence/replication-20261104/04-utf8-aiven.png), [standby](evidence/replication-20261104/05-utf8-standby.png) |
| Hủy đơn thử | Cùng ID, trạng thái `Cancelled`, phiên bản `2`. Cùng hai dòng lịch sử: ID `8` từ `NULL` sang `Pending`, ID `9` từ `Pending` sang `Cancelled`. | [Aiven](evidence/replication-20261104/06-cap-nhat-aiven.png), [standby](evidence/replication-20261104/07-cap-nhat-standby.png) |

Thời gian trên ảnh đối chiếu Aiven cho bước hủy là 13:35:55 theo đồng hồ hiển thị trên máy. `Seconds_Behind_Source=0` là chỉ số được báo tại thời điểm kiểm tra, không phải phép đo độ trễ đầu cuối chính xác hoặc bảo đảm RPO bằng 0.

## Phạm vi và các bước còn lại

Phép thử xác minh việc thêm và cập nhật **một đơn thử**, bao gồm hai dòng lịch sử trạng thái và tên sản phẩm ở dạng UTF-8. Nó không kiểm chứng toàn bộ bản ghi, mọi bảng, khôi phục từ backup, failover, failback hay khả năng hệ thống tiếp tục phục vụ khi Aiven hoặc mạng bị lỗi.

Standby chạy `skip_replica_start=ON`, do đó replication không tự chạy sau khi MySQL khởi động lại. Script `scripts/khoi-dong-replication-aiven.py` yêu cầu nhập mật khẩu root standby và mật khẩu tài khoản replication khi khởi động. Script hiện kiểm tra đúng snapshot, UUID và số bảng tại thời điểm triển khai; nếu schema thay đổi cần xem lại kiểm tra trước khi dùng lại. Nếu standby ngừng quá lâu và binlog cần thiết không còn trên nguồn, cần khởi tạo lại theo bản sao mới; không tự đánh dấu bỏ qua giao dịch thiếu.

Cổng standby hiện chỉ được mở trên `127.0.0.1` của máy Windows. Backend hoặc người dùng ở máy khác chưa thể truy cập trực tiếp qua địa chỉ đó; cần thiết kế kết nối và chuyển hướng phù hợp trước khi thử failover. Không cho phép hai phía cùng nhận ghi không kiểm soát.

Bản sao đồng bộ không thay thế bản backup độc lập. Task khôi phục được thử riêng bằng dữ liệu giả và hai container cô lập; xem [bảng đối chiếu task 4](evidence/restore/20261104_140148_94936588a7/ket-qua.md). Không kết luận task khôi phục từ phép thử replication này.
