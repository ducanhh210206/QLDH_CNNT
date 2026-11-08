# Tài liệu đồng bộ dữ liệu MySQL Primary–Standby

- **Người thực hiện:** Phúc — SV3, thiết kế bản sao và quy trình chuyển đổi.
- **Mô hình:** MySQL chính trên Aiven → MySQL Standby trên máy Phúc.
- **Mốc minh chứng:** Buổi thử ngày 08/11/2026. Thông số bên dưới phản ánh môi trường lúc thử; kiểm tra lại trước mỗi buổi vận hành.

## 1. Mục đích và mô hình

Ứng dụng quản lý đơn hàng ghi vào database `order_management` trên Aiven. Các thay đổi được gửi qua replication đến MySQL Standby trên máy Phúc để chuẩn bị tiếp quản nếu xảy ra sự cố. Replication hiện là **một chiều và bất đồng bộ**: một giao dịch đã được ghi trên Aiven có thể chưa tới hoặc chưa được áp dụng trên Standby tại thời điểm mất kết nối.

```text
                    Khi vận hành bình thường

  Người dùng / giảng viên
             │
             ▼
  Website + backend chính
             │ tạo đơn, cập nhật trạng thái
             ▼
  MySQL Aiven — PRIMARY (nhận ghi)
  database: order_management
             │
             │ binary log → replication GTID qua TLS
             ▼
  MySQL Docker trên máy Phúc — STANDBY (chỉ đọc)
  127.0.0.1:3308 → MySQL trong container:3306

  Backup độc lập: tạo file SQL và lưu riêng, không phải đường replication.
```

Aiven là dịch vụ cloud, không phải MySQL Docker trên máy dev. Địa chỉ `127.0.0.1:3308` chỉ có hiệu lực ngay trên máy Phúc; máy khác không truy cập được bằng địa chỉ localhost đó. Khi demo, frontend và backend dự phòng chạy trên máy Phúc; việc chuyển truy cập ứng dụng là thao tác của nhóm, không tự xảy ra khi MySQL đồng bộ.

| Thành phần | Cấu hình đã thử |
|---|---|
| Primary | MySQL Aiven 8.4.11; database `order_management` |
| Standby | MySQL 8.4.13 trong Docker; `omdrs-standby-sau-failback-mysql-standby-1` |
| Địa chỉ trên máy Phúc | `127.0.0.1:3308`; volume `omdrs-standby-sau-failback-data` |
| Định danh Standby | UUID `13bc73d1-db6d-11f1-8c8e-22c586f6983b`; `server_id=493203310` |
| Đồng bộ | GTID auto-position; tài khoản `replica_phuc` trên Aiven; TLS có xác minh chứng chỉ CA |
| Phạm vi | Bộ lọc bảng `order\_management.%`; dấu gạch dưới được escape |
| Bình thường | `read_only=1`, `super_read_only=1`; backend chính ghi vào Aiven |

Tài khoản ứng dụng `order_user` trên Standby là tài khoản MySQL cục bộ, được tạo và kiểm tra riêng; nó không phải tài khoản replication. Không đưa mật khẩu vào mã nguồn, tài liệu hoặc ảnh chụp. Bộ lọc bảng áp dụng cho bảng, view và trigger nhưng không áp dụng cho stored procedure, function và event; cần kiểm tra riêng các đối tượng và quyền khi schema thay đổi. [MySQL: bộ lọc replication](https://dev.mysql.com/doc/refman/8.4/en/replication-options-replica.html).

### Các thành phần cấu hình

- [Compose Standby hiện tại](../../docker/compose.standby-sau-failback.yml) và [file gắn cổng 3308](../../docker/compose.standby-sau-failback-cong.yml) dùng cùng volume và cấu hình MySQL của lần thử. Compose không tự tạo mốc GTID hay tự hoàn tất cấu hình replication.
- CA Aiven được mount từ `database/backups/aiven-ca.pem` vào `/etc/mysql/aiven-ca.pem` trong container. Trên máy mới cần có CA phù hợp với service đang dùng tại đường dẫn đó.
- [Script khởi động replication](../../scripts/khoi-dong-replication-sau-failback.py) kiểm tra UUID, server ID, trạng thái chỉ đọc, TLS, bộ lọc và mốc GTID của **lần khởi tạo 08/11**. Script gọi [script kiểm tra chung](../../scripts/khoi-dong-replication-aiven.py), bao gồm kiểm tra số bảng; không dùng nguyên trạng nếu đổi Standby, thay đổi schema hoặc Standby đã nhận ghi.
- Để thiết lập từ đầu cần một snapshot nhất quán của database ứng dụng, kiểm tra phạm vi, quyền, TLS và GTID/binlog; nhập vào đích phù hợp, cấu hình kênh và kiểm tra dữ liệu. Bản dump một database có thể chứa mốc GTID toàn server, vì vậy không tự nhập hoặc đặt `GTID_PURGED` trước khi rà soát phạm vi. Xem [runbook chi tiết](../05_CHUYEN_DOI/huong-dan-chuyen-doi.md) và [công cụ tạo backup](../03_TAO_BACKUP/HUONG_DAN.md).

## 2. Kiểm tra trạng thái, lỗi và độ trễ

**Người thực hiện:** Phúc. Trong MySQL Workbench chọn kết nối quản trị **MySQL Standby 3308**, không chọn Aiven, sau đó chạy:

```sql
SELECT @@server_uuid AS uuid_standby,
       @@server_id AS server_id,
       @@GLOBAL.read_only AS read_only,
       @@GLOBAL.super_read_only AS super_read_only,
       @@GLOBAL.skip_replica_start AS skip_replica_start;

SHOW REPLICA STATUS;
```

Chạy từng câu hoặc chọn từng tab kết quả trong Workbench. Nếu kết nối tới container hiện tại, UUID phải khớp bảng ở mục 1. `SHOW REPLICA STATUS` có nhiều cột, có thể kéo ngang để xem và chụp ảnh.

| Trường | Cách đọc |
|---|---|
| `Replica_IO_Running` | `Yes`: luồng nhận đang chạy; `Connecting` hoặc `No`: kiểm tra kết nối và lỗi. |
| `Replica_SQL_Running` | `Yes`: luồng áp dụng đang chạy; `No`: xem lỗi áp dụng và dừng để xử lý. |
| `Seconds_Behind_Source` | Số giây MySQL báo tại lúc xem; `NULL` nghĩa là chưa có chỉ số xác định, không phải 0. Ngay cả `0` cũng không chứng minh mọi dữ liệu đã khớp hoặc RPO bằng 0. |
| `Last_IO_Errno`, `Last_IO_Error` | Mã và nội dung lỗi luồng nhận; bình thường mã là `0` và nội dung rỗng. |
| `Last_SQL_Errno`, `Last_SQL_Error` | Mã và nội dung lỗi áp dụng; bình thường mã là `0` và nội dung rỗng. |
| `Source_Host`, `Source_Port`, `Source_UUID` | Xác nhận đang nhận từ đúng Aiven; đối chiếu UUID nguồn theo môi trường thực tế. |
| `Retrieved_Gtid_Set`, `Executed_Gtid_Set` | Ghi lại mốc đã nhận/đã áp dụng để phân tích; dữ liệu đã nhận không đồng nghĩa toàn bộ giao dịch cuối trên nguồn đã tới. |
| `Source_SSL_Allowed`, `Source_SSL_Verify_Server_Cert` | Trong mô hình đã thử: `Yes`; kiểm tra cùng cấu hình CA và tài khoản. |

Theo [MySQL: SHOW REPLICA STATUS](https://dev.mysql.com/doc/refman/8.4/en/show-replica-status.html), chỉ số độ trễ có giới hạn và có thể là `0` ngay cả khi luồng nhận chậm so với nguồn. Nếu kết quả không có dòng, kênh replication có thể chưa được cấu hình; không kết luận là đang đồng bộ. Khi có lỗi, lưu mã lỗi và thời điểm, che thông tin nhạy cảm, kiểm tra mạng, tài khoản, TLS và schema; không bỏ qua giao dịch hoặc tự sửa GTID.

### Kiểm tra một đơn hàng

Chạy cùng truy vấn sau trên **Aiven - Primary**, rồi trên **MySQL Standby 3308**. Thay tên bằng một đơn thử đã được nhóm đồng ý tạo; chờ đồng bộ trước khi so sánh:

```sql
SELECT id, customer_name, product_name, quantity,
       total_amount, status, version
FROM order_management.orders
WHERE customer_name = 'TEN_DON_THU';
```

Đối chiếu ID, sản phẩm, số lượng, tổng tiền, trạng thái và phiên bản. Với nghiệp vụ có liên quan, đối chiếu thêm `order_status_history`, tồn kho, phiên bản sản phẩm và các bảng cần thiết. Một đơn khớp chỉ chứng minh trường hợp đó; bằng nhau về số dòng không chứng minh toàn bộ nội dung giống nhau. Các ảnh của lần thử: [Aiven](../05_CHUYEN_DOI/minh-chung/sau-failback-don-aiven.png), [Standby](../05_CHUYEN_DOI/minh-chung/sau-failback-don-standby.png).

## 3. Khởi động lại sau khi máy Phúc tắt

Cấu hình `skip_replica_start=ON`, do đó không mặc định replication tự chạy sau khi MySQL khởi động lại. Mật khẩu `replica_phuc` được nhập khi khởi động kênh và không ghi vào lệnh.

1. Mở Docker Desktop và PowerShell. Kiểm tra container đang có:

   ```powershell
   docker ps -a --filter "name=omdrs-standby-sau-failback"
   ```

2. Nếu container hiện tại đang `Exited`, khởi động **container đã có**, giữ nguyên volume:

   ```powershell
   docker start omdrs-standby-sau-failback-mysql-standby-1
   ```

   Nếu container không tồn tại, cổng bị chiếm hoặc không rõ volume, dừng để kiểm tra. Không tự chạy `down -v`, xóa volume, reset replication hoặc tạo một Standby mới.
3. Trong Workbench, chạy các câu ở mục 2. Xác nhận đúng UUID, hai chế độ chỉ đọc bằng `1` và xem trạng thái replication. Nếu hai luồng đã `Yes`, kiểm tra lỗi và dữ liệu; không cần chạy lại script.
4. Nếu hai luồng đang dừng, Standby vẫn là container/UUID và schema của lần thử, vẫn chỉ đọc và **chưa từng nhận ghi kể từ lần khởi tạo này**, chạy tại PowerShell ở thư mục gốc dự án:

   ```powershell
   cd C:\Users\Admin\QLDH_CNNT
   python .\scripts\khoi-dong-replication-sau-failback.py --container-root-env
   ```

   Nhập mật khẩu Aiven của `replica_phuc` khi được hỏi. Script dùng thông tin root đã cấu hình trong container cục bộ và không cần in mật khẩu. Sau đó xem lại `SHOW REPLICA STATUS`, đối chiếu một đơn theo mục 2.
5. Nếu script báo sai UUID, schema, TLS, GTID, binlog đã mất hoặc kết quả không rõ: ghi lại lỗi đã che mật khẩu và dừng để điều tra. Script này kiểm tra điều kiện cụ thể, không tự xử lý mọi thay đổi trong dự án. Nếu nguồn đã xóa binlog của giao dịch replica còn thiếu, có thể phải khởi tạo lại từ snapshot phù hợp; không bỏ qua giao dịch để ép kênh chạy. [MySQL: GTID auto-positioning](https://dev.mysql.com/doc/refman/8.4/en/replication-gtids-auto-positioning.html).

Trong buổi thử, Aiven từng được đặt `binlog_retention_period=14400` giây. Đây là giá trị đã quan sát, không phải cam kết rằng dữ liệu luôn còn đủ trong bốn giờ; phải kiểm tra tình trạng thực tế.

## 4. Điều kiện chuyển Standby sang ghi — failover

**Phân công:** bạn dev phụ trách dừng/chuyển các nguồn ghi và đường đi ứng dụng; Phúc phụ trách trạng thái, backup và thao tác database; cả hai cùng xác nhận thời điểm chuyển. Người ghi nhận lưu thời gian, kết quả và minh chứng.

Chỉ thực hiện trong buổi thử đã thống nhất, với đúng Standby và dữ liệu được phép dùng:

1. Kiểm tra backup độc lập đã có thể khôi phục; ghi thời điểm và trạng thái replication, lỗi, GTID và các giao dịch quan trọng.
2. Dev dừng và xác minh **mọi nguồn ghi vào Aiven**: backend, job, migration và công cụ liên quan. Nếu không thể cô lập hoặc kiểm chứng nguồn ghi cũ, dừng; không cho Standby nhận ghi. Lỗi mạng từ máy Phúc không chứng minh Aiven đã ngừng nhận ghi.
3. Nếu Aiven còn truy cập được và các nguồn ghi đã dừng, lấy mốc `@@GLOBAL.gtid_executed` trên Aiven và chờ Standby áp dụng mốc đó bằng `WAIT_FOR_EXECUTED_GTID_SET`. Sau đó dừng luồng nhận, để luồng áp dụng xử lý hết tập đã nhận; xác minh lỗi và đối chiếu dữ liệu. Nếu Aiven không truy cập được, mốc cuối có thể không xác định; cần cô lập nguồn ghi và cả nhóm đánh giá rủi ro mất dữ liệu trước khi tiếp tục.
4. Chỉ khi các điều kiện đạt, Phúc dừng replication và chuyển đúng Standby sang `read_only=0`, `super_read_only=0` theo từng lệnh trong [runbook failover](../05_CHUYEN_DOI/huong-dan-chuyen-doi.md). Dev kết nối backend dự phòng tới đúng Standby và kiểm tra ứng dụng. Tạo đơn giả được đánh dấu, đối chiếu đơn, trạng thái, lịch sử và tồn kho; ghi thời điểm phục hồi.

Một khi Standby đã nhận ghi, hai phía có thể có lịch sử khác nhau. Không khởi động lại replication cũ máy móc và không bật cả hai nơi nhận ghi. Trong buổi 08/11, nhóm đã thử failover có kiểm soát và tạo một đơn giả trên Standby cũ; [minh chứng failover](../05_CHUYEN_DOI/minh-chung/failover-20261108.md).

## 5. Xử lý dữ liệu và quay lại Aiven — failback

1. Dev tiếp tục giữ các nguồn ghi vào Aiven dừng; đến thời điểm cắt chuyển, dừng ghi trên ứng dụng Standby. Xác nhận không còn job/request ghi và ghi lại thời điểm.
2. Phúc tạo backup riêng cho từng phía, lưu an toàn và thử khôi phục trong môi trường cách ly. Không ghi đè Aiven bằng dump của Standby chỉ vì Aiven đã chạy trở lại.
3. Dev và Phúc đối chiếu giao dịch chỉ có ở Aiven, chỉ có ở Standby và các xung đột: đơn, trạng thái, lịch sử, sản phẩm, tồn kho và bảng liên quan. Thống nhất cách xử lý trước khi áp dụng; trường hợp chưa xác định phải tiếp tục điều tra.
4. Thử phương án trên bản sao cách ly, kiểm tra điều kiện và rollback. Chỉ sau khi phương án phù hợp và các nguồn ghi vẫn dừng, thực hiện đưa dữ liệu đã thống nhất về Aiven; kiểm tra kết quả trước khi chạy lại bất kỳ lệnh nào nếu mất kết nối hoặc kết quả commit không rõ.
5. Bật lại chế độ chỉ đọc cho Standby cũ, xác minh trạng thái. Dev chuyển ứng dụng về Aiven, kiểm tra đăng nhập, dữ liệu và tạo một đơn giả được cho phép. Xác nhận Aiven là nơi duy nhất nhận ghi.
6. Khởi tạo lại Standby từ trạng thái Aiven đã thống nhất theo quy trình phù hợp; kiểm tra bản sao, mốc GTID, binlog, TLS, bộ lọc và dữ liệu, sau đó xác nhận hai luồng replication.

**Kết quả đã thử:** Ngày 08/11 nhóm dùng một phương án riêng để đưa **một đơn thử** và các thay đổi liên quan về Aiven, kiểm tra trên bản sao cách ly rồi đối chiếu trên Aiven. Nhóm dựng lại Standby và xác nhận một đơn mới từ Aiven đã đến Standby. Không suy rộng kết quả này thành công cụ hợp nhất tự động cho mọi trường hợp. [Minh chứng failback và dựng lại Standby](../05_CHUYEN_DOI/minh-chung/failback-20261108.md).

## 6. Giới hạn và vai trò của backup

- **Xóa nhầm:** replication có thể chuyển cả thao tác xóa hoặc sửa sai từ Aiven sang Standby. Không dựa vào Standby làm bản backup duy nhất.
- **Mất kết nối:** replication bất đồng bộ có thể chưa nhận hoặc chưa áp dụng một số giao dịch đã commit trên Aiven. `Seconds_Behind_Source=0` trong ảnh không bảo đảm không mất giao dịch.
- **Giới hạn lưu binlog:** nếu Standby ngắt quá lâu và nguồn không còn các giao dịch cần thiết, cần xử lý theo tình trạng thực tế; không tự đánh dấu GTID là đã chạy.
- **Khôi phục:** tạo backup độc lập, có thời điểm và vị trí lưu, kiểm tra khôi phục vào môi trường thử rồi so sánh số lượng và nội dung. [Hướng dẫn backup](../03_TAO_BACKUP/HUONG_DAN.md) và [kết quả restore dữ liệu giả](../04_THU_KHOI_PHUC/ket-qua.md). Bản restore task 4 cần chạy lại khi nhóm chốt schema cuối.
- **Thời gian và minh chứng:** nhóm chưa có số đo RTO/RPO đầy đủ cho buổi thử này. Phối hợp SV4 ghi thời điểm gián đoạn, phục hồi và giao dịch cuối có thể xác minh; không tự suy ra kết quả bằng 0.

## 7. Minh chứng và tài liệu tham khảo

- [Kết quả đồng bộ 04/11/2026](../../docs/ket-qua-dong-bo-aiven-standby-20261104.md) — mô tả Standby cũ, gồm thử tạo và cập nhật một đơn.
- [Trạng thái sau failback: hai luồng replication](../05_CHUYEN_DOI/minh-chung/sau-failback-replica-luong.png) và [độ trễ/lỗi](../05_CHUYEN_DOI/minh-chung/sau-failback-replica-loi.png).
- [Runbook chuyển đổi đầy đủ](../05_CHUYEN_DOI/huong-dan-chuyen-doi.md), [minh chứng failover](../05_CHUYEN_DOI/minh-chung/failover-20261108.md), [minh chứng failback](../05_CHUYEN_DOI/minh-chung/failback-20261108.md).
