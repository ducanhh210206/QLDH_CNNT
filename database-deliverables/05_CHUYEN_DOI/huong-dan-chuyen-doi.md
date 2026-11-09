# Task 5 — Runbook chuyển sang máy dự phòng và quay lại Aiven

**Trạng thái ngày 08/11/2026:** Nhóm đã thử failover có kiểm soát, đưa một giao dịch thử từ Standby về Aiven, mở lại website chính và thiết lập lại replication đến Standby mới. Chi tiết và giới hạn của phép thử có trong [minh chứng failover](minh-chung/failover-20261108.md) và [minh chứng failback](minh-chung/failback-20261108.md). Đây là runbook để bàn giao cho môi trường lab; trước mỗi lần dùng cần xác nhận lại trạng thái thực tế.

**Trước lần khởi tạo lại ngày 08/11/2026:** Standby cũ thiếu giao dịch GTID `c4ee9c9b-d7fc-11f1-ac26-f2d5b3407bc1:73` đã bị xóa khỏi binlog Aiven. Nhóm đã tạo bản sao mới và khởi tạo standby thay thế; không tự đánh dấu giao dịch thiếu trên standby cũ là đã chạy.

**Sau thử failover/failback ngày 08/11/2026:** Standby cũ `99807877-db5e-11f1-b2db-a20c76b38e25` đã từng nhận ghi; giao dịch thử đã được đưa về Aiven bằng kế hoạch riêng và xác nhận `COMMITTED_VERIFIED`. Sau đó nhóm dựng Standby mới từ Aiven: container `omdrs-standby-sau-failback-mysql-standby-1`, UUID `13bc73d1-db6d-11f1-8c8e-22c586f6983b`, server ID `493203310`, cổng máy Phúc `127.0.0.1:3308`. Hai luồng replication đã báo `Yes`, một đơn tạo mới trên website chính đã xuất hiện trên Standby mới. Không nối lại replication cũ trên container đã từng nhận ghi mà chưa xử lý dữ liệu phân nhánh.

**Chuẩn bị ứng dụng:** Tài khoản MySQL cục bộ `order_user` trên Standby mới đã được cấp SELECT, INSERT, UPDATE, DELETE trên `order_management` và truy vấn đọc thành công. Backend `instance=standby` kết nối MySQL `127.0.0.1:3308`; `/health/ready` trên cổng 5000 trả `Healthy`. Các kiểm tra ứng dụng qua frontend và ghi một đơn đã thực hiện trên Standby cũ trong lần failover, không phải phép thử ghi lại trên Standby mới. Tài khoản là cục bộ; volume mới cần được kiểm tra và thiết lập riêng. JWT và phiên đăng nhập cần xác nhận lại theo cấu hình thực tế.

**Mục tiêu:** Khi gặp sự cố, duy trì tối đa một nơi nhận ghi; xác minh dữ liệu, ghi thời điểm và thực hiện các bước quay lại có kiểm soát. Chỉ thao tác chuyển ghi trong buổi lab có người phụ trách và đã thống nhất phạm vi.

## 1. Sơ đồ và phân công

```text
Bình thường:
Người dùng → frontend/backend hiện đang chạy → MySQL Aiven (được ghi)
                                                │ replication GTID qua TLS
                                                ↓
                             MySQL máy Phúc 3308 (standby, chỉ đọc)

Sau khi chuyển đổi thành công:
Giảng viên trên máy Phúc → frontend cục bộ → backend cục bộ
                                                  ↓
                                MySQL máy Phúc 3308 (được ghi)
MySQL Aiven: phải được cô lập khỏi mọi nguồn ghi cho đến khi đối chiếu xong.
```

| Người | Trách nhiệm |
|---|---|
| Bạn dev / người vận hành ứng dụng | Quyết định cùng Phúc thời điểm chuyển đổi; xác định nơi chạy frontend/backend, dừng và xác minh các luồng ghi vào Aiven, cấu hình truy cập dự phòng và kiểm tra nghiệp vụ. |
| Phúc / người vận hành database | Quyết định cùng dev thời điểm chuyển đổi; kiểm tra replication, lưu các mốc, bảo vệ dữ liệu, thao tác trên MySQL standby theo phạm vi lab và đối chiếu dữ liệu. |
| Người ghi nhận | Ghi thời điểm, kết quả, lỗi, người thực hiện và đường dẫn minh chứng; có thể là một trong hai người trên. |

## 2. Điều kiện phải chuẩn bị trước buổi thử

1. Thống nhất phạm vi dữ liệu thử, người quyết định chuyển đổi, thời gian thử và kênh liên lạc. Có bản sao lưu độc lập đã kiểm tra khôi phục; không dùng replica làm bản backup duy nhất.
2. Thống nhất cách **chặn toàn bộ nguồn ghi vào Aiven**: website/backend chính, job nền, công cụ quản trị và các ứng dụng khác nếu có. Kiểm tra việc chặn; chỉ lỗi kết nối từ máy Phúc chưa chứng minh Aiven ngừng nhận ghi. Không chuyển standby sang ghi nếu chưa cô lập được Aiven và chưa chấp nhận rủi ro mất giao dịch.
3. Kiểm tra container `omdrs-standby-sau-failback-mysql-standby-1`, UUID `13bc73d1-db6d-11f1-8c8e-22c586f6983b`, server ID `493203310`, MySQL 8.4.13, cổng `127.0.0.1:3308`, database `order_management`. Volume `omdrs-standby-sau-failback-data` chứa dữ liệu hiện tại; container cũ được giữ để đối chiếu. Xác nhận lại thực tế trước khi thao tác; giữ `read_only` và `super_read_only` bật trong vận hành bình thường.
4. Hai người xác nhận backend dự phòng, phiên bản code, frontend, URL truy cập và đường đi tới MySQL dự phòng. Backend đã kiểm tra readiness với Standby mới; frontend và thao tác ghi qua ứng dụng đã được thử trên Standby cũ. Cổng 3308 chỉ mở loopback trên máy Windows; máy khác hoặc cloud không dùng được `127.0.0.1:3308` của máy Phúc. Backend chạy trong Docker cần địa chỉ mạng phù hợp. Không tự mở cổng database ra Internet.
5. Chuẩn bị tài khoản MySQL dành cho backend dự phòng với quyền cần thiết và xác thực thử trong lab. Tài khoản replication trên Aiven và tài khoản root standby không tự động trở thành tài khoản ứng dụng; bộ lọc hiện tại chỉ nhắm tới bảng `order_management`. Không ghi mật khẩu vào runbook, Git, ảnh chụp hoặc chat.
6. Xác nhận cơ chế đăng nhập, cấu hình phiên, URL frontend/API và các biến môi trường phù hợp với bản ứng dụng. Theo tài liệu dự án, cấu hình Render gộp frontend và backend là một dịch vụ riêng; `docker/compose.app.yml` là lab cục bộ, hai backend dùng chung cấu hình database và không tự thiết lập failover database hai máy.
7. Nếu sẽ thử lỗi xóa nhầm dữ liệu, dùng dữ liệu giả trong môi trường thử đã tách biệt. Replication có thể truyền cả thao tác xóa sang standby; chuyển máy không thay thế khôi phục từ backup.

### Phương án frontend/backend dự phòng trên chính máy Phúc

Giảng viên thao tác ngay trên máy Phúc: trình duyệt mở frontend Vite tại `http://127.0.0.1:5173`, frontend proxy `/api` và `/health` tới backend tại `http://127.0.0.1:5000`, backend kết nối MySQL tại `127.0.0.1:3308`. Đường đi này đã được thử trong buổi failover với Standby cũ; trước buổi trình bày phải kiểm tra lại cấu hình và phiên bản hiện tại.

- Backend phải được cấu hình riêng cho lab: `DB_HOST=127.0.0.1`, `DB_PORT=3308`, `DB_NAME=order_management`, `INSTANCE_NAME=standby` và tài khoản/mật khẩu ứng dụng dành cho standby. Dùng biến môi trường hoặc tệp cấu hình riêng không đưa lên Git; xác nhận không ghi đè cấu hình đang dùng cho Aiven. Không dùng root cho backend.
- Cấu hình xác thực phù hợp: `JWT_SECRET` tối thiểu 32 ký tự; thỏa thuận cách xử lý phiên đăng nhập giữa hai môi trường. Cấu hình `DB_SSL` theo đúng kết nối MySQL cục bộ thực tế, không áp dụng mù chứng chỉ của Aiven cho localhost. Cấu hình `BACKUP_INTERVAL_HOURS=0` cho backend dự phòng trong buổi lab để tránh phát sinh lịch backup không mong đợi.
- Frontend lab dùng `VITE_API_BASE` rỗng và `API_PROXY_TARGET=http://127.0.0.1:5000` để Vite chuyển tiếp API tới backend cục bộ. Kiểm tra cổng 5000 và 5173 đang phục vụ đúng quy trình trước buổi thử; không giả định frontend Render sẽ tự trỏ về máy Phúc.
- Từ thư mục gốc dự án, sau khi chuẩn bị cấu hình và dependencies, có thể chạy backend bằng `npm run start -w backend` trong một cửa sổ PowerShell, frontend bằng `npm run dev -w frontend` trong cửa sổ khác. Đây là lệnh vận hành ứng dụng, không khởi tạo hay nâng cấp schema. Trước khi thử, xác nhận chính xác cấu hình database thực tế để không vô tình cho backend dự phòng ghi vào Aiven.
- Kiểm tra `http://127.0.0.1:5000/health/ready`, sau đó mở frontend cục bộ và kiểm tra đăng nhập/đọc dữ liệu bằng tài khoản thử. Health `Healthy` chỉ kiểm tra khả năng kết nối, migration 005 và cấu hình xác thực cơ bản; không chứng minh frontend, quyền ghi hoặc failover đã thành công. Theo dõi độc lập là phần cần chuẩn bị riêng nếu buổi demo cần minh chứng phát hiện sự cố.

### Phép kiểm tra đường đi tự động bằng dữ liệu giả

Ở thư mục gốc dự án, sau khi Docker Desktop, Python, Node.js và dependencies đã sẵn sàng, chạy:

```powershell
python .\database-deliverables\05_CHUYEN_DOI\thu-ket-noi-gia.py
```

Script tạo một MySQL tạm tên ngẫu nhiên trong mạng Docker riêng; cổng MySQL, backend và frontend Vite chỉ mở tại `127.0.0.1` với cổng thử tự chọn. Script nạp schema hiện tại, tạo tài khoản, sản phẩm và đơn giả, kiểm tra tồn kho, tạo báo cáo trong thư mục `minh-chung` và dừng các tài nguyên tạm của lần chạy. Mạng Docker riêng không được cấu hình chặn mọi kết nối ra ngoài, nhưng kết nối database của phép thử được đặt rõ về MySQL thử trên localhost. Không nhập hay sử dụng mật khẩu Aiven hoặc standby.

Phép thử kiểm tra trang React được phục vụ và API qua Vite proxy, không điều khiển trình duyệt. Script dùng image `mysql:8.4.13` đã có sẵn, không tự tải image. Phép thử một database này chưa kiểm tra replication, chuyển quyền ghi hoặc failback. Nếu Docker chưa chạy, chỉ khởi động Docker sau khi xem xét các container của dự án; sau khi MySQL standby 3308 khởi động lại, kiểm tra replication theo mục 3.

## 3. Kiểm tra và ghi mốc khi hệ thống còn hoạt động

Trong MySQL Workbench, chọn đúng **MySQL Standby 3308** rồi chạy các truy vấn chỉ đọc:

```sql
SELECT @@server_uuid AS server_uuid,
       @@server_id AS server_id,
       @@GLOBAL.read_only AS read_only,
       @@GLOBAL.super_read_only AS super_read_only,
       @@GLOBAL.skip_replica_start AS skip_replica_start;

SHOW REPLICA STATUS;
```

Ghi lại `Source_Host`, `Replica_IO_Running`, `Replica_SQL_Running`, `Seconds_Behind_Source`, `Last_IO_Error`, `Last_SQL_Error`, `Retrieved_Gtid_Set` và `Executed_Gtid_Set`. Ở trạng thái bình thường mong đợi hai luồng `Yes`, hai chế độ chỉ đọc bằng `1` và không có lỗi. Độ trễ 0 chỉ là chỉ báo tại thời điểm xem, không chứng minh RPO bằng 0 hay mọi bản ghi giống nhau.

Theo cấu hình hiện tại, `skip_replica_start=ON`: sau khi MySQL khởi động lại cần kiểm tra và khởi động replication; không mặc định replication tự chạy. Thông tin xác thực cấp khi `START REPLICA` không được lưu trong metadata và cần nhập lại; xem [MySQL: replication metadata](https://dev.mysql.com/doc/refman/8.4/en/replica-logs-status.html).

### Khởi động lại Standby hiện tại sau khi tắt máy

1. Phúc mở Docker Desktop, sau đó PowerShell tại thư mục gốc dự án. Kiểm tra container và volume đang dùng, không dùng `docker compose down -v`, `docker volume rm`, `RESET REPLICA` hoặc tạo lại dữ liệu để xử lý lỗi:

   ```powershell
   docker ps -a --filter "name=omdrs-standby-sau-failback"
   docker start omdrs-standby-sau-failback-mysql-standby-1
   ```

   `docker start` dùng lại container và volume hiện có. Nếu container không tồn tại hoặc cổng 3308 bị chiếm, dừng và kiểm tra; không tạo thêm cổng hoặc xóa volume.
2. Trong Workbench kết nối quản trị `127.0.0.1:3308`, xác nhận UUID `13bc73d1-db6d-11f1-8c8e-22c586f6983b`, `read_only=1`, `super_read_only=1` và kiểm tra `SHOW REPLICA STATUS`. Nếu hai luồng đã `Yes`, kiểm tra lỗi, độ trễ và dữ liệu; không chạy lệnh khởi động lại tùy tiện.
3. Nếu replication đang dừng, Standby vẫn là bản chỉ đọc chưa từng nhận ghi kể từ lần khởi tạo này, và chưa đổi container/UUID/schema, Phúc có thể chạy:

   ```powershell
   cd C:\Users\Admin\QLDH_CNNT
   python .\scripts\khoi-dong-replication-sau-failback.py --container-root-env
   ```

   Nhập mật khẩu Aiven của `replica_phuc` khi được hỏi. Script dành riêng cho container, UUID và mốc bản sao ngày 08/11; nó kiểm tra TLS, bộ lọc, GTID đã nhận và binlog còn phù hợp trước khi chạy. Nếu lỗi hoặc kết quả không rõ, lưu lỗi đã che thông tin nhạy cảm và kiểm tra trạng thái trước khi thử lại.
4. Xác minh lại hai luồng `Yes`, các lỗi bằng 0, `read_only=1`, `super_read_only=1`; kiểm tra một giao dịch ứng dụng theo phạm vi cho phép. Aiven từng được cấu hình `binlog_retention_period=14400` giây; đây là giá trị quan sát, không bảo đảm mọi binlog còn sẵn sau từng ấy thời gian. Khi thiếu GTID đã bị xóa, phải điều tra và có thể cần khởi tạo lại Standby từ bản sao phù hợp; không tự bỏ qua hoặc đánh dấu giả GTID. [MySQL: GTID auto-positioning](https://dev.mysql.com/doc/refman/8.4/en/replication-gtids-auto-positioning.html).

Trong lần khởi tạo ngày 08/11, trước khi standby cũ nhận ghi, nhóm đã kiểm tra GTID, TLS và khởi động replication. **Sau khi standby đã nhận ghi trong buổi failover, không nối lại replication cũ một cách máy móc**: dữ liệu và GTID hai phía đã phân nhánh. Cần hoàn tất failback, kiểm tra và khởi tạo lại standby theo bản sao phù hợp. Nếu Aiven đã xóa binlog chứa giao dịch standby còn thiếu, khởi động lại máy không khôi phục được những binlog đó.

Bộ lọc hiện tại chỉ hướng tới bảng `order_management`; không mặc định rằng tài khoản MySQL hoặc mọi loại đối tượng ngoài bảng được đồng bộ. MySQL ghi rõ bộ lọc `replicate-wild-do-table` không áp dụng cho stored procedure, function và event; cần kiểm tra riêng khi schema thay đổi. [MySQL: replica filters](https://dev.mysql.com/doc/refman/8.4/en/replication-options-replica.html).

Trong thời điểm không có giao dịch thử đang thay đổi, so sánh cấu trúc và dữ liệu liên quan (ID, trạng thái, số tiền, sản phẩm, số lượng, tồn kho, lịch sử đơn) trên Aiven và standby. Số bản ghi bằng nhau chỉ là bước đầu. Ghi lại phiên bản ứng dụng/schema và ảnh hoặc báo cáo không chứa mật khẩu.

## 4. Failover — đưa máy Phúc tiếp quản

**Chỉ thực hiện sau khi hoàn thành mục 2.** Các lệnh bên dưới thay đổi trạng thái MySQL standby thật nếu chạy trên kết nối hiện tại; trước tiên nhóm cần thực hành trên môi trường lab tách biệt. Xác nhận rõ tên kết nối và `@@server_uuid` trước từng thao tác.

1. **Phát hiện và đánh giá.** Ghi thời điểm xảy ra/phát hiện sự cố, loại lỗi và dịch vụ bị ảnh hưởng. Với lỗi mạng, kiểm tra từ nhiều vị trí; không suy ra Aiven đã dừng chỉ vì máy standby mất kết nối. Thông báo nhóm tạm dừng giao dịch.
2. **Ngăn ghi kép.** Người vận hành ứng dụng chặn mọi nguồn ghi vào Aiven và xác minh thực tế. Nếu không thể kiểm chứng, dừng: chưa cho standby nhận ghi. Với sự cố Aiven không thể truy cập, phải có cơ chế cô lập phù hợp trước khi chuyển; `read_only` trên standby không khóa Aiven.
3. **Kiểm tra phần dữ liệu đã nhận.** Trên standby, lưu `SHOW REPLICA STATUS` và GTID, các lỗi và mốc cuối quan sát được. Sau khi đã cô lập nguồn ghi, có thể dừng riêng luồng nhận để cố định tập giao dịch đã nhận, giữ luồng áp dụng chạy để xử lý phần còn lại:

   Nếu Aiven vẫn truy cập được sau khi chặn toàn bộ nguồn ghi, trước tiên lấy `SELECT @@GLOBAL.gtid_executed;` trên đúng Aiven. Trên standby, chờ mốc đó bằng `SELECT WAIT_FOR_EXECUTED_GTID_SET('DAN_MOC_GTID_AIVEN_VAO_DAY', 30);`; `0` nghĩa là mốc đã được áp dụng, còn `1` là hết thời gian chờ. Sau đó mới dừng luồng nhận và tiếp tục các kiểm tra bên dưới. Do có bộ lọc, GTID đã áp dụng không thay thế đối chiếu dữ liệu theo phạm vi. Nếu Aiven không thể truy cập, ghi rõ không có mốc cuối xác nhận được, đánh giá khả năng mất dữ liệu và chỉ tiếp tục nếu đã cô lập nguồn ghi cũ và nhóm chấp nhận rủi ro đó.

   ```sql
   -- CHỈ chạy trên standby lab, sau khi đã cô lập nguồn ghi cũ.
   STOP REPLICA IO_THREAD;
   SHOW REPLICA STATUS;
   ```

   Ghi lại toàn bộ `Retrieved_Gtid_Set` từ kết quả, rồi thay đúng phần trong dấu nháy của truy vấn dưới đây bằng tập vừa ghi:

   ```sql
   SELECT GTID_SUBSET('DAN_TAP_RETRIEVED_GTID_SET_VAO_DAY',
                      @@GLOBAL.gtid_executed) AS da_ap_dung_phan_da_nhan;
   ```

   Khi nhận giá trị `1`, standby đã đánh dấu áp dụng tập GTID đã nhận; vẫn phải xem lỗi luồng áp dụng và đối chiếu dữ liệu. Nếu tập nhận rỗng, kết quả này không xác nhận đã có giao dịch mới. Nếu luồng áp dụng lỗi hoặc kiểm tra chưa đạt, dừng để điều tra; không tự bỏ qua lỗi hoặc đánh dấu giao dịch đã chạy. Khi nguồn đã ngừng đột ngột, vẫn có thể mất các giao dịch đã commit trên nguồn nhưng chưa tới standby; không kết luận RPO bằng 0.
4. **Đóng băng trạng thái và chuyển quyền ghi trên standby lab.** Sau khi cô lập nguồn ghi cũ và kiểm tra bước 3, người vận hành database chạy trong phiên quản trị đúng standby:

   ```sql
   -- CHỈ chạy trên standby được chọn để tiếp quản, không chạy trên Aiven.
   STOP REPLICA;
   SET GLOBAL super_read_only = OFF;
   SET GLOBAL read_only = OFF;
   SELECT @@server_uuid AS server_uuid,
          @@GLOBAL.read_only AS read_only,
          @@GLOBAL.super_read_only AS super_read_only;
   ```

   Kỳ vọng hai giá trị bằng `0`. `STOP REPLICA` không xóa dữ liệu hay cấu hình replication, nhưng sau khi standby đã phát sinh ghi, **không chạy lại replication cũ một cách máy móc**. Nếu có lỗi ở bất kỳ lệnh nào, dừng và ghi lại nguyên văn lỗi đã che thông tin nhạy cảm.

   Cấu hình khởi tạo container hiện lưu `super_read_only=ON` cho lần khởi động sau. Vì vậy nếu MySQL standby khởi động lại trong lúc đang tiếp quản, nó có thể trở lại chỉ đọc và ứng dụng không ghi được. Kiểm tra lại trạng thái, nguồn ghi duy nhất và kế hoạch vận hành trước khi xử lý; không mặc định rằng quyền ghi vẫn giữ nguyên.
5. **Kết nối ứng dụng dự phòng.** Bạn dev chuyển backend dự phòng tới đúng MySQL vừa được phép ghi bằng tài khoản ứng dụng đã chuẩn bị và xác minh `/health/ready`. Sau đó chuyển điểm truy cập frontend/API theo phương án nhóm đã cấu hình và kiểm thử. Không khẳng định URL Render tự chuyển sang localhost. Kiểm tra đăng nhập bằng tài khoản thử và đọc đơn trước khi cho thao tác ghi.
6. **Kiểm thử và ghi nhận.** Tạo một đơn giả được đánh dấu rõ, đối chiếu ID, sản phẩm, số lượng, tồn kho, trạng thái và lịch sử trên standby. Ghi lúc dịch vụ thực sự phục hồi và giao dịch kiểm tra. Nếu thao tác gửi bị timeout, kiểm tra kết quả trước khi gửi lại, dùng cơ chế idempotency của ứng dụng nếu có.

## 5. Failback — xử lý khi Aiven trở lại

**Aiven có thể đã nhận dữ liệu khác trước lúc bị cô lập. Các đơn phát sinh trên standby cũng chưa tự trở về Aiven.** Không chuyển backend trở lại Aiven ngay khi dịch vụ hiện là Running.

1. Tiếp tục giữ Aiven không nhận ghi từ người dùng/ứng dụng. Xác định rõ hệ thống nào đang là nguồn dữ liệu đang được sử dụng; ghi khoảng thời gian hai bên mất liên lạc, sự cố và các giao dịch có thể chưa đồng bộ.
2. Cho ứng dụng tạm ngừng ghi trên standby tại thời điểm cắt chuyển. Xác nhận không còn request/job ghi đang chạy. Bảo vệ hiện trạng của **cả hai phía** bằng các bản sao phù hợp, lưu riêng, ghi thời điểm và kiểm tra khả năng sử dụng.
3. Cùng bạn dev đối chiếu các thay đổi sau lần đồng bộ cuối: đơn mới/sửa/hủy, lịch sử, sản phẩm, tồn kho và các bảng liên quan. Xác định giao dịch chỉ có ở Aiven, chỉ có ở standby và xung đột. Nếu không chứng minh được kết quả, ghi chưa xác định và tiếp tục điều tra; không tự xóa một phía.
4. Nhóm chọn kế hoạch đưa dữ liệu đã thống nhất về Aiven, thử trước trên **Aiven/database đích riêng** hoặc môi trường lab. Các cách có thể gồm xuất/nhập có kiểm soát hoặc công cụ migration Aiven khi đáp ứng điều kiện. Công cụ migration có thể ghi đè dữ liệu đích; không khởi chạy trên database đang phục vụ chỉ để thử. Việc mở hướng replication ngược từ máy cá nhân lên Aiven cần thiết kế kết nối, quyền và phạm vi riêng; cấu hình hiện tại chưa chứng minh làm được.
5. Sau khi kế hoạch đã được nhóm thực hiện và đối chiếu xong, giữ backend standby dừng ghi. Trên đúng Standby cũ, Phúc bật `SET GLOBAL super_read_only = ON;`, kiểm tra cả `@@GLOBAL.read_only` và `@@GLOBAL.super_read_only` bằng `1`, rồi dev chuyển frontend/backend về Aiven. Kiểm tra đăng nhập, đọc dữ liệu, tạo một giao dịch giả theo phạm vi lab; xác nhận chỉ Aiven nhận ghi. Nếu chưa xác minh được trạng thái hai phía, tiếp tục giữ nguồn ghi dừng.
6. Thiết lập lại standby từ trạng thái Aiven đã thống nhất bằng quy trình khởi tạo phù hợp, kiểm tra GTID/binlog, TLS, bộ lọc và dữ liệu; sau đó xác nhận hai luồng replication. Không dùng nguyên script khởi động cũ hay tự sửa GTID chỉ vì standby từng được promote.

### Phạm vi đã thử ngày 08/11 và trường hợp cần xử lý riêng

Trong buổi thử, nhóm bảo vệ cả hai phía bằng backup, khôi phục thử hai bản trong môi trường cách ly và đối chiếu các bảng. Phương án cụ thể chuyển **một đơn thử**, lịch sử, khóa yêu cầu và thay đổi tồn kho về Aiven; `auth_sessions` giữ theo Aiven. Đã thử điều kiện sai và rollback trên bản sao cách ly, rồi chạy một transaction có kiểm tra điều kiện trên Aiven. Sau đó website chính tạo được đơn mới, Standby được dựng lại và nhận được đơn thử sau khi bật replication. Biên bản và ảnh: [failover](minh-chung/failover-20261108.md), [failback và dựng lại Standby](minh-chung/failback-20261108.md).

Các script `giao-dich-failback-20261108.py` và `thuc-hien-failback-20261108.py` gắn với dữ liệu và backup của lần thử này; **không chạy lại cho sự cố mới**. Với nhiều đơn hoặc thay đổi ở cả hai phía, dev và Phúc phải lập danh sách thay đổi, quyết định cách giải quyết xung đột, thử trên đích cách ly và đối chiếu trước khi thực hiện. Chưa có công cụ tự động hợp nhất mọi trường hợp, chưa đo RTO/RPO và chưa thử failover tự động khi mạng bị chia cắt.

## 6. Mẫu ghi kết quả buổi thử

| Nội dung | Điền sau khi thực hiện |
|---|---|
| Ngày, giờ và người thực hiện | … |
| Kịch bản và dữ liệu thử | … |
| Phiên bản code, database, URL truy cập | … |
| Thời điểm bắt đầu / phát hiện / cô lập nguồn ghi | … |
| Replication, GTID, lỗi và nguy cơ thiếu giao dịch | … |
| Thời điểm standby bắt đầu nhận ghi / dịch vụ phục hồi | … |
| Đơn thử, tồn kho, lịch sử và kết quả đối chiếu | … |
| Phương án failback, kết quả đối chiếu hai phía | … |
| Lỗi, ảnh hoặc đường dẫn minh chứng | … |
| RTO và RPO | Tính theo mốc quan sát được; ghi **chưa xác định** khi thiếu dữ kiện. |

RTO đo từ thời điểm bắt đầu sự cố đã xác định đến khi dịch vụ phục hồi theo tiêu chí nhóm thống nhất. RPO cần mốc giao dịch cuối đã commit ở nguồn và giao dịch cuối được phục hồi; không suy ra RPO bằng 0 từ một ảnh `Seconds_Behind_Source=0`.

## Tài liệu tham khảo

- [MySQL 8.4: Chuyển nguồn khi failover](https://dev.mysql.com/doc/refman/8.4/en/replication-solutions-switch.html)
- [MySQL 8.4: Các tùy chọn replication trên replica](https://dev.mysql.com/doc/refman/8.4/en/replication-options-replica.html)
- [Aiven: Migration MySQL từ nguồn ngoài](https://aiven.io/docs/products/mysql/howto/migrate-from-external-mysql)
- [Aiven: Migration bằng Console và cảnh báo dữ liệu đích](https://aiven.io/docs/products/mysql/howto/migrate-db-to-aiven-via-console)
- Quy trình và giới hạn hiện có của dự án: `docs/incident-runbook.md`, `docs/ket-qua-dong-bo-aiven-standby-20261104.md`, `docs/deploy-render-aiven.md`.
