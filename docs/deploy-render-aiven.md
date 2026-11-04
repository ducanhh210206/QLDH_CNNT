# Demo online: Render Free + Aiven MySQL Free

Mục tiêu: một URL HTTPS để người khác truy cập khi máy cá nhân đã tắt. Giao diện React build và Express chạy chung một Render Web Service; MySQL lưu bền trên Aiven. Đây là cấu hình demo một backend, không phải cấu hình HA/Primary–Standby trong Docker Compose.

## 0. Kiểm tra phiên bản mã nguồn

Nhánh GitHub chọn trên Render phải chứa `docker/Dockerfile.render` và phần hỗ trợ TLS/static hosting tương ứng. Nếu mới sửa trên máy, cần review/commit/push các file này trước khi bắt đầu bước 3. Không đẩy `.env`, CA/credential riêng hoặc dữ liệu thật. Hướng dẫn này không có nghĩa là dịch vụ cloud đã được tạo.

## 1. Tạo MySQL trên Aiven

1. Tạo tài khoản tại https://console.aiven.io/signup, chọn MySQL và chọn đúng gói **Free** ($0). Không nhầm với trial của gói trả phí.
2. Chờ dịch vụ Running. Trong Overview / Connection information, lấy **Host, Port, User, Password**, tải **CA certificate (ca.pem)** về máy. Port có thể khác 3306; dùng đúng port Aiven cấp.
3. Nếu giao diện có Databases, tạo database `order_management`; nếu chưa tạo, lệnh khởi tạo ở bước 2 có thể tạo khi tài khoản Aiven được phép CREATE DATABASE. Không dùng MySQL Docker trên Mac làm DB_HOST của Render.

Không gửi password hoặc file chứa credential vào chat/Git. Aiven Free hiện có 1 GB RAM, 1 GB disk, không cần thẻ và không có thời hạn cố định; dịch vụ không hoạt động có thể bị tạm dừng. Đây không phải cam kết luôn chạy liên tục.

## 2. Khởi tạo database cloud và Quản lý lần đầu

Chạy tại thư mục gốc repository, nơi có package.json. Database mới phải rỗng; phần này **không chuyển dữ liệu từ database trên Mac**. Máy mới cần Node 24 và `npm ci` trước.

Trên macOS/zsh:

```zsh
cp -n deploy/hosting.env.example backend/.env.hosting
```

Mở `backend/.env.hosting`, điền thông tin Aiven thật:

```dotenv
DB_HOST=HOST_AIVEN_CAP
DB_PORT=PORT_AIVEN_CAP
DB_NAME=order_management
DB_USER=USER_AIVEN_CAP
DB_PASSWORD="MAT_KHAU_AIVEN_CAP"
DB_SSL=true
DB_SSL_CA_FILE=/duong/dan/tuyet/doi/toi/ca.pem
```

Thay toàn bộ chữ mẫu. Đường dẫn chứng chỉ là đường dẫn thật trên máy bạn; giữ file này ngoài repository. Không đổi backend/.env dùng cho MySQL Docker. `--env-file` bên dưới nạp cấu hình cloud riêng; nếu Terminal đang export DB_* từ trước, mở Terminal mới hoặc bỏ các biến cũ vì biến shell được ưu tiên hơn env-file.

Sau khi xác nhận đúng database cloud mới/rỗng:

```zsh
CONFIRM_EMPTY_DATABASE=order_management node --env-file=backend/.env.hosting scripts/init-db.js
```

Mong đợi: `Schema 001, 002, 003, 004 và 005 đã được áp dụng.` Nếu có bảng, script sẽ từ chối; không xóa dữ liệu để chạy lại. Database cloud đã có bản cũ dùng migration phù hợp, không dùng init.

Tạo Quản lý website trên cloud (khác tài khoản MySQL):

```zsh
export NEW_USERNAME=admin
read -s 'NEW_PASSWORD?Nhập mật khẩu website (12–256 ký tự): '
export NEW_PASSWORD
NEW_ROLE=Admin node --env-file=backend/.env.hosting scripts/create-user.js
unset NEW_PASSWORD NEW_USERNAME
```

Chỉ chạy một lần. Không cần mở máy Mac sau khi khởi tạo để website cloud tiếp tục dùng database này. Lệnh này dành cho zsh; cách nhập mật khẩu Bash/PowerShell xem README, thay lệnh npm bằng lệnh node --env-file tương ứng.

## 3. Tạo Web Service trên Render

1. Tạo tài khoản tại https://dashboard.render.com/register, liên kết GitHub khi bạn đồng ý cấp quyền truy cập repository.
2. Chọn **New → Web Service**, chọn repository `ducanhh210206/QLDH_CNNT` (hoặc nhập public repository URL).
3. Chọn branch có cấu hình hosting này, thường `main`.
4. Cấu hình:

   | Mục | Giá trị |
   |---|---|
   | Name | Tên riêng, ví dụ qldh-demo |
   | Language / Runtime | Docker |
   | Root Directory | Để trống |
   | Dockerfile Path | `docker/Dockerfile.render` |
   | Docker Build Context | `.` nếu có ô này |
   | Instance Type | **Free**, kiểm tra $0 |
   | Health Check Path | `/health/ready` |

5. Trong **Environment**, thêm:

   | Biến | Giá trị |
   |---|---|
   | DB_HOST | Host Aiven |
   | DB_PORT | Port Aiven |
   | DB_NAME | order_management |
   | DB_USER | User Aiven |
   | DB_PASSWORD | Password Aiven, nhập trực tiếp vào Render |
   | DB_SSL | true |
   | DB_SSL_CA_FILE | /etc/secrets/ca.pem |
   | JWT_SECRET | Chuỗi ngẫu nhiên riêng tối thiểu 32 ký tự |
   | BACKUP_INTERVAL_HOURS | 0 |

   Sinh JWT riêng bằng `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`. Không dùng JWT/mật khẩu mẫu, không dán credential vào Dockerfile. Dockerfile đã đặt HOST=0.0.0.0, PORT=10000, NODE_ENV=production, SERVE_FRONTEND=true và TRUST_PROXY_HOPS=1 cho Render. Render có thể cấp PORT khác và ứng dụng sẽ đọc giá trị đó.
6. Trong **Secret Files**, tạo file tên **ca.pem**, dán nguyên nội dung chứng chỉ CA đã tải từ Aiven (gồm BEGIN/END CERTIFICATE). Đây là CA, không phải file private key hoặc Google JSON. DB_SSL_CA_FILE phải trùng `/etc/secrets/ca.pem`. Không đặt tên secret file là .env và không copy file credential vào build context.
7. Không điền CORS_ORIGINS, FRONTEND_URL hoặc GOOGLE_REDIRECT_URI bằng địa chỉ localhost của máy bạn. Khi bỏ trống, mã nhận URL HTTPS do Render cung cấp (`RENDER_EXTERNAL_URL`) và tự thiết lập CORS/callback cùng origin. Domain riêng sau này cần cấu hình các biến theo domain đó.
8. Bấm **Deploy Web Service** sau khi kiểm tra đúng gói Free. Không cần khai báo Build/Start Command riêng cho Docker. Chờ build và dịch vụ Live. URL thực tế do Render cấp có thể khác tên mong muốn.

Không dùng backend/Dockerfile hoặc frontend/Dockerfile cho hướng dẫn này: file đầu chỉ có API, file sau dùng gateway cho Compose nhiều backend. `docker/Dockerfile.render` là image gộp FE/BE cho một Web Service.

## 4. Kiểm tra website

- Mở `https://TEN-THUC-TE.onrender.com/health/ready`: cần Healthy, database Healthy.
- Mở trang chủ, đăng nhập admin bằng mật khẩu website đã tạo ở bước 2.
- Tạo sản phẩm/đơn, cấp tài khoản, thử đăng nhập nhân viên.
- Tắt website/Docker trên Mac rồi mở URL cloud từ máy khác để kiểm chứng không phụ thuộc máy cá nhân.

Nếu lỗi, chỉ chia sẻ mã lỗi hoặc log đã che credential. 403 khi đăng nhập thường cần kiểm tra CORS_ORIGINS có giá trị localhost cũ không. 503 readiness: kiểm tra schema 005, host/port/password/CA Aiven và JWT. Lỗi chứng chỉ: dùng đúng CA và hostname Aiven; không tắt kiểm tra TLS. Render có thể yêu cầu xác minh tài khoản tùy trường hợp; không chọn nâng cấp trả phí để ép triển khai.

## 5. Bật Google trên URL cloud

Sau khi có URL chính xác, tạo OAuth client Web application riêng cho bản demo cloud và thêm Authorized redirect URI:

```text
https://TEN-THUC-TE.onrender.com/api/auth/google/callback
```

Điền GOOGLE_CLIENT_ID và GOOGLE_CLIENT_SECRET của client cloud vào Render Environment, lưu/redeploy. Nếu không đặt GOOGLE_REDIRECT_URI/FRONTEND_URL, mã tự dùng URL Render. Client local trên Mac giữ riêng, không sửa secret local để deploy. Thêm Gmail thử vào Test users nếu consent screen đang Testing. Xem docs/auth-permissions.md để lấy và lưu Client Secret.

Kiểm tra `/api/auth/providers`: enabled=true chỉ cho biết cấu hình bật; cần thử đăng nhập thật. Gmail mới vẫn Pending, quản lý duyệt rồi đăng nhập lại. Tài khoản local cùng email chưa có chức năng liên kết Google.

## Giới hạn khi demo bằng gói Free

- Render Free ngủ sau 15 phút không có truy cập; mở lại có thể phải chờ. Phải tuân thủ quota Free, không có cam kết luôn sẵn sàng một tháng.
- File trên Render Free là tạm thời, mất khi redeploy/restart. Không coi bản SQL trong database/backups trên Render là backup bền vững; không bật backup theo lịch với cấu hình này. Cần xuất/sao lưu DB ra nơi riêng nếu muốn giữ bản backup lâu dài. Aiven lưu dữ liệu MySQL riêng, không mất theo filesystem Render.
- Restore cách ly của ứng dụng cần CREATE database/quyền phù hợp; chưa kiểm chứng quyền đó trên Aiven Free. Không hứa toàn bộ demo phục hồi/HA hoạt động như môi trường Docker lab.
- Monitoring độc lập/standby không chạy trong image này; các trang liên quan có thể hiển thị Unknown/Not Configured. Nút sự cố vẫn là mô phỏng, không tắt server thật.
- Database cloud là database riêng; dữ liệu/tài khoản local không tự đồng bộ. Nếu cần chuyển dữ liệu cũ, cần xuất/nhập có kiểm tra riêng; hướng dẫn này tạo demo mới/rỗng.

Tài liệu nhà cung cấp (kiểm tra ngày 02/11/2026):

- https://render.com/docs/web-services
- https://render.com/docs/docker
- https://render.com/docs/configure-environment-variables
- https://render.com/docs/environment-variables
- https://render.com/docs/free
- https://aiven.io/docs/products/mysql/concepts/mysql-free-tier
- https://aiven.io/docs/platform/concepts/tls-ssl-certificates

### Cập nhật bản có thông báo

Database Aiven đã có dữ liệu: chạy `node --env-file=backend/.env.hosting scripts/migrate-db.js` từ máy có file cấu hình riêng và CA hợp lệ trước khi triển khai BE mới. Không chạy lại init. Lệnh tạo snapshot bảo vệ trước DDL và bổ sung bảng `notification_reads`. Trên Render chọn **Manual Deploy → Deploy latest commit** nếu dịch vụ không tự triển khai sau khi push. Secret và chứng chỉ tiếp tục cấu hình trên Render, không đưa `.env.hosting` lên Git.

Bản tồn kho yêu cầu migration **004_product_stock** trước khi deploy BE mới. Sản phẩm hiện có khởi tạo tồn kho 0, người quản lý nhập lại số lượng thực tế sau khi kiểm kê; xem [tồn kho](product-stock.md).

Bản chỉnh sửa sản phẩm yêu cầu **005_product_edit**. Runner giữ nguyên dữ liệu và thêm phiên bản sản phẩm để chống ghi đè tồn kho.
