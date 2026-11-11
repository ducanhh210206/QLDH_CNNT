# API Gateway trên Windows Standby — Render Primary + MySQL dự phòng

Gateway Nginx phục vụ frontend và chuyển `/api/*`, `/health/*` tới backend được chọn. Mặc định là Render Primary. Địa chỉ Gateway không thay đổi khi chuyển backend, miễn tiến trình đường hầm vẫn chạy. Đây là chuyển tuyến thủ công có kiểm soát; không tự promotion MySQL, không tự failback, không phải HA hoàn chỉnh. Nếu Windows Standby mất điện thì Gateway trên máy đó cũng dừng.

## 1. Điều kiện

- Docker Desktop đang chạy trên Windows Standby, Node/npm đã có.
- Backend Standby đang chạy trên cổng 5000, `INSTANCE_NAME=standby`, kết nối MySQL dự phòng đúng. `http://127.0.0.1:5000/health/ready` trả Healthy với instance standby. Readiness hiện kiểm tra đọc/auth/schema, không chứng minh MySQL đã được phép ghi.
- Primary HTTPS: `https://qldh-demo.onrender.com`, instance primary.
- Giữ MySQL Standby chỉ đọc khi chưa thực hiện quy trình chuyển quyền ghi. Không đổi readonly hoặc replication chỉ để Gateway hoạt động.
- Chỉ chạy Compose Gateway mới bên dưới. Không chạy toàn bộ compose.app.yml để nối tới hai MySQL khác nhau; cấu hình đó là lab hai backend dùng chung database.

## 2. Khởi động Gateway (PowerShell trên Windows)

Từ thư mục gốc repository `QLDH_CNNT`:

```powershell
git pull --ff-only origin main
Copy-Item gateway/.env.example gateway/.env
```

Chỉ sao chép `.env.example` lần đầu; không ghi đè cấu hình riêng đang có. Trong `gateway/.env`:

```dotenv
GATEWAY_PRIMARY_HOST=qldh-demo.onrender.com
GATEWAY_STANDBY_PORT=5000
GATEWAY_ACTIVE_BACKEND=primary
```

PRIMARY_HOST chỉ là hostname, không thêm `https://` hoặc đường dẫn. Nếu backend Windows dùng cổng khác thì sửa STANDBY_PORT. Không đặt mật khẩu database/JWT trong file Gateway.

```powershell
docker compose --env-file gateway/.env -f docker/compose.gateway-windows.yml config --quiet
docker compose --env-file gateway/.env -f docker/compose.gateway-windows.yml up -d --build
docker compose --env-file gateway/.env -f docker/compose.gateway-windows.yml exec gateway nginx -t
Invoke-RestMethod http://127.0.0.1:8080/gateway/live
Invoke-RestMethod http://127.0.0.1:8080/health/ready
```

Kết quả: `/gateway/live` báo Gateway chạy, routing manual, selected primary; `/health/ready` phải báo backend Healthy, instance primary. Gateway liveness không thay thế backend readiness.

Frontend: `http://127.0.0.1:8080`. Gateway chỉ publish vào loopback, không mở MySQL hay Gateway vào toàn bộ mạng. Container gọi backend Windows qua `host.docker.internal`, không dùng 127.0.0.1 của container.

Kiểm tra container truy cập backend Standby:

```powershell
docker compose --env-file gateway/.env -f docker/compose.gateway-windows.yml exec gateway wget -qO- http://host.docker.internal:5000/health/ready
```

Đổi 5000 nếu cần. Nếu localhost trên Windows chạy được nhưng lệnh trong container lỗi: kiểm tra địa chỉ HOST mà backend lắng nghe và Windows Firewall cho kết nối từ Docker Desktop. Không tắt firewall hoặc mở MySQL công khai. Sửa HOST/cổng theo giao diện mạng được phép và khởi động lại backend; chỉ cho Docker truy cập cổng backend cần dùng.

## 3. URL HTTPS chung để demo

Ở PowerShell riêng trên Windows, sau khi Gateway đã chạy:

```powershell
cloudflared tunnel --no-autoupdate --url http://127.0.0.1:8080
```

Dùng URL HTTPS mới được cấp làm địa chỉ website Gateway. Đường hầm này khác đường hầm Monitoring cổng 5001: giữ cả hai tiến trình chạy. Không dùng URL Monitoring làm frontend hoặc backend.

Quick tunnel chỉ phục vụ demo; URL có thể đổi khi khởi động lại. Một URL ổn định cần named tunnel/domain hoặc hosting phù hợp, không được tự triển khai bằng cấu hình này.

## 4. Cấu hình đăng nhập trước khi dùng URL Gateway

Cần bổ sung **origin Gateway thực tế** vào `CORS_ORIGINS` ở cả backend Render và backend Standby; giữ các origin cũ đang sử dụng. Ví dụ nếu Gateway là `https://example.trycloudflare.com`, thêm đúng địa chỉ đó, không có dấu `/` cuối. Giữ kiểm tra Origin của backend; Gateway không giả mạo Origin để vượt kiểm tra này.

- Render: chỉnh Environment, lưu và triển khai lại.
- Backend Standby: chỉnh `backend/.env` của máy Windows, khởi động lại backend. Nếu truy cập qua HTTPS, cấu hình cookie/production/trust proxy phù hợp theo tài liệu triển khai. Trình duyệt gửi request cùng origin qua Gateway.
- Thử đăng nhập tài khoản demo bằng mật khẩu trước. Nếu chuyển backend làm phiên không còn hợp lệ, đăng nhập lại; phiên phụ thuộc JWT secret, bản ghi session và trạng thái replication. Không hứa giữ mọi phiên sau failover.
- Google: cần OAuth redirect về URL Gateway `/api/auth/google/callback`, `GOOGLE_REDIRECT_URI`, `FRONTEND_URL` và Google Cloud khớp nhau ở backend phục vụ. Nếu dùng chung OAuth config cho cả Render URL và Gateway URL thì phải thiết kế/chọn callback rõ ràng; chỉ thêm CORS không đủ. Không tự thay Google secret hoặc chuyển cấu hình Google đang dùng trên Render trong bước dựng Gateway.

## 5. Nối Monitoring trên Windows

Trong `monitoring/.env`:

```dotenv
PRIMARY_URL=https://qldh-demo.onrender.com
STANDBY_URL=http://127.0.0.1:5000
GATEWAY_URL=http://127.0.0.1:8080
```

Đổi cổng Standby theo thực tế. Giữ nguyên token và cấu hình MySQL replication đang dùng. Khởi động lại Monitoring. UI xác định Active qua instance của `/health/ready` đi xuyên Gateway; `/gateway/live` chỉ báo tuyến đã chọn. Nếu Gateway chọn primary mà Primary không sẵn sàng, readiness lỗi và Active không xác định, không tự chuyển tuyến sang máy khác.

## 6. Chuyển sang Standby khi diễn tập

Thực hiện runbook database trước: cô lập toàn bộ nguồn ghi Primary, đối chiếu dữ liệu/GTID, quyết định mất dữ liệu chấp nhận được và promotion Standby đúng quy trình của nhóm. Không dùng các cờ dưới đây khi chưa xác nhận các điều kiện đó.

```powershell
./scripts/switch-gateway.ps1 -Backend standby -ConfirmPrimaryFenced -ConfirmStandbyWritable
```

Script kiểm tra readiness instance standby, cập nhật tuyến và kiểm tra lại qua Gateway. Hai cờ là xác nhận **của người vận hành**, không phải phép kiểm chứng tự động fencing hay readonly. Script không chạm database, không dừng Render, không cấp quyền ghi, không tự chuyển lại nếu kiểm tra thất bại.

Khi chạy script bị PowerShell chặn execution policy, không tắt bảo vệ toàn máy. Có thể thay đổi GATEWAY_ACTIVE_BACKEND=standby trong `gateway/.env` bằng tay **sau cùng các bước xác nhận an toàn**, rồi chạy:

```powershell
docker compose --env-file gateway/.env -f docker/compose.gateway-windows.yml up -d --no-deps --force-recreate gateway
Invoke-RestMethod http://127.0.0.1:8080/health/ready
```

Sau chuyển: dùng cùng URL Gateway, xác nhận Monitoring báo Standby Active, thử giao dịch giả trong phạm vi diễn tập rồi đối chiếu dữ liệu và ghi timeline.

## 7. Trở về Primary

Chỉ sau khi dừng ghi Standby, sao lưu/đối chiếu và hoàn tất failback dữ liệu về Aiven theo runbook:

```powershell
./scripts/switch-gateway.ps1 -Backend primary -ConfirmFailbackVerified
```

Không chuyển lại chỉ vì Render Healthy: có thể còn dữ liệu chỉ nằm trên Standby. Không tự động rollback tuyến khi lỗi vì có nguy cơ hai phía nhận ghi.

## 8. Nhật ký và giới hạn

```powershell
docker compose --env-file gateway/.env -f docker/compose.gateway-windows.yml ps
docker compose --env-file gateway/.env -f docker/compose.gateway-windows.yml logs --tail=50 gateway
```

- Gateway không retry upstream, bao gồm POST/PATCH/DELETE; mất kết nối sau thao tác ghi cần kiểm tra kết quả trước khi gửi lại, giữ Idempotency-Key của thao tác tạo đơn.
- HTTPS tới Render có SNI và xác thực chứng chỉ. Không tắt proxy_ssl_verify để chữa lỗi.
- Khởi động lại Gateway có thể gián đoạn ngắn. Không tự đồng bộ dữ liệu, không tự ngăn split-brain.
- Chạy Gateway trên Windows thật và diễn tập liên máy vẫn cần nhóm kiểm chứng; thử trên Mac/Docker không chứng minh toàn bộ hạ tầng Windows đã sẵn sàng.

## Kiểm thử cấu hình

Trên máy có Python 3, OpenSSL và Docker, build image như bước 2 rồi chạy `python scripts/test-gateway.py`. Test tạo backend HTTPS Primary và backend HTTP Standby giả trong Docker cách ly, xác minh đường dẫn/query/body/cookie/Origin, không retry POST bị rớt kết nối và từ chối chứng chỉ không tin cậy. Test chỉ xoá container/network/thư mục tạm do chính nó tạo; không dùng MySQL hay tạo giao dịch production. Kiểm tra này không chạy PowerShell trên Windows thật.
