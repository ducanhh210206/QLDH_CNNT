# OMDRS — Quản lý đơn hàng & phục hồi sự cố

Website quản lý đơn hàng với **React 19 + Vite 8**, **Node.js + Express 5**, **MySQL 8.4** và dịch vụ giám sát độc lập.

Chức năng chính: đăng nhập Nhân viên/Quản lý, tự đăng ký nhân viên hoặc được quản lý cấp tài khoản, phê duyệt tài khoản và cấp quyền, đăng nhập Google khi đã cấu hình OAuth, danh mục sản phẩm, đơn hàng, thống kê, lịch sử giao dịch, giám sát và backup/restore cách ly.

> Hướng dẫn này dành cho người tải mã nguồn về máy mới. Repository không chứa tài khoản, mật khẩu, database hay dữ liệu trên máy tác giả. Người chạy phải tự cấu hình môi trường và tạo tài khoản website.

## Bắt đầu từ đâu?

| Trường hợp | Các bước cần làm |
|---|---|
| Clone/giải nén lần đầu, chưa có database | Bước 1–6: cài phần mềm, `npm ci`, tạo MySQL, cấu hình `.env`, khởi tạo schema và tạo Quản lý đầu tiên; sau đó bước 7 hoặc 14 |
| Đã cài bản cũ, vừa pull code mới | Bước 16: cập nhật thư viện, nâng cấp schema bằng `db:migrate` trước khi chạy BE mới; giữ database và tài khoản cũ |
| Chỉ mở lại dự án đã thiết lập xong | Khởi động MySQL, BE và FE; xem “Những lần chạy tiếp theo” ở bước 7 hoặc 14 |

Mọi lệnh `npm` và `docker compose` bên dưới chạy trong **thư mục chứa `package.json`**. Nếu clone bằng lệnh trong README, thư mục đó là `omdrs/`. Trên máy tác giả, nó là `WEb_QLDH/order-management-system/`; người tải về không cần tạo lại đường dẫn cá nhân này.

## Cập nhật phân quyền và đăng nhập Google

Bản mới có **Nhân viên / Quản lý** (giữ giá trị API Staff/Admin). Nhân viên tự đăng ký phải chờ quản lý duyệt; Google lần đầu cũng chờ duyệt. Quản lý chọn quyền chức năng và có quyền sao lưu/phục hồi.

**Máy đã có database từ bản cũ:** dùng `npm run db:migrate` với quyền provisioning phù hợp, sau đó build lại BE; không chạy lại db:init. Runner tạo safety snapshot trước khi bổ sung schema. Xem [hướng dẫn phân quyền, migration và Google OAuth](docs/auth-permissions.md).

**Máy cài mới:** làm theo các bước bên dưới; db:init tạo cả schema 001 và 002. Client ID/Secret Google không nằm trong Git: tự cấu hình để bật nút đăng nhập Google.

## Chọn cách chạy trước khi cài

| Cách chạy | MySQL | Backend | Frontend | Nơi xem BE |
|---|---|---|---|---|
| A — Node trực tiếp | Docker hoặc MySQL có sẵn | npm, mặc định cổng 5000 | Vite cổng 5173 | http://127.0.0.1:5000/health/ready |
| B — Backend Docker | MySQL có sẵn, có thể là container riêng | Compose, cổng máy 5002 → cổng container 5000 | Vite cổng 5173 | http://127.0.0.1:5002/health/ready |

Lần đầu làm chung bước **1–6** để chuẩn bị MySQL, cấu hình và tài khoản. Sau đó chọn **bước 7** cho cách A hoặc **bước 14** cho cách B. Chưa cần chạy Gateway, Standby hoặc toàn bộ Compose nâng cao để sử dụng đơn hàng.

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

Tải Node.js từ [trang Node.js chính thức](https://nodejs.org/en/download), Git từ [git-scm.com](https://git-scm.com/downloads) và Docker Desktop từ [hướng dẫn cài đặt Docker](https://docs.docker.com/desktop/setup/install/). Docker chỉ bắt buộc khi bạn chọn chạy MySQL hoặc BE trong container. Nếu dùng MySQL đã có trên server và chạy BE bằng Node, có thể bỏ qua kiểm tra Docker.

Khi dùng Docker, `docker version` phải hiển thị được phần Server. Nếu báo không kết nối được daemon, mở Docker Desktop và chờ Engine sẵn sàng.

## 2. Tải mã nguồn và cài thư viện

Clone repository của dự án:

```bash
git clone https://github.com/ducanhh210206/QLDH_CNNT.git omdrs
cd omdrs
```

Repository hiện đặt `package.json` ngay ở thư mục gốc; **không chạy thêm `cd order-management-system` sau khi clone theo lệnh trên**. Tên thư mục `omdrs` do lệnh clone đặt, không cần giống tên thư mục trên máy tác giả.

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
- Nếu đã có các bảng OMDRS từ lần chạy trước: giữ nguyên, bỏ qua bước khởi tạo và dùng tài khoản website đã tạo. Nếu vừa cập nhật từ bản cũ, làm migration ở bước 16 trước khi chạy BE mới.
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

Không dùng các chuỗi mẫu làm mật khẩu. Có thể sinh từng mật khẩu bằng `node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"` để tránh ký tự đặc biệt gây nhầm giữa Docker env-file và dotenv. Trong `.env.mysql.local` dùng giá trị trực tiếp, không thêm dấu nháy bao quanh; Docker `run --env-file` không đọc giống hệt dotenv. Tệp này đã được loại khỏi Git bằng `.gitignore`.

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

**Sau mỗi lần sửa `backend/.env`:** BE chạy Node cần dừng bằng Control + C rồi chạy lại; BE Docker cần `docker compose -f docker/compose.backend.yml up -d --force-recreate backend`. Không chỉ tải lại trang web.

### Chọn cổng Backend mà FE gọi tới

Trên bản clone mới, FE mặc định proxy `/api` và `/health` tới BE Node ở cổng **5000**. Bạn có thể tạo `frontend/.env` từ `frontend/.env.example` hoặc tự tạo bằng trình soạn thảo:

```dotenv
VITE_API_BASE=
API_PROXY_TARGET=http://127.0.0.1:5000
```

- BE chạy bằng Node: dùng cổng 5000, hoặc cổng thực tế đã đặt trong backend/.env.
- BE Docker theo bước 14: đổi API_PROXY_TARGET thành **http://127.0.0.1:5002**.
- Giữ VITE_API_BASE rỗng khi dùng Vite proxy. API_PROXY_TARGET là cấu hình của máy chủ Vite, không phải secret và không phải URL API được nhúng vào bản build.

Khởi động lại FE sau khi sửa tệp này. Tệp .env đã tồn tại từ lần chạy trước có thể vẫn trỏ tới BE Docker; phải chọn lại đúng chế độ đang dùng.

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
Schema 001 và 002 đã được áp dụng.
```

Script tạo database nếu chưa có, tạo các bảng từ `database/init/schema.sql` và ghi phiên bản migration 001 và 002. Script từ chối nếu database đã có bất kỳ bảng nào. **Không xóa bảng để chạy lại.** Nếu khởi tạo bị gián đoạn, kiểm tra các bảng đã tạo trước khi sửa tiếp vì DDL MySQL không rollback toàn bộ.

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
Đã tạo tài khoản đã duyệt admin (Admin).
```

CLI này tạo tài khoản đã duyệt cho người quản trị máy chủ; các nhân viên tự đăng ký trên web sẽ phải chờ quản lý duyệt. Chỉ tạo một lần. Nếu báo `ER_DUP_ENTRY` / `Duplicate entry` cho username admin, tài khoản đã tồn tại; dùng tài khoản đó để đăng nhập, không khởi tạo lại database. Muốn tạo nhân viên, đổi username và NEW_ROLE thành Staff.

### Quản lý cấp tài khoản nhân viên trực tiếp

1. Đăng nhập Quản lý → **Nhân viên & phê duyệt** → **Cấp tài khoản nhân viên**.
2. Nhập họ tên, email, tên đăng nhập, mật khẩu ban đầu (12–256 ký tự) và xác nhận mật khẩu.
3. Chọn các quyền nghiệp vụ rồi bấm **Tạo & cấp quyền**. Tài khoản luôn có vai trò Nhân viên, trạng thái Active và được sử dụng ngay; không cần xét duyệt lần nữa.
4. Trang mặc định hiển thị **Tài khoản đã cấp**, gồm họ tên/username, email, phương thức đăng nhập, vai trò, trạng thái, quyền, ngày tạo/cập nhật quyền và ghi chú. Bấm số quyền để mở danh sách; chọn bộ lọc **Chờ duyệt** để xem đăng ký mới. Tài khoản xuất hiện trong bộ lọc **Đã cấp / Đang hoạt động**. Quản lý tự bàn giao tên đăng nhập/mật khẩu qua kênh riêng; hệ thống không tự gửi email và không lưu mật khẩu dạng rõ.

Nếu tên đăng nhập/email đã tồn tại, hệ thống báo lỗi và không ghi đè tài khoản. Lịch sử cấp tài khoản ghi nhận quản lý thực hiện và quyền được cấp. Chức năng này dùng schema 002 hiện có, không cần migration mới.

### Thử đăng ký và phê duyệt nhân viên

Sau khi chạy BE/FE theo bước 7 hoặc 14:

1. Tại trang đăng nhập, chọn **Đăng ký nhân viên**, nhập họ tên, email, username và mật khẩu ít nhất 12 ký tự. Tài khoản mới ở trạng thái **Chờ duyệt**, chưa đăng nhập được.
2. Đăng nhập bằng tài khoản Quản lý đã tạo ở bước 6 → **Nhân viên & phê duyệt** → **Xét duyệt**.
3. Chọn vai trò **Nhân viên**, trạng thái **Duyệt / Cho phép sử dụng**, đánh dấu các quyền cần cấp rồi **Lưu & cấp quyền**.
4. Đăng xuất Quản lý và đăng nhập lại bằng tài khoản nhân viên. Nhân viên chỉ thấy chức năng được cấp; sao lưu/phục hồi và quản lý người dùng dành cho Quản lý.

**Không bắt buộc cấu hình Google để chạy website:** đăng nhập bằng username/mật khẩu vẫn hoạt động. Muốn bật Google/Gmail, tự tạo OAuth client rồi điền `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` và `FRONTEND_URL` trong `backend/.env`. Callback mặc định là `http://127.0.0.1:5173/api/auth/google/callback`, phải khai báo đúng trong Google Console. Xem [hướng dẫn Google OAuth](docs/auth-permissions.md#thiết-lập-google--gmail). Không đưa Client Secret vào FE hoặc Git. Tài khoản Google mới cũng phải chờ quản lý duyệt.

### Bật đăng nhập Google / Gmail — tùy chọn

Chỉ cần phần này nếu muốn dùng nút **Tiếp tục với Google / Gmail**. Người clone code vẫn chạy được bằng tài khoản mật khẩu khi để trống cấu hình Google; không dùng credential của máy tác giả.

1. Vào [Google Auth Platform](https://console.cloud.google.com/auth/overview), tạo/chọn project. Hoàn tất **Get started / Những bước đầu tiên**, điền tên ứng dụng, email hỗ trợ/liên hệ và chọn **External / Bên ngoài** cho người dùng Gmail cá nhân. Trong **Audience / Khán giả**, thêm Gmail thử nghiệm vào Test users nếu ứng dụng ở chế độ Testing.
2. Vào **Clients / Khách hàng → Create client / Tạo khách hàng**, chọn **Web application / Ứng dụng web**. Thêm Authorized redirect URI đúng từng ký tự: `http://127.0.0.1:5173/api/auth/google/callback`. Callback đi qua FE, không đổi thành cổng BE 5000/5002 khi dùng cấu hình Vite này.
3. Sao chép Client ID đầy đủ (thường kết thúc bằng `.apps.googleusercontent.com`) và Client Secret. Google chỉ hiển thị/tải secret đầy đủ khi tạo: lưu ngay. Nếu đã tải JSON, lấy trường `client_id` và `client_secret`. Nếu chưa lưu secret, vào chi tiết client → **Client secrets → Add secret** nếu có; không dùng chuỗi bị che hoặc phần ID rút gọn có dấu `…`. Xem [quản lý OAuth client của Google](https://support.google.com/cloud/answer/15549257?hl=en).
4. Thêm/sửa trong `backend/.env` (mỗi khóa chỉ một dòng), giữ nguyên MySQL/JWT:

   ```dotenv
   GOOGLE_CLIENT_ID=THAY_BANG_CLIENT_ID_THAT
   GOOGLE_CLIENT_SECRET=THAY_BANG_CLIENT_SECRET_THAT
   GOOGLE_REDIRECT_URI=http://127.0.0.1:5173/api/auth/google/callback
   FRONTEND_URL=http://127.0.0.1:5173
   ```

   **Phải thay hai chữ mẫu đầu bằng giá trị Google cấp**, không dán nguyên ví dụ. Giữ CORS_ORIGINS có `http://127.0.0.1:5173`. Không đưa secret vào `frontend/.env`, biến VITE_*, Git hoặc ảnh/chát hỗ trợ.
5. BE Node: dừng/chạy lại. BE Docker đã build mã mới: chạy từ thư mục gốc:

   ```bash
   docker compose -f docker/compose.backend.yml up -d --force-recreate backend
   ```

6. Khi FE/BE đang chạy, mở [trạng thái Google qua FE](http://127.0.0.1:5173/api/auth/providers). Mong đợi `{"google":{"enabled":true}}`. Kết quả này chỉ cho biết cấu hình đã bật, chưa chứng minh secret hợp lệ hoặc đăng nhập với Google thành công.
7. Dùng Chrome/Safari thông thường, mở `http://127.0.0.1:5173`, tải lại trang, đăng xuất nếu cần rồi bấm Google. Tài khoản Google mới vẫn phải được quản lý duyệt; sau khi duyệt, đăng nhập Google lại.

Nếu email đã có tài khoản mật khẩu (kể cả do Quản lý cấp), hệ thống chưa cho tự liên kết Google theo email: dùng mật khẩu đã có. Muốn thử luồng Google mới, dùng email chưa đăng ký trong website. Chi tiết bảo mật và cấu hình Gateway/production: [hướng dẫn Google](docs/auth-permissions.md#thiết-lập-google--gmail).

## 7. Cách A — Chạy BE bằng Node và FE bằng Vite

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
6. Mở **Thống kê** để xem tổng quan. Doanh thu chỉ cộng các đơn Hoàn tất.

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

Nếu chọn **cách A (BE Node)** và đã cấu hình xong, có thể dùng **một Terminal** để chạy cả BE, FE và Monitoring:

```bash
npm run dev
```

Dừng các tiến trình đang chạy riêng trước khi dùng lệnh tổng hợp, tránh trùng cổng. Control + C sẽ dừng cả ba tiến trình. Lệnh này luôn tạo thêm BE Node; **không dùng thay cho bước khởi động BE Docker ở cách B**.

## 10. Backup, restore và mô phỏng

- Admin tạo backup SQL trên trang **Backup & Restore**. Khi BE chạy bằng Node, file SQL và manifest nằm trong `database/backups/` trên máy.
- Khi BE chạy trong Docker, đường dẫn `/app/database/backups` được gắn vào named volume: `omdrs-backend-local_backend_backups` với Compose BE riêng, hoặc `omdrs_app_backups` với Compose toàn ứng dụng. File không tự xuất hiện trong thư mục backup của source trên máy. Không xóa volume để dọn container; cần chủ động sao chép backup ra nơi lưu trữ độc lập.
- Mỗi backup có checksum. Source Git không chứa backup thật hoặc dữ liệu đang chạy trong MySQL; clone/pull không mang theo dữ liệu của máy tác giả.
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

Test dùng thông tin kết nối DB từ backend/.env hoặc biến môi trường, tạo schema ngẫu nhiên `omdrs_test_<uuid>` và database restore, giữ lại để kiểm tra, không tự DROP dữ liệu. Khi không chạy integration test, bỏ biến RUN_DB_INTEGRATION khỏi môi trường; không đặt bằng 0 vì mã hiện tại kiểm tra sự tồn tại của giá trị. Không mở rộng quyền tài khoản production chỉ để chạy test; dùng môi trường thử nghiệm riêng.

[Thông tin kiểm thử khi xây dựng](docs/testing-report.md) là báo cáo theo thời điểm, không phải bảo đảm mọi máy tải về đã được cấu hình hoặc kiểm thử.

## 12. Lỗi thường gặp

| Triệu chứng | Cách xử lý |
|---|---|
| npm ENOENT / không tìm thấy package.json | Terminal đang ở sai thư mục. Vào thư mục chứa package.json trước khi chạy npm: `cd omdrs` nếu clone theo bước 2; trên máy tác giả dùng `cd /Users/haanh/Desktop/WEb_QLDH/order-management-system` |
| Docker không kết nối daemon | Mở Docker Desktop, chờ Engine running, kiểm tra lại docker version |
| ERROR 1045 / Access denied | Kiểm tra đúng tài khoản/mật khẩu MySQL; mật khẩu trong cấu hình khởi tạo cũ có thể đã thay đổi. Không xóa volume để sửa lỗi |
| ECONNREFUSED / readiness 503 | Kiểm tra container, cổng publish, DB_HOST/DB_PORT và schema; khởi động lại BE sau khi sửa .env |
| auth_configured: false | JWT_SECRET chưa đủ 32 ký tự hoặc BE chưa nạp .env mới; điền secret rồi khởi động lại |
| Database có bảng, script từ chối | Nếu đã cài OMDRS thì bỏ qua db:init. Nếu dữ liệu không rõ nguồn thì dừng để kiểm tra, không xóa bảng |
| Duplicate entry khi tạo admin | Tài khoản đã có; bỏ qua user:create và dùng mật khẩu website đã đặt |
| Đăng nhập không đúng | Dùng mật khẩu website ở bước 6, không dùng mật khẩu root/MySQL |
| Đăng nhập báo đang chờ duyệt | Quản lý phải vào Nhân viên & phê duyệt, duyệt và cấp quyền; người dùng mới đăng nhập lại sau khi được duyệt |
| API báo 403 hoặc nhân viên không thấy chức năng | Kiểm tra quyền được quản lý cấp và trạng thái tài khoản; nhân viên không có quyền sao lưu/quản lý người dùng |
| Nút Google/Gmail bị tắt | Chưa cấu hình OAuth hoặc origin/callback không khớp; xem docs/auth-permissions.md, vẫn có thể dùng username/mật khẩu |
| Google báo redirect_uri_mismatch | Callback trong Google Console phải trùng GOOGLE_REDIRECT_URI, gồm host, cổng, đường dẫn; dùng nhất quán 127.0.0.1 hoặc localhost |
| Google báo invalid_client / lỗi xác thực | Kiểm tra Client ID đầy đủ và Client Secret cùng một OAuth client; thay chữ mẫu bằng giá trị thật rồi nạp lại BE, không gửi secret cho người hỗ trợ |
| Google báo access_denied / tài khoản không được phép | Kiểm tra Audience và Test users nếu app ở chế độ Testing; dùng Gmail đã được cho phép |
| Google báo disallowed_useragent trong trình duyệt nhúng | Mở website bằng Chrome/Safari thông thường rồi thử lại |
| Google báo email đã có tài khoản mật khẩu | Dùng mật khẩu của tài khoản đó; hiện chưa có chức năng liên kết Google vào tài khoản đã tồn tại |

| db:migrate báo thiếu quyền ALTER/CREATE | Nhờ người quản trị chạy migration bằng tài khoản provisioning đúng schema; không xóa database hoặc cấp quyền toàn server cho tài khoản runtime |
| API báo 401 | Đăng nhập lại; phiên có thời hạn 8 giờ. Dùng cùng địa chỉ FE nhất quán, không đổi qua lại localhost và 127.0.0.1 |
| EADDRINUSE / port already in use | Kiểm tra Terminal đã chạy dịch vụ chưa; không mở thêm bản trùng. Trên macOS, cổng 5000 có thể bị Control Center/AirPlay sử dụng: xem hướng dẫn đổi cổng dưới bảng; không dừng tiến trình hệ thống |
| unable to get image ... Cannot connect to the Docker daemon | Lỗi Engine chưa sẵn sàng, không đồng nghĩa thiếu image. Mở Docker Desktop, chờ Engine running rồi chạy lại docker compose up |
| FE chạy nhưng gọi API lỗi | Kiểm tra API_PROXY_TARGET trong frontend/.env: BE Node thường dùng 5000, BE Docker dùng 5002. Khởi động lại FE và kiểm tra readiness đúng cổng |
| Monitoring Unknown | Chạy process Monitoring, kiểm tra MONITOR_URL và cùng MONITOR_TOKEN ở hai tệp, khởi động lại BE/Monitor |
| Restore bị từ chối quyền | Tài khoản DB chưa được cấp quyền cho database cách ly; nhờ người quản trị cấp đúng phạm vi |
| Lệnh read -s không chạy trên Windows | Dùng khối PowerShell ở bước 6 hoặc mở WSL2/Bash |

### Khi cổng 5000 trên macOS bị chiếm

Có thể chuyển sang cách B (BE Docker cổng 5002), hoặc giữ cách A và đổi cổng BE Node sang 5003:

| Tệp | Giá trị cần sửa cho ví dụ BE Node cổng 5003 |
|---|---|
| backend/.env | PORT=5003 |
| frontend/.env | API_PROXY_TARGET=http://127.0.0.1:5003, giữ VITE_API_BASE rỗng |
| monitoring/.env, nếu có dùng | PRIMARY_URL=http://127.0.0.1:5003 |

Khởi động lại các dịch vụ và kiểm tra http://127.0.0.1:5003/health/ready. Không cần sửa source vite.config.js. Đây là đổi cổng của **BE Node**; BE Docker ở bước 14 vẫn dùng cổng 5002 trên máy và 5000 trong container, không đổi PORT bên trong container tùy ý vì healthcheck cũng dùng 5000.

Nếu đổi cổng FE, cập nhật CORS_ORIGINS theo địa chỉ FE thực tế. Không đưa secret vào biến VITE_*.

Nếu PowerShell báo chặn `npm.ps1`, dùng `npm.cmd` thay cho `npm` trong các lệnh, hoặc dùng Terminal WSL2/Bash; không cần tắt bảo vệ hệ thống để chạy dự án.

## 13. Cấu trúc mã nguồn

Xem [công dụng từng file trong dự án](docs/file-guide.md) để lần theo giao diện, API, SQL, Docker và script vận hành.

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
| npm run db:migrate | Bổ sung schema 002 vào database cũ, có safety snapshot; cần quyền ALTER phù hợp |
| npm run user:create | Tạo tài khoản website, cần NEW_USERNAME/NEW_PASSWORD/NEW_ROLE |
| npm run dev -w backend | Chạy riêng BE, cổng 5000 |
| npm run dev -w frontend | Chạy riêng FE, cổng 5173 |
| npm start -w monitoring | Chạy riêng Monitor, cổng 5001 |
| npm run dev | Chạy cả ba tiến trình |
| npm run build | Build FE |
| npm test | Chạy test mặc định |

## 14. Cách B — Chạy BE Docker, FE bằng Vite

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

### Những lần chạy tiếp theo với BE Docker

1. Mở Docker Desktop, chờ Engine running; khởi động container MySQL hiện có nếu đang dừng.
2. Chạy `docker compose -f docker/compose.backend.yml up -d`.
3. Kiểm tra readiness ở cổng 5002.
4. Đảm bảo frontend/.env trỏ tới cổng 5002, chạy `npm run dev -w frontend` và mở website.

Không cần build lại khi chỉ tắt/mở Docker. Nếu sửa backend/.env, dùng `up -d --force-recreate backend`; `docker compose restart` không nạp lại biến môi trường mới. Không tạo lại schema/tài khoản đã tồn tại.

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

## 16. Cập nhật code ở máy đã cài

### 16.1. Pull code và cài lại dependency

Vào thư mục gốc repository, kiểm tra thay đổi trước:

```bash
git status
```

Nếu có thay đổi local, lưu hoặc commit trước; không dùng reset/xóa tệp để ép cập nhật. Sau đó:

```bash
git pull --ff-only
npm ci
```

Giữ nguyên các tệp `.env` riêng của máy và dữ liệu MySQL. Đối chiếu `.env.example` để bổ sung biến cấu hình mới nếu có; không chép đè secret đang dùng bằng mẫu.

### 16.2. Nâng cấp database bản cũ lên schema 002

**Thực hiện trước khi chạy BE mới.** Nếu cài mới bằng schema hiện tại hoặc đã chạy migration thành công, bỏ qua bước này. Không chạy lại `db:init` trên database đang có dữ liệu.

1. Giữ MySQL đang chạy. Dừng các BE đang dùng database này để tạm dừng ghi dữ liệu. BE Node: Control + C tại Terminal của BE. BE Docker theo cách B:

   ```bash
   docker compose -f docker/compose.backend.yml stop backend
   ```

   Nếu dùng cấu hình nhiều BE/backup theo lịch, dừng tất cả tiến trình ghi và job tương ứng trong thời gian nâng cấp.
2. Kiểm tra `backend/.env`: lệnh migration chạy bằng Node **trên máy**, nên MySQL Docker trên cùng máy dùng `DB_HOST=127.0.0.1` và cổng publish thực tế, thường 3306. Compose sẽ tự ghi đè host khi BE chạy trong container.
3. Tài khoản chạy migration cần SELECT/INSERT/CREATE/ALTER/INDEX/REFERENCES trên schema ứng dụng. Nếu tài khoản runtime chỉ có quyền đọc/ghi, nhờ người quản trị dùng credential provisioning tạm thời cho lệnh này; không đổi tài khoản runtime sang root. Xem [chi tiết migration](docs/auth-permissions.md#cập-nhật-database-đang-có-dữ-liệu).
4. Từ thư mục gốc, chạy khi đã có đúng quyền:

   ```bash
   npm run db:migrate
   ```

   Runner lưu snapshot SQL + SHA-256 trong `database/backups/` trên máy trước khi sửa cấu trúc. Bảo vệ và sao chép bản này ra nơi lưu trữ riêng. Khi thành công sẽ có `Migration 002 hoàn tất...`; nếu đã nâng cấp sẽ có `Schema 002 đã được áp dụng.`. Nếu lỗi, xử lý quyền/kết nối trước khi tiếp tục; không xóa bảng hoặc volume.

Tài khoản và đơn hàng cũ được giữ lại. Tài khoản cũ vẫn Active; nhân viên đăng ký mới phải chờ duyệt. Migration chỉ dùng cho máy đã có schema 001; máy mới thực hiện bước 5–6.

### 16.3. Chạy lại ứng dụng sau cập nhật

**Cách A — Node:** tại các Terminal riêng, chạy lại `npm run dev -w backend` và `npm run dev -w frontend`. Khởi động lại Monitoring nếu đang sử dụng. FE phải trỏ tới cổng BE Node thực tế.

**Cách B — BE Docker:** build lại để image chứa code vừa pull, rồi chạy FE:

```bash
docker compose -f docker/compose.backend.yml up -d --build
npm run dev -w frontend
```

Giữ Terminal FE mở và đảm bảo `frontend/.env` có `API_PROXY_TARGET=http://127.0.0.1:5002`. Chỉ chạy `docker compose restart` sẽ không đưa code mới trên máy vào image.

Kiểm tra `/health/ready` trên cổng BE tương ứng (5000 cho Node mặc định, 5002 cho Docker), cần `status: Healthy` và `database: Healthy`. Mở http://127.0.0.1:5173, đăng nhập Quản lý để thử **Nhân viên & phê duyệt**. Google là tùy chọn; không có OAuth client vẫn chạy được bằng username/mật khẩu.

## 17. Phạm vi đã xác minh và tài liệu tham khảo

Đợt cập nhật **30/10/2026**: **33/33 kiểm thử đạt**, gồm kiểm thử Quản lý cấp tài khoản Staff/Active dùng ngay, chặn cấp trái quyền, tên/email trùng và backup/restore trên MySQL cách ly. Build FE thành công; danh sách mặc định hiển thị tài khoản đã cấp và quyền tương ứng. Trên máy phát triển đã nạp cấu hình OAuth riêng, kiểm tra readiness HTTP 200 và `/api/auth/providers` trả `google.enabled=true`. **Chưa xác nhận đăng nhập Google thật hoàn tất**. Credential riêng không đi theo Git; người clone tự cấu hình. Không coi cờ enabled là bằng chứng OAuth thành công.

Đợt cập nhật **29/10/2026**: **31/31 kiểm thử đạt**, gồm MySQL tích hợp và migration 001 → 002 trên container cách ly; build FE thành công, BE Docker kết nối database Healthy. Đã thử giao diện đăng ký → duyệt/cấp quyền → nhân viên đăng nhập và thêm sản phẩm bằng dữ liệu thử riêng. Chưa thử đăng nhập Google bằng OAuth client thật; cần cấu hình của người triển khai. Xem [báo cáo kiểm thử cập nhật](docs/testing-report.md).

Đợt rà soát **27/10/2026**: sao chép các tệp source được Git theo dõi sang thư mục sạch, không mang theo .env thật, backup hoặc node_modules. `npm ci --offline` cài thành công từ cache npm; `npm run build` thành công; `npm test` có **16 đạt, 0 lỗi, 1 integration test được bỏ qua**. Cấu hình Compose BE qua kiểm tra cú pháp. Đây là kiểm tra khả năng cài từ lockfile với cache trên macOS, chưa phải thử đầy đủ tải dependency qua mạng hoặc khởi tạo MySQL mới trên mọi hệ điều hành.

Luồng Node và BE Docker kết nối MySQL 8.4.13 đã chạy trên macOS trong quá trình xây dựng; build và các test mặc định đã chạy. Các khối lệnh PowerShell/Linux được viết theo từng shell nhưng chưa chạy thử toàn bộ trên máy Windows/Linux mới. Không coi nội dung README là chứng nhận production hoặc HA. Xem báo cáo kiểm thử để biết giới hạn từng thời điểm.

- [Docker Desktop: kết nối mạng và publish cổng](https://docs.docker.com/desktop/features/networking/).
- [Docker Desktop: container kết nối dịch vụ trên máy chủ](https://docs.docker.com/desktop/features/networking/how-tos/).
- [MySQL 8.4: cấu hình và dữ liệu khi chạy Docker](https://dev.mysql.com/doc/refman/8.4/en/docker-mysql-more-topics.html).
