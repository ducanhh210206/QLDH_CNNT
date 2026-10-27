# OMDRS — Quản lý đơn hàng & phục hồi sự cố

Website quản lý đơn hàng với **React 19 + Vite 8**, **Node.js + Express 5**, **MySQL 8.4** và dịch vụ giám sát độc lập.

Chức năng chính: đăng nhập Admin/Staff, tạo và tìm kiếm đơn hàng, cập nhật trạng thái có lịch sử, dashboard thống kê, giám sát, sao lưu SQL, phục hồi vào database cách ly và mô phỏng quy trình xử lý sự cố.

> Hướng dẫn này dành cho người tải mã nguồn về máy mới. Repository không chứa tài khoản, mật khẩu, database hay dữ liệu trên máy tác giả. Người chạy phải tự cấu hình môi trường và tạo tài khoản website.

## 1. Chuẩn bị

| Thành phần | Yêu cầu |
|---|---|
| Node.js | Khuyến nghị 24 LTS; Node 22.22.3 cũng chạy được với dependency hiện tại |
| npm | Đi kèm Node.js; dự án dùng npm workspaces và package-lock.json |
| Git | Để clone repository; có thể thay bằng Download ZIP trên GitHub |
| Docker Desktop / Docker Engine | Engine phải đang chạy nếu dùng MySQL Docker |
| MySQL | 8.4, truy cập được từ máy chạy Backend |
| Terminal | macOS: zsh; Linux/WSL2: Bash; Windows: PowerShell hoặc WSL2 |

Kiểm tra trong Terminal:

```bash
node -v
npm -v
git --version
docker version
```

`docker version` phải hiển thị được phần Server. Nếu báo không kết nối được daemon, mở Docker Desktop và chờ Engine sẵn sàng.

## 2. Tải mã nguồn và cài thư viện

Clone repository của dự án:

```bash
git clone https://github.com/ducanhh210206/QLDH_CNNT.git omdrs
cd omdrs
```

Nếu repository có thêm thư mục con `order-management-system`, đi vào thư mục đó:

```bash
cd order-management-system
```

**Thư mục gốc dự án** trong toàn bộ hướng dẫn là thư mục chứa `package.json`, `package-lock.json`, `frontend/`, `backend/` và `monitoring/`. Kiểm tra bằng `ls` trên macOS/Linux hoặc `Get-ChildItem` trên PowerShell.

Nếu dùng **Code → Download ZIP**, giải nén rồi mở Terminal tại thư mục gốc dự án đó.

Cài dependency cho cả FE, BE và Monitoring bằng một lệnh:

```bash
npm ci
```

Không cần chạy `npm install` riêng trong từng thư mục, không copy `node_modules` từ máy khác và không sửa lockfile để cài đặt thông thường.

## 3. Chuẩn bị MySQL: chọn một trong hai cách

### Cách A — Đã có MySQL Docker

Dùng container hiện có, không tạo container thay thế. Các lệnh Docker có thể chạy từ bất kỳ thư mục nào:

```bash
docker ps -a
```

Ghi lại tên container MySQL và cổng được publish. Ví dụ nếu container tên `mysql_server_container`:

```bash
docker port mysql_server_container
docker exec -it mysql_server_container mysql -u root -p
```

`root` là ví dụ tài khoản quản trị; thay bằng tài khoản thực tế nếu khác. Nhập mật khẩu MySQL tương tác khi được hỏi. Không phải mật khẩu Mac, Docker Desktop hoặc website.

Khi thấy dấu nhắc `mysql>`, kiểm tra:

```sql
SHOW DATABASES;

SELECT TABLE_NAME
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = 'order_management';

SHOW GRANTS;
exit;
```

- Nếu `order_management` chưa tồn tại hoặc rỗng: có thể khởi tạo ở bước 5.
- Nếu đã có các bảng OMDRS từ lần chạy trước: giữ nguyên, bỏ qua bước khởi tạo và dùng tài khoản website đã tạo.
- Nếu có bảng của ứng dụng khác hoặc chưa biết nguồn dữ liệu: dừng khởi tạo để kiểm tra, không ghi đè.
- Dùng tài khoản MySQL riêng cho ứng dụng. Tài khoản khởi tạo cần quyền tạo database `order_management` nếu chưa có, tạo bảng/index/foreign key và quyền đọc/ghi. Tài khoản chạy thường ngày cần SELECT/INSERT/UPDATE/DELETE trên schema ứng dụng.

Nếu MySQL đã chạy trực tiếp trên máy hoặc trên server khác, vẫn dùng được: bỏ qua lệnh Docker và lấy thông tin host/port/user từ người quản trị.

### Cách B — Máy mới, chưa có MySQL

Chỉ dùng cách này khi cần tạo **MySQL phát triển riêng** và cổng 3306 chưa được dịch vụ khác sử dụng. Nếu đã có MySQL, quay lại Cách A.

Trong thư mục gốc dự án, tạo tệp **`.env.mysql.local`** với nội dung sau và **thay cả hai giá trị mật khẩu bằng mật khẩu riêng** trước khi chạy:

```dotenv
MYSQL_ROOT_PASSWORD=THAY_BANG_MAT_KHAU_QUAN_TRI_RIENG
MYSQL_DATABASE=order_management
MYSQL_USER=order_user
MYSQL_PASSWORD=THAY_BANG_MAT_KHAU_UNG_DUNG_RIENG
```

Không dùng các chuỗi mẫu làm mật khẩu. Tệp này đã được loại khỏi Git bằng `.gitignore`.

Chạy lệnh sau trên một dòng; dùng được trong zsh, Bash và PowerShell:

```bash
docker run -d --name omdrs_mysql_local --restart unless-stopped --env-file .env.mysql.local -p 127.0.0.1:3306:3306 --mount type=volume,source=omdrs_mysql_local_data,target=/var/lib/mysql mysql:8.4
```

Container mới có tên `omdrs_mysql_local`, dữ liệu lưu trong volume `omdrs_mysql_local_data`. Lần chạy đầu cần chờ MySQL khởi tạo xong; kiểm tra bằng:

```bash
docker exec -it omdrs_mysql_local mysql -u order_user -p -e "SELECT VERSION();"
```

Nhập giá trị `MYSQL_PASSWORD` vừa đặt. Khi truy vấn thành công, tiếp tục bước 4.

Nếu container này đã tồn tại từ lần thiết lập trước, dùng `docker start omdrs_mysql_local`, không chạy lại `docker run`. Các biến MYSQL_* chỉ khởi tạo tài khoản khi volume còn mới; sửa tệp môi trường không tự đổi mật khẩu của database đã có.

> Không chạy hai MySQL cùng cổng. Không xóa volume, reset container hoặc dùng `docker compose down -v` để xử lý lỗi đăng nhập.

## 4. Cấu hình Backend

Chạy tại **thư mục gốc dự án**. Trên macOS/Linux/WSL2:

```bash
cp -n backend/.env.example backend/.env
cp -n monitoring/.env.example monitoring/.env
```

Trên PowerShell:

```powershell
if (!(Test-Path backend/.env)) { Copy-Item backend/.env.example backend/.env }
if (!(Test-Path monitoring/.env)) { Copy-Item monitoring/.env.example monitoring/.env }
```

Các lệnh trên giữ nguyên tệp đã có. Mở `backend/.env` bằng trình soạn thảo và điền:

```dotenv
PORT=5000
HOST=127.0.0.1
NODE_ENV=development
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=order_management
DB_USER=order_user
DB_PASSWORD="THAY_BANG_MAT_KHAU_MYSQL_CUA_TAI_KHOAN_TREN"
JWT_SECRET=THAY_BANG_CHUOI_NGAU_NHIEN_TOI_THIEU_32_KY_TU
CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
INSTANCE_NAME=primary
MONITOR_URL=http://127.0.0.1:5001
MONITOR_TOKEN=
BACKUP_INTERVAL_HOURS=0
BACKUP_RETENTION_DAYS=30
```

- Nếu dùng Cách B, `DB_USER` là giá trị MYSQL_USER và `DB_PASSWORD` là MYSQL_PASSWORD trong `.env.mysql.local`.
- Nếu dùng Cách A, thay bằng tài khoản/mật khẩu/cổng **thực tế**; `order_user` không được coi là đã tồn tại.
- BE chạy trực tiếp trên máy Mac/Windows dùng `127.0.0.1` khi MySQL publish trên cùng máy. BE chạy trong Docker dùng địa chỉ phù hợp, ví dụ `host.docker.internal`; không dùng localhost để trỏ sang container khác.
- Mật khẩu có dấu `#` cần được đặt trong dấu nháy phù hợp với định dạng dotenv.

Sinh chuỗi ngẫu nhiên cho `JWT_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Dán kết quả vào JWT_SECRET, không giữ chuỗi mẫu. Secret này khác mật khẩu MySQL và không đưa vào Frontend.

**Sau mỗi lần sửa `backend/.env`, dừng BE bằng Control + C rồi chạy lại để nạp cấu hình mới.** Không chỉ tải lại trang web.

Frontend mặc định không cần tệp `.env`: Vite đã proxy `/api` và `/health` tới Backend cổng 5000.

## 5. Khởi tạo database — chỉ thực hiện lần đầu

Chỉ chạy sau khi đã xác nhận `order_management` chưa có bảng.

macOS/Linux/WSL2:

```bash
CONFIRM_EMPTY_DATABASE=order_management npm run db:init
```

PowerShell:

```powershell
$env:CONFIRM_EMPTY_DATABASE = 'order_management'
npm run db:init
Remove-Item Env:CONFIRM_EMPTY_DATABASE
```

Kết quả mong đợi:

```text
Schema 001 đã được áp dụng.
```

Script tạo database nếu chưa có, tạo các bảng từ `database/init/schema.sql` và ghi phiên bản migration. Script từ chối nếu database đã có bất kỳ bảng nào. **Không xóa bảng để chạy lại.** Nếu khởi tạo bị gián đoạn, kiểm tra các bảng đã tạo trước khi sửa tiếp vì DDL MySQL không rollback toàn bộ.

## 6. Tạo tài khoản đăng nhập website — chỉ thực hiện lần đầu

Tài khoản website **khác tài khoản MySQL**. Không có tài khoản hoặc mật khẩu mặc định. Ví dụ dưới đây tạo username `admin` với mật khẩu do người chạy tự nhập, tối thiểu 12 ký tự. Dùng mật khẩu không quá 256 ký tự để phù hợp giới hạn đăng nhập.

**macOS / zsh** — chạy lần lượt tại thư mục gốc dự án:

```zsh
export NEW_USERNAME=admin
read -s 'NEW_PASSWORD?Nhập mật khẩu website (ít nhất 12 ký tự): '
export NEW_PASSWORD
NEW_ROLE=Admin npm run user:create
unset NEW_PASSWORD NEW_USERNAME
```

**Linux / Bash / WSL2:**

```bash
export NEW_USERNAME=admin
read -s -p 'Nhập mật khẩu website (ít nhất 12 ký tự): ' NEW_PASSWORD
printf '\n'
export NEW_PASSWORD
NEW_ROLE=Admin npm run user:create
unset NEW_PASSWORD NEW_USERNAME
```

**Windows / PowerShell:**

```powershell
$env:NEW_USERNAME = 'admin'
$securePassword = Read-Host 'Nhập mật khẩu website (ít nhất 12 ký tự)' -AsSecureString
$env:NEW_PASSWORD = [System.Net.NetworkCredential]::new('', $securePassword).Password
$env:NEW_ROLE = 'Admin'
try {
    npm run user:create
} finally {
    Remove-Item Env:NEW_PASSWORD, Env:NEW_USERNAME, Env:NEW_ROLE
    $securePassword.Dispose()
    Remove-Variable securePassword
}
```

Khi nhập mật khẩu ẩn, Terminal không hiện ký tự. Nhập xong nhấn Enter. Kết quả mong đợi:

```text
Đã tạo tài khoản admin (Admin).
```

Chỉ tạo một lần. Nếu báo `ER_DUP_ENTRY` / `Duplicate entry` cho username admin, tài khoản đã tồn tại; dùng tài khoản đó để đăng nhập, không khởi tạo lại database. Muốn tạo nhân viên, đổi username và NEW_ROLE thành Staff.

## 7. Chạy BE và FE

Mở **hai Terminal**, cả hai đều ở **thư mục gốc dự án**. Phần `-w backend` / `-w frontend` đã chọn package, không cần `cd` vào thư mục con.

**Terminal 1 — Backend:**

```bash
npm run dev -w backend
```

Kết quả mong đợi có `server_started`, port 5000 và `auth_configured: true`.

Kiểm tra:

- [http://127.0.0.1:5000/health/live](http://127.0.0.1:5000/health/live): tiến trình BE đang sống.
- [http://127.0.0.1:5000/health/ready](http://127.0.0.1:5000/health/ready): database/schema và cấu hình xác thực sẵn sàng, HTTP 200 với `status: Healthy`, `database: Healthy`.

**Terminal 2 — Frontend:**

```bash
npm run dev -w frontend
```

Mở **[http://127.0.0.1:5173](http://127.0.0.1:5173)**. Đăng nhập bằng username và mật khẩu website đã tạo ở bước 6.

Không mở trực tiếp `frontend/index.html`. Giữ hai Terminal chạy trong lúc sử dụng; Control + C để dừng từng dịch vụ.

### Những lần chạy tiếp theo

Sau lần thiết lập đầu tiên, chỉ cần:

1. Mở Docker Desktop và khởi động lại container MySQL hiện có nếu nó đang dừng.
2. Chạy Backend và Frontend như trên.
3. Đăng nhập bằng tài khoản đã tạo.

**Không chạy lại `db:init`, `user:create` hoặc tạo lại container ở mỗi lần mở ứng dụng.**

## 8. Thử đơn hàng đầu tiên

1. Đăng nhập và vào **Tạo đơn hàng**.
2. Nhập tên khách hàng, sản phẩm, số lượng nguyên dương, tổng tiền không âm; để trạng thái Đang chờ.
3. Bấm **Lưu đơn hàng** và chờ xác nhận từ MySQL.
4. Mở **Quản lý đơn hàng**, thử tìm kiếm, lọc và xem chi tiết.
5. Chuyển đơn từ Đang chờ sang Hoàn tất hoặc Đã hủy, kiểm tra lịch sử cập nhật.
6. Mở **Tổng quan** để xem thống kê. Doanh thu chỉ cộng các đơn Hoàn tất.

Đơn Hoàn tất/Đã hủy không chuyển ngược về Đang chờ. Nếu mất kết nối khi gửi đơn, dùng nút thử lại cùng yêu cầu đang chờ để tránh tạo trùng; không tự tạo yêu cầu mới khi kết quả chưa rõ.

Có thể đối chiếu trong MySQL bằng truy vấn chỉ đọc:

```sql
SELECT id, customer_name, status, total_amount, version
FROM order_management.orders
ORDER BY created_at DESC
LIMIT 10;
```

## 9. Giám sát hệ thống — tùy chọn

Sinh thêm một chuỗi ngẫu nhiên bằng lệnh ở bước 4, khác JWT_SECRET. Điền cùng chuỗi vào `MONITOR_TOKEN` trong **cả hai tệp** `backend/.env` và `monitoring/.env`, tối thiểu 32 ký tự.

Cấu hình `monitoring/.env`:

```dotenv
MONITOR_HOST=127.0.0.1
MONITOR_PORT=5001
MONITOR_TOKEN=THAY_BANG_CUNG_TOKEN_VOI_BACKEND
PRIMARY_URL=http://127.0.0.1:5000
STANDBY_URL=
GATEWAY_URL=
MONITOR_INTERVAL_MS=10000
```

Khởi động lại BE, rồi mở Terminal thứ ba ở thư mục gốc:

```bash
npm start -w monitoring
```

Đăng nhập Admin và mở **Giám sát hệ thống**. Thành phần chưa cấu hình hiển thị Not Configured. Monitor lưu chuyển trạng thái trong `monitoring/data/`, chạy độc lập với BE.

Sau khi đã cấu hình xong, có thể dùng **một Terminal** để chạy cả BE, FE và Monitoring:

```bash
npm run dev
```

Dừng các tiến trình đang chạy riêng trước khi dùng lệnh tổng hợp, tránh trùng cổng. Control + C sẽ dừng cả ba tiến trình.

## 10. Backup, restore và mô phỏng

- Admin tạo backup SQL trên trang **Backup & Restore**. Backup thật nằm trong `database/backups/`, có checksum và không đưa lên Git.
- Restore tạo database mới `omdrs_restore_<uuid>` để đối chiếu, không ghi đè database đang sử dụng.
- **Tài khoản MySQL chỉ được cấp quyền trên order_management không có quyền tạo database restore.** Restore cần quyền được người quản trị cấp riêng cho database cách ly; không mặc định đã được cấp. Không cấp quyền quản trị toàn server cho tài khoản runtime chỉ để thử chức năng này.
- Lịch backup cấu hình bằng BACKUP_INTERVAL_HOURS; 0 là tắt. BACKUP_RETENTION_DAYS mặc định 30 ngày; dọn bản cũ sau các lần backup theo lịch thành công.
- Các nút ở **Quản lý sự cố** là Demo, ghi nhật ký mô phỏng; không dừng dịch vụ, ngắt mạng hay xóa dữ liệu thật.
- Xem [runbook sự cố](docs/incident-runbook.md) trước khi thử hạ tầng. Replication/HA liên máy chưa được mặc định triển khai hoặc kiểm chứng.

## 11. Build và kiểm thử

Chạy ở thư mục gốc:

```bash
npm run build
npm test
```

Build tạo `frontend/dist/`. Bộ test mặc định kiểm tra nghiệp vụ và HTTP; integration test MySQL được bỏ qua nếu chưa bật rõ ràng.

Chỉ khi có tài khoản MySQL được phép tạo database kiểm thử/restore **mới và cách ly**, chạy integration test:

```bash
RUN_DB_INTEGRATION=1 npm test -w backend
```

PowerShell:

```powershell
$env:RUN_DB_INTEGRATION = '1'
npm test -w backend
Remove-Item Env:RUN_DB_INTEGRATION
```

Test tạo schema ngẫu nhiên `omdrs_test_<uuid>` và database restore, giữ lại để kiểm tra, không tự DROP dữ liệu. Không mở rộng quyền tài khoản production chỉ để chạy test; dùng môi trường thử nghiệm riêng.

[Thông tin kiểm thử khi xây dựng](docs/testing-report.md) là báo cáo theo thời điểm, không phải bảo đảm mọi máy tải về đã được cấu hình hoặc kiểm thử.

## 12. Lỗi thường gặp

| Triệu chứng | Cách xử lý |
|---|---|
| Docker không kết nối daemon | Mở Docker Desktop, chờ Engine running, kiểm tra lại docker version |
| ERROR 1045 / Access denied | Kiểm tra đúng tài khoản/mật khẩu MySQL; mật khẩu trong cấu hình khởi tạo cũ có thể đã thay đổi. Không xóa volume để sửa lỗi |
| ECONNREFUSED / readiness 503 | Kiểm tra container, cổng publish, DB_HOST/DB_PORT và schema; khởi động lại BE sau khi sửa .env |
| auth_configured: false | JWT_SECRET chưa đủ 32 ký tự hoặc BE chưa nạp .env mới; điền secret rồi khởi động lại |
| Database có bảng, script từ chối | Nếu đã cài OMDRS thì bỏ qua db:init. Nếu dữ liệu không rõ nguồn thì dừng để kiểm tra, không xóa bảng |
| Duplicate entry khi tạo admin | Tài khoản đã có; bỏ qua user:create và dùng mật khẩu website đã đặt |
| Đăng nhập không đúng | Dùng mật khẩu website ở bước 6, không dùng mật khẩu root/MySQL |
| API báo 401 | Đăng nhập lại; phiên có thời hạn 8 giờ. Dùng cùng địa chỉ FE nhất quán, không đổi qua lại localhost và 127.0.0.1 |
| EADDRINUSE / port already in use | Kiểm tra Terminal đã chạy dịch vụ chưa; không mở thêm bản trùng. Chỉ dừng tiến trình của mình |
| FE chạy nhưng gọi API lỗi | BE phải chạy cổng 5000 theo frontend/vite.config.js; kiểm tra /health/ready |
| Monitoring Unknown | Chạy process Monitoring, kiểm tra MONITOR_URL và cùng MONITOR_TOKEN ở hai tệp, khởi động lại BE/Monitor |
| Restore bị từ chối quyền | Tài khoản DB chưa được cấp quyền cho database cách ly; nhờ người quản trị cấp đúng phạm vi |
| Lệnh read -s không chạy trên Windows | Dùng khối PowerShell ở bước 6 hoặc mở WSL2/Bash |

Nếu đổi cổng BE, sửa cả `PORT` trong backend/.env, proxy ở frontend/vite.config.js và PRIMARY_URL của Monitoring. Nếu đổi cổng FE, cập nhật CORS_ORIGINS. Khởi động lại các dịch vụ liên quan. Không đưa secret vào biến VITE_*.

## 13. Cấu trúc mã nguồn

```text
frontend/     React + Vite, trang và thành phần giao diện
backend/      Express, middleware, controller, service, repository, test
database/     Schema, migrations, hướng dẫn seed và thư mục backup riêng
monitoring/   Tiến trình giám sát độc lập
gateway/      Cấu hình Nginx
docker/       Compose ứng dụng và mẫu Standby lab
scripts/      Khởi tạo DB/tài khoản, health, backup/restore, đóng gói
docs/         Tài liệu kỹ thuật và runbook
```

| Lệnh tại thư mục gốc | Tác dụng |
|---|---|
| npm ci | Cài toàn bộ dependency theo lockfile |
| npm run db:init | Khởi tạo schema mới/rỗng, cần CONFIRM_EMPTY_DATABASE |
| npm run user:create | Tạo tài khoản website, cần NEW_USERNAME/NEW_PASSWORD/NEW_ROLE |
| npm run dev -w backend | Chạy riêng BE, cổng 5000 |
| npm run dev -w frontend | Chạy riêng FE, cổng 5173 |
| npm start -w monitoring | Chạy riêng Monitor, cổng 5001 |
| npm run dev | Chạy cả ba tiến trình |
| npm run build | Build FE |
| npm test | Chạy test mặc định |

## 14. Chạy riêng Backend trong Docker

Cách này dành cho **Docker Desktop trên macOS/Windows**, sử dụng MySQL hiện có đã publish cổng 3306 trên máy, còn FE vẫn chạy bằng Vite. Với Linux Docker Engine cần kiểm tra thêm host gateway/network phù hợp; không mặc định host.docker.internal có sẵn.

Chuẩn bị database, tài khoản website và `backend/.env` theo các bước trên. Compose đọc secret từ tệp này lúc chạy, không đưa tệp vào image. DB_HOST trong container được ghi đè thành `host.docker.internal` để kết nối tới MySQL trên máy chủ. Tệp .env dùng để chạy BE trực tiếp vẫn giữ DB_HOST=127.0.0.1.

**1. Giữ MySQL đang chạy.** BE Docker publish cổng **5002** trên máy, còn bên trong container vẫn dùng 5000. Cách này tránh xung đột với BE Node hoặc Control Center/AirPlay trên macOS đang dùng cổng 5000. Nếu không cần BE Node cũ, có thể dừng bằng Control + C ở Terminal của tiến trình đó.

**2. Tại thư mục gốc dự án, kiểm tra cấu hình và build/chạy BE:**

```bash
docker compose -f docker/compose.backend.yml config --quiet
docker compose -f docker/compose.backend.yml up -d --build
```

Lần đầu cần tải image Node 24 và cài dependency, nên có thể mất vài phút. Không cần tạo lại database hoặc tài khoản. Compose này chỉ tạo BE và volume backup riêng, không tạo hoặc thay đổi container MySQL.

**3. Kiểm tra trạng thái và log:**

```bash
docker compose -f docker/compose.backend.yml ps
docker compose -f docker/compose.backend.yml logs --tail=50 backend
```

Mở [readiness của BE](http://127.0.0.1:5002/health/ready), chờ status Healthy và database Healthy. Nếu báo lỗi, kiểm tra Docker Desktop, container MySQL, cổng publish và quyền kết nối của tài khoản MySQL từ mạng Docker. Không đổi volume hoặc reset MySQL để xử lý lỗi mạng.

**4. Cấu hình FE gọi BE Docker:**

Tạo hoặc sửa `frontend/.env` và đặt:

```dotenv
API_PROXY_TARGET=http://127.0.0.1:5002
```

Biến này chỉ cấu hình proxy của Vite khi phát triển. Giữ VITE_API_BASE rỗng để request đi qua proxy cùng origin. Nếu dùng Monitoring, đặt PRIMARY_URL=http://127.0.0.1:5002 trong monitoring/.env và khởi động lại Monitor.

Khởi động lại FE tại Terminal riêng:

```bash
npm run dev -w frontend
```

Mở [website](http://127.0.0.1:5173) và đăng nhập như trước. Vite proxy gọi BE Docker qua cổng 5002. Muốn quay lại BE chạy bằng npm, đổi API_PROXY_TARGET về http://127.0.0.1:5000 và khởi động lại FE.

**Các lệnh thường dùng:**

```bash
# Dừng BE trong Docker; không dừng MySQL
 docker compose -f docker/compose.backend.yml stop backend

# Chạy lại BE đã build
 docker compose -f docker/compose.backend.yml up -d

# Nạp lại backend/.env sau khi thay đổi
 docker compose -f docker/compose.backend.yml up -d --force-recreate backend

# Build lại sau khi sửa mã nguồn BE hoặc dependency
 docker compose -f docker/compose.backend.yml up -d --build
```

Image chứa bản sao mã nguồn tại thời điểm build; không tự cập nhật khi sửa file trên máy. Nếu đổi cổng/host MySQL, kiểm tra `DB_PORT` trong backend/.env và `DB_HOST` được override trong compose trước khi tạo lại BE.

Cấu hình này dùng NODE_ENV=development để thử trên HTTP localhost, cổng BE chỉ mở trên 127.0.0.1. Đây là chạy container **tại máy**, chưa phải push image lên Docker Hub hoặc triển khai server public. Triển khai public cần cấu hình production, HTTPS và quản lý secret riêng.

### Docker toàn bộ ứng dụng và triển khai nâng cao

Hướng dẫn chạy trực tiếp Node ở trên là cách bắt đầu. Nếu muốn đóng gói ứng dụng bằng Docker, xem [macOS/Docker](docs/deployment-macos.md), [Windows/WSL2](docs/deployment-windows.md), [kiến trúc](docs/architecture.md), [thiết kế DB](docs/database-design.md) và [API](docs/api-documentation.md).

`docker/compose.app.yml` tạo hai Backend dùng chung MySQL hiện có, Monitor và Gateway; **không tạo MySQL Primary**. Cấu hình `.env` gốc dành cho Compose khác `backend/.env` dành cho Node chạy trực tiếp. Cần cấu hình riêng trước khi dùng Compose. Gateway mẫu dùng HTTP cho lab; môi trường public cần HTTPS và kiểm tra cấu hình cookie Secure/CORS.

Hai Backend dùng chung MySQL chỉ dự phòng tiến trình, không bảo vệ khỏi mất máy chứa MySQL. `docker/compose.standby.yml` là mẫu lab opt-in, không tự thiết lập replication hoặc chuyển quyền ghi.

## 15. Trước khi đưa code lên Git

Chỉ đưa mã nguồn, lockfile, `.env.example`, cấu hình mẫu và tài liệu lên repository. `.gitignore` đã loại:

- node_modules, dist và log.
- `.env` và các tệp `.env.*`, bao gồm secret khôi phục; giữ lại `.env.example`.
- Database backup thật, log Monitoring và ZIP.

Git không tự bỏ theo dõi tệp đã commit trước khi thêm .gitignore. Kiểm tra `git status` và danh sách file được stage trước khi push; nếu secret từng được commit, cần thu hồi/đổi secret và xử lý lịch sử Git. Không commit volume hoặc dữ liệu khách hàng.

Để đóng gói source thành ZIP, dùng Python 3:

```bash
python3 scripts/package.py
```

Trên Windows có thể dùng `py scripts/package.py`. Script bỏ dependency, secret, log, backup thật, build output và Git; ZIP xuất ở thư mục cha của dự án. Người nhận giải nén rồi bắt đầu lại từ bước 1.
