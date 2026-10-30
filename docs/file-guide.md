# Công dụng từng file trong dự án OMDRS

Tài liệu giải thích các file nguồn và tài liệu của dự án, bao gồm phần phân quyền và đăng nhập Google cập nhật ngày 29/10/2026. Các đường dẫn bên dưới tính từ thư mục gốc repository, nơi có package.json. Không tính từng file do npm tạo trong node_modules hoặc file build tự sinh.

## Nắm nhanh trước khi đọc

- **Frontend (FE)**: giao diện người dùng nhìn thấy, chạy React.
- **Backend (BE)**: nhận yêu cầu HTTP, xác thực, xử lý nghiệp vụ và gọi MySQL.
- **Database**: dữ liệu thật nằm trong MySQL/volume Docker; các file .sql ở source chủ yếu là bản thiết kế cấu trúc.
- **Route**: URL nào gọi hàm nào. **Middleware**: kiểm tra trước/sau xử lý. **Controller**: nhận request/trả response. **Service**: điều phối nghiệp vụ. **Repository**: truy vấn SQL.
- **.jsx**: React; **.js**: JavaScript; **.sql**: lệnh database; **.yml**: cấu hình Docker; **.sh**: script shell; **.md**: tài liệu; **.env**: biến cấu hình.

## Luồng một thao tác tạo đơn

```text
CreateOrder.jsx → api.js → app.js → authMiddleware.js
  → orderRoutes.js → orderController.js → orderService.js
  → orderRepository.js → database.js → MySQL
```

FE chỉ báo thành công khi API xác nhận. Dữ liệu đơn hàng không được ghi ngược vào schema.sql. Với backup/mô phỏng, SQL có một phần nằm trong service tương ứng; không phải mọi SQL đều nằm trong hai repository.

## 1. Các file ở thư mục gốc

| File | Công dụng |
|---|---|
| [.dockerignore](../.dockerignore) | Loại node_modules, .env thật, backup và các file không cần thiết khỏi ngữ cảnh build Docker, tránh đưa secret vào image. |
| [.env.example](../.env.example) | Cấu hình mẫu cho Docker Compose toàn ứng dụng: thông tin MySQL, JWT, token Monitoring và CORS. Khác với backend/.env dùng khi chạy BE bằng Node. |
| [.gitignore](../.gitignore) | Quy định file Git không theo dõi: secret, thư viện cài sẵn, bản build, log, backup và ghi chú phục hồi riêng của máy. |
| [README.md](../README.md) | Hướng dẫn clone code, cài phần mềm, cấu hình MySQL, tạo tài khoản, chạy Node/Docker và xử lý lỗi. |
| [package.json](../package.json) | Khai báo npm workspaces frontend/backend/monitoring và các lệnh dùng chung như dev, build, test, db:init, user:create. |
| [package-lock.json](../package-lock.json) | Khóa phiên bản và thông tin dependency để npm ci cài lại đúng bộ thư viện. Không phải file lưu dữ liệu đơn hàng. |

## 2. Frontend — cấu hình và khởi động

| File | Công dụng |
|---|---|
| [frontend/.env.example](../frontend/.env.example) | Cấu hình mẫu cho FE. API_PROXY_TARGET chọn BE Node cổng 5000 hoặc BE Docker cổng 5002; VITE_API_BASE là tiền tố URL API nếu được cấu hình. |
| [frontend/Dockerfile](../frontend/Dockerfile) | Build giao diện React bằng Node rồi đóng gói file tĩnh vào image Nginx cho cấu hình Docker toàn ứng dụng. |
| [frontend/index.html](../frontend/index.html) | Trang HTML gốc chứa phần tử root để React gắn giao diện vào và nạp main.jsx. |
| [frontend/package.json](../frontend/package.json) | Danh sách thư viện React/Vite/Lucide và các lệnh chạy dev, build, preview của FE. |
| [frontend/vite.config.js](../frontend/vite.config.js) | Thiết lập Vite, plugin React, cổng FE 5173 và proxy /api, /health sang địa chỉ API_PROXY_TARGET. |
| [frontend/src/main.jsx](../frontend/src/main.jsx) | Điểm bắt đầu của React: nạp CSS, tạo React root và hiển thị App. |
| [frontend/src/App.jsx](../frontend/src/App.jsx) | Ghép khung giao diện: sidebar, header, điều hướng trang, trạng thái đăng nhập, đổi sáng/tối và toast. Chọn trang được hiển thị theo thao tác người dùng. |
| [frontend/src/components/common.jsx](../frontend/src/components/common.jsx) | Các phần dùng lại: panel, badge, thông báo lỗi, loading, trạng thái rỗng, modal, tiêu đề trang và hook useData để tải/làm mới dữ liệu. |
| [frontend/src/services/api.js](../frontend/src/services/api.js) | Hàm gọi HTTP tới BE, gửi cookie phiên, xử lý timeout/lỗi và các hàm định dạng tiền, thời gian, tên trạng thái. Không kết nối MySQL trực tiếp. |
| [frontend/src/styles/global.css](../frontend/src/styles/global.css) | Toàn bộ kiểu hiển thị: màu, font, bố cục, bảng, biểu mẫu, đăng nhập, responsive và chế độ sáng/tối. |

## 3. Frontend — từng trang

| File | Công dụng |
|---|---|
| [frontend/src/pages/Login.jsx](../frontend/src/pages/Login.jsx) | Đăng nhập, đăng ký nhân viên chờ duyệt, thông báo xét duyệt và bắt đầu đăng nhập Google khi được cấu hình. |
| [frontend/src/pages/Dashboard.jsx](../frontend/src/pages/Dashboard.jsx) | Tổng quan: số đơn, doanh thu đơn Completed, phân bố trạng thái, biểu đồ số đơn theo ngày và các đơn gần đây; lấy dữ liệu từ API. |
| [frontend/src/pages/CreateOrder.jsx](../frontend/src/pages/CreateOrder.jsx) | Biểu mẫu tạo đơn. Kiểm tra dữ liệu, giữ bản nháp và yêu cầu đang chờ trên trình duyệt; gửi cùng idempotency key khi thử lại để tránh tạo trùng. |
| [frontend/src/pages/OrderList.jsx](../frontend/src/pages/OrderList.jsx) | Bảng đơn hàng: tìm kiếm, lọc trạng thái, sắp xếp, phân trang, làm mới và mở chi tiết. |
| [frontend/src/pages/OrderDetail.jsx](../frontend/src/pages/OrderDetail.jsx) | Cửa sổ chi tiết đơn: thông tin, phiên bản, lịch sử thay đổi và thao tác hoàn tất/hủy khi đơn còn Pending. |
| [frontend/src/pages/SystemMonitoring.jsx](../frontend/src/pages/SystemMonitoring.jsx) | Trang Admin xem trạng thái BE/DB/Monitor, thành phần chưa cấu hình, độ trễ, uptime, bộ nhớ và nhật ký giám sát. |
| [frontend/src/pages/IncidentManagement.jsx](../frontend/src/pages/IncidentManagement.jsx) | Trang mô phỏng bốn loại sự cố và xem timeline. Các nút Demo không dừng dịch vụ hoặc xóa dữ liệu thật. |
| [frontend/src/pages/BackupRestore.jsx](../frontend/src/pages/BackupRestore.jsx) | Trang Admin liệt kê/tạo backup, xác nhận restore vào database cách ly và hiển thị báo cáo đối chiếu dữ liệu. |
| [frontend/src/pages/Settings.jsx](../frontend/src/pages/Settings.jsx) | Thông tin người dùng, vai trò, tùy chọn sáng/tối và hướng dẫn vị trí cấu hình vận hành. Không trực tiếp sửa secret MySQL từ trình duyệt. |

## 4. Backend — khởi động và cấu hình

| File | Công dụng |
|---|---|
| [backend/.env.example](../backend/.env.example) | Mẫu biến môi trường BE: cổng, kết nối DB, JWT_SECRET, CORS, Monitor và lịch backup. Người chạy tự tạo backend/.env với giá trị thật. |
| [backend/Dockerfile](../backend/Dockerfile) | Đóng gói BE và mã Monitor bằng Node 24, cài dependency runtime, chạy bằng user node và khai báo healthcheck. Dùng để build image BE. |
| [backend/package.json](../backend/package.json) | Thư viện BE như Express/mysql2/JWT/Zod và lệnh start, dev, test, db:init, user:create. |
| [backend/src/server.js](../backend/src/server.js) | Chạy HTTP server trên host/port cấu hình, bật job backup nếu được cấu hình và đóng server/kết nối DB khi nhận tín hiệu dừng. |
| [backend/src/app.js](../backend/src/app.js) | Tạo ứng dụng Express, ghép middleware bảo mật, CORS, đọc JSON/cookie, health API, các route nghiệp vụ, xử lý 404 và lỗi cuối cùng. |
| [backend/src/config/env.js](../backend/src/config/env.js) | Đọc backend/.env, tập hợp cấu hình, giá trị mặc định và cấu hình kết nối DB trực tiếp khi không dùng pool. |
| [backend/src/config/database.js](../backend/src/config/database.js) | Tạo pool mysql2 để dùng lại kết nối, đặt timezone UTC và cung cấp transaction: commit khi thành công, rollback khi lỗi. |

## 5. Backend — routes và middleware

| File | Công dụng |
|---|---|
| [backend/src/routes/authRoutes.js](../backend/src/routes/authRoutes.js) | Khai báo URL đăng nhập, đăng xuất, thông tin người dùng; áp dụng giới hạn tần suất đăng nhập. |
| [backend/src/routes/orderRoutes.js](../backend/src/routes/orderRoutes.js) | Khai báo URL danh sách, tạo đơn, chi tiết, cập nhật trạng thái và lịch sử; chuyển yêu cầu sang controller tương ứng. |
| [backend/src/routes/systemRoutes.js](../backend/src/routes/systemRoutes.js) | Ghép các route Admin về trạng thái/metrics, sự cố, mô phỏng, backup và restore; giới hạn tần suất backup/restore. Không chỉ chứa route monitoring. |
| [backend/src/middlewares/authMiddleware.js](../backend/src/middlewares/authMiddleware.js) | Kiểm tra JWT trong cookie, kiểm tra session MySQL còn hiệu lực và chặn thao tác Admin với tài khoản Staff. |
| [backend/src/middlewares/validateOrder.js](../backend/src/middlewares/validateOrder.js) | Schema kiểm tra đơn, UUID, trạng thái, phân trang và sort bằng Zod; từ chối dữ liệu không hợp lệ trước khi truy vấn nghiệp vụ. |
| [backend/src/middlewares/errorHandler.js](../backend/src/middlewares/errorHandler.js) | Chuyển lỗi thành HTTP/JSON có mã lỗi và request ID; lỗi kết nối DB trả 503 và không đưa thông tin nhạy cảm ra phản hồi. |

## 6. Backend — controllers

| File | Công dụng |
|---|---|
| [backend/src/controllers/authController.js](../backend/src/controllers/authController.js) | Nhận dữ liệu đăng nhập, gọi authService, đặt/xóa cookie HttpOnly và trả thông tin tài khoản hiện tại. |
| [backend/src/controllers/orderController.js](../backend/src/controllers/orderController.js) | Nhận yêu cầu về đơn và dashboard, gọi orderService, chọn HTTP status và trả JSON; tạo mới trả 201, phát lại cùng yêu cầu trả 200. |
| [backend/src/controllers/systemController.js](../backend/src/controllers/systemController.js) | Trả trạng thái hệ thống từ healthService và số đo thực tế của tiến trình như uptime/bộ nhớ. |
| [backend/src/controllers/backupController.js](../backend/src/controllers/backupController.js) | Xử lý yêu cầu xem/tạo backup, kiểm tra ID và câu xác nhận restore, gọi backupService và trả kết quả phục hồi. |
| [backend/src/controllers/incidentController.js](../backend/src/controllers/incidentController.js) | Nhận yêu cầu xem sự cố hoặc mô phỏng, kiểm tra loại sự cố/ID rồi gọi incidentService. |

## 7. Backend — services

| File | Công dụng |
|---|---|
| [backend/src/services/authService.js](../backend/src/services/authService.js) | Băm/kiểm tra mật khẩu bằng scrypt, xác minh đăng nhập, tạo session DB và phát JWT có thời hạn. Không có mật khẩu Admin mặc định. |
| [backend/src/services/orderService.js](../backend/src/services/orderService.js) | Kiểm tra dữ liệu nghiệp vụ/ID/idempotency key, xử lý trường hợp không tìm thấy đơn và gọi orderRepository cho các thao tác đơn/thống kê. |
| [backend/src/services/healthService.js](../backend/src/services/healthService.js) | Kiểm tra kết nối/schema MySQL và cấu hình xác thực để tính readiness; gọi dịch vụ Monitor riêng để tổng hợp trạng thái hệ thống. |
| [backend/src/services/backupService.js](../backend/src/services/backupService.js) | Tạo SQL snapshot nhất quán, lưu checksum/metadata, dùng GET_LOCK chống sao lưu đồng thời, restore vào schema mới, đối chiếu các bảng và dọn backup theo chính sách. |
| [backend/src/services/incidentService.js](../backend/src/services/incidentService.js) | Đọc/ghi incident_logs và tạo timeline Demo cho Power Outage, Server Crash, Network Failure, Data Loss; không thực thi lệnh phá hủy hạ tầng. |

## 8. Backend — repositories, jobs và tiện ích

| File | Công dụng |
|---|---|
| [backend/src/repositories/orderRepository.js](../backend/src/repositories/orderRepository.js) | Chứa SQL đọc/ghi đơn, tìm kiếm/phân trang, chống trùng yêu cầu, khóa/version khi cập nhật, lịch sử và thống kê. Cập nhật đơn/lịch sử trong cùng transaction. |
| [backend/src/repositories/userRepository.js](../backend/src/repositories/userRepository.js) | SQL đăng ký Pending, tài khoản Google, phiên đăng nhập, danh sách nhân viên, xét duyệt và lịch sử quyền; thu hồi session khi đổi quyền. |
| [backend/src/jobs/backupJob.js](../backend/src/jobs/backupJob.js) | Chạy backup theo BACKUP_INTERVAL_HOURS trên instance primary và dọn bản cũ sau lần backup lịch thành công; mặc định tắt. |
| [backend/src/utils/errors.js](../backend/src/utils/errors.js) | Định nghĩa AppError và hàm fail để chủ động trả lỗi có HTTP status, mã lỗi và thông báo nghiệp vụ. |
| [backend/src/utils/integrity.js](../backend/src/utils/integrity.js) | Chuẩn hóa dữ liệu, tạo SHA-256 và so sánh đơn trước/sau để tìm bản ghi thiếu, phát sinh hoặc bị thay đổi. |
| [backend/src/utils/logger.js](../backend/src/utils/logger.js) | Ghi sự kiện có cấu trúc JSON kèm thời gian; được dùng khi khởi động, request lỗi hoặc job thất bại. |

## 9. Backend — kiểm thử

| File | Công dụng |
|---|---|
| [backend/tests/business.test.js](../backend/tests/business.test.js) | Kiểm thử dữ liệu đầu vào, quy tắc chuyển trạng thái/version, phân trang, đối chiếu toàn vẹn và băm mật khẩu; không cần DB thật. |
| [backend/tests/http.test.js](../backend/tests/http.test.js) | Kiểm thử API/HTTP: liveness, yêu cầu đăng nhập, JWT giả, quyền Staff, origin, JSON lỗi và 503 khi DB lỗi. Một số test dùng stub DB, không chứng minh SQL thật đã chạy. |
| [backend/tests/integration.test.js](../backend/tests/integration.test.js) | Test opt-in với MySQL thật: tự tạo schema cách ly, kiểm tra auth, idempotency đồng thời, trạng thái/lịch sử, phân quyền, backup và restore. Cần quyền DB phù hợp; mặc định bỏ qua. |

## 10. Database

| File | Công dụng |
|---|---|
| [database/init/schema.sql](../database/init/schema.sql) | Định nghĩa 12 bảng ứng dụng, cột, khóa, index và ràng buộc; ghi migration 001_initial và 002_user_access. Là file init-db.js thực sự đọc để khởi tạo lần đầu. |
| [database/migrations/001_initial.sql](../database/migrations/001_initial.sql) | Lưu cấu trúc phiên bản đầu tiên trước phần phân quyền mới; giữ làm lịch sử và kiểm thử nâng cấp. Không chạy lại trên database đang có dữ liệu. |
| [database/seeds/sample_orders.sql](../database/seeds/sample_orders.sql) | Hiện chỉ chứa chú thích/hướng dẫn, chưa có INSERT dữ liệu mẫu. Đơn hàng phải tạo qua ứng dụng hoặc test cách ly. |
| [database/backups/.gitkeep](../database/backups/.gitkeep) | File giữ thư mục backup trong Git khi chưa có bản sao lưu; không chứa dữ liệu MySQL. |

## 11. Monitoring, Gateway và Docker Compose

| File | Công dụng |
|---|---|
| [monitoring/.env.example](../monitoring/.env.example) | Mẫu cấu hình host/port Monitor, token nội bộ, URL Primary/Standby/Gateway và chu kỳ kiểm tra. |
| [monitoring/package.json](../monitoring/package.json) | Khai báo dependency/lệnh start của tiến trình Monitoring độc lập. |
| [monitoring/src/server.js](../monitoring/src/server.js) | Chạy Monitor: kiểm tra health của các đích, ghi chuyển trạng thái Live vào JSONL, phục vụ /health/live và /status có bảo vệ token. Vẫn hoạt động khi BE dừng nếu process Monitor còn chạy. |
| [gateway/nginx.conf](../gateway/nginx.conf) | Nginx phục vụ FE và proxy API tới BE Primary/Standby. Có failover thụ động; không phải active health checker hoặc cơ chế promotion database. |
| [docker/compose.backend.yml](../docker/compose.backend.yml) | Chạy riêng BE bằng Docker, publish 127.0.0.1:5002 sang 5000 trong container, lấy secret từ backend/.env, dùng MySQL có sẵn và volume backup riêng. |
| [docker/compose.app.yml](../docker/compose.app.yml) | Chạy hai BE, Monitor và Gateway/FE. Hai BE dùng chung MySQL hiện có; file không tạo MySQL Primary hoặc bảo đảm HA liên máy. |
| [docker/compose.standby.yml](../docker/compose.standby.yml) | Mẫu MySQL Standby lab opt-in, volume/cổng riêng. Chưa cấu hình replication hoặc tự chuyển quyền ghi. |
| [docker/mysql/my.cnf](../docker/mysql/my.cnf) | Cấu hình mẫu Standby: server-id, binlog, GTID và read_only/super_read_only. Không tự áp dụng lên MySQL Primary hiện tại. |

## 12. Scripts — công cụ vận hành

| File | Công dụng |
|---|---|
| [scripts/init-db.js](../scripts/init-db.js) | Kiểm tra xác nhận và database đích mới/rỗng, tạo order_management nếu cần rồi chạy schema.sql. Từ chối khi có bảng để bảo toàn dữ liệu. |
| [scripts/create-user.js](../scripts/create-user.js) | Đọc NEW_USERNAME/NEW_PASSWORD/NEW_ROLE, băm mật khẩu và thêm tài khoản website vào users. Không tạo tài khoản MySQL server. |
| [scripts/check-health.sh](../scripts/check-health.sh) | Gọi /health/live và /health/ready. Mặc định API cổng 5000; dùng API_URL=http://127.0.0.1:5002 khi kiểm tra BE Docker. |
| [scripts/backup.sh](../scripts/backup.sh) | Gọi API tạo backup bằng cookie Admin từ COOKIE_FILE; không phải lệnh sao lưu trực tiếp volume MySQL. |
| [scripts/restore.sh](../scripts/restore.sh) | Yêu cầu cookie Admin, BACKUP_ID và xác nhận RESTORE rồi gửi yêu cầu tới API phục hồi database cách ly. Cần quyền DB phù hợp; không phải công cụ tự đặt lại MySQL thật. |
| [scripts/simulate-backend-crash.sh](../scripts/simulate-backend-crash.sh) | Chỉ trong lab Compose toàn ứng dụng: yêu cầu xác nhận backend-only, dừng BE Primary, kiểm tra Gateway và có trap khởi động lại Primary khi thoát. Không dùng cho Compose BE riêng. |
| [scripts/simulate-network-failure.sh](../scripts/simulate-network-failure.sh) | In hướng dẫn mô phỏng mất mạng bằng DevTools Offline; không tự ngắt Docker Network. |
| [scripts/package.py](../scripts/package.py) | Tạo ZIP source ở thư mục cha, bỏ node_modules, .env thật, backup, log, dist và Git. Không phải bản sao lưu database. |

## 13. Tài liệu

| File | Công dụng |
|---|---|
| [docs/api-documentation.md](../docs/api-documentation.md) | Danh sách API, quyền truy cập, payload/response chính và các mã lỗi. |
| [docs/architecture.md](../docs/architecture.md) | Giải thích kiến trúc, phân lớp, session, backup, giám sát và giới hạn HA/failover. |
| [docs/database-design.md](../docs/database-design.md) | Giải thích bảng, quan hệ, index, timezone, tiền tệ và chính sách dữ liệu. |
| [docs/deployment-macos.md](../docs/deployment-macos.md) | Hướng dẫn triển khai macOS/Docker và các điều kiện cần kiểm tra trước production. |
| [docs/deployment-windows.md](../docs/deployment-windows.md) | Hướng dẫn chuyển máy, Windows/WSL2 và chuẩn bị Standby lab. |
| [docs/incident-runbook.md](../docs/incident-runbook.md) | Các bước kiểm tra/xử lý sự cố, thử nghiệm cách ly, backup/restore và cách hiểu RTO/RPO. |
| [docs/testing-report.md](../docs/testing-report.md) | Báo cáo kiểm thử theo thời điểm, phân biệt phần đạt/chưa kiểm thử/chưa cấu hình. Không phải chứng nhận mọi máy clone về đều đã chạy được. |
| [docs/login-preview.png](../docs/login-preview.png) | Ảnh chụp màn hình đăng nhập để minh họa/kiểm tra giao diện; ứng dụng không dùng ảnh này để render login. |
| [docs/file-guide.md](../docs/file-guide.md) | Tài liệu bạn đang đọc: giải thích công dụng từng file và cách lần theo luồng xử lý. |

## Các file bổ sung cho phân quyền và Google (29/10/2026)

| File | Công dụng |
|---|---|
| [backend/src/config/permissions.js](../backend/src/config/permissions.js) | Danh sách quyền nhân viên và dữ liệu người dùng được phép trả về API; Quản lý có quyền quản trị. |
| [backend/src/controllers/googleAuthController.js](../backend/src/controllers/googleAuthController.js) | Bắt đầu đăng nhập Google và nhận callback; chuyển kết quả về FE. |
| [backend/src/controllers/userController.js](../backend/src/controllers/userController.js) | Kiểm tra dữ liệu khi quản lý duyệt hoặc đổi quyền nhân viên. |
| [backend/src/repositories/productRepository.js](../backend/src/repositories/productRepository.js) | Truy vấn danh mục và thêm sản phẩm với SKU duy nhất. |
| [backend/src/routes/productRoutes.js](../backend/src/routes/productRoutes.js) | API sản phẩm, kiểm tra quyền xem/thêm tại máy chủ. |
| [backend/src/routes/userRoutes.js](../backend/src/routes/userRoutes.js) | API quản lý tài khoản và lịch sử xét duyệt dành cho Quản lý. |
| [backend/src/services/googleAuthService.js](../backend/src/services/googleAuthService.js) | OAuth Google: state, nonce, PKCE, xác minh ID token và tạo phiên sau khi tài khoản được duyệt. |
| [backend/src/services/productService.js](../backend/src/services/productService.js) | Kiểm tra SKU, tên và giá sản phẩm trước khi ghi MySQL. |
| [backend/src/utils/authCookies.js](../backend/src/utils/authCookies.js) | Cookie phiên đăng nhập và cookie tạm của OAuth. |
| [backend/tests/access.test.js](../backend/tests/access.test.js) | Kiểm thử đăng ký, trạng thái tài khoản, quyền API, OAuth và sản phẩm. |
| [backend/tests/migration.integration.test.js](../backend/tests/migration.integration.test.js) | Chạy migration 002 trên schema MySQL riêng, kiểm tra dữ liệu cũ và khả năng chạy lại. |
| [database/migrations/002_user_access.sql](../database/migrations/002_user_access.sql) | Cột trạng thái/quyền/Google trong users; bảng sản phẩm, lịch sử quyền và OAuth state. |
| [frontend/src/pages/Products.jsx](../frontend/src/pages/Products.jsx) | Danh mục, tìm kiếm và thêm sản phẩm theo quyền. |
| [frontend/src/pages/TransactionHistory.jsx](../frontend/src/pages/TransactionHistory.jsx) | Tra cứu lịch sử tạo/chuyển trạng thái đơn hàng. |
| [frontend/src/pages/UserManagement.jsx](../frontend/src/pages/UserManagement.jsx) | Quản lý xét duyệt nhân viên, cấp quyền, tạm khóa và xem lịch sử thay đổi. |
| [frontend/src/utils/permissions.js](../frontend/src/utils/permissions.js) | Hàm kiểm tra quyền và nhãn tiếng Việt để hiển thị menu/chức năng. |
| [scripts/migrate-db.js](../scripts/migrate-db.js) | Nâng cấp schema đang có lên 002; khóa MySQL, tạo snapshot bảo vệ trước DDL và hỗ trợ chạy lại. |
| [docs/auth-permissions.md](../docs/auth-permissions.md) | Hướng dẫn phân quyền, xét duyệt, nâng cấp database và cấu hình Google OAuth. |
| [docs/issued-accounts-preview.png](../docs/issued-accounts-preview.png) | Ảnh danh sách tài khoản đã cấp và các quyền bằng dữ liệu thử cách ly. |
| [docs/create-staff-preview.png](../docs/create-staff-preview.png) | Ảnh biểu mẫu quản lý tạo và cấp quyền tài khoản nhân viên. |
| [docs/access-approval-preview.png](../docs/access-approval-preview.png) | Ảnh màn hình cấp quyền với dữ liệu thử nghiệm cách ly. |
| [docs/staff-permissions-preview.png](../docs/staff-permissions-preview.png) | Ảnh menu nhân viên sau khi được duyệt, dùng tài khoản kiểm thử. |

## File cục bộ hoặc tự sinh — không đưa lên Git

| File/thư mục | Công dụng |
|---|---|
| backend/.env | Thông tin kết nối MySQL và secret thật của máy đang chạy. |
| frontend/.env | Chọn API proxy của máy cá nhân; hiện BE Docker dùng cổng 5002. |
| monitoring/.env | URL giám sát và token nội bộ thật của máy. |
| .env ở thư mục gốc | Cấu hình thật khi dùng Compose toàn ứng dụng. |
| .env.mysql.local, nếu tự tạo | Thông số khởi tạo MySQL Docker riêng trên máy mới. |
| backend/.env.mysql-root-* | Tệp credential phục hồi riêng của máy đã đặt lại root; không phải mã nguồn và không chia sẻ. |
| node_modules/ | Các thư viện do npm ci cài, có thể tạo lại từ lockfile. |
| frontend/dist/ | Kết quả npm run build; không sửa trực tiếp vì sẽ bị ghi lại khi build. |
| monitoring/data/incidents.jsonl | Nhật ký chuyển trạng thái Live do Monitor tạo. |
| database/backups/*.sql và *.json | SQL backup và manifest/checksum khi BE chạy bằng Node trên máy. |
| database/backups/*.tar.gz và *.sha256 | Bản sao lưu volume lạnh và checksum từng được tạo trong thao tác vận hành; không phải dữ liệu app mới nhất. |
| order-management-system.zip ở thư mục cha | Gói source do script đóng gói tạo; không phải MySQL volume. |

Khi BE chạy Docker, backup runtime nằm trong named volume gắn tại /app/database/backups, không tự ghi ra thư mục backup trong source trên máy. Dữ liệu MySQL hiện có lưu ở volume mysql_data, gắn tại /var/lib/mysql của container mysql_server_container. Hai loại volume này có công dụng khác nhau.

## Muốn sửa chức năng nào thì đọc đâu trước?

| Nhu cầu | File nên đọc trước |
|---|---|
| Đổi màu, bố cục | frontend/src/styles/global.css, frontend/src/App.jsx |
| Sửa biểu mẫu tạo đơn | CreateOrder.jsx → validateOrder.js → orderService.js → orderRepository.js |
| Sửa quy tắc chuyển trạng thái | OrderDetail.jsx → orderService.js → orderRepository.js |
| Sửa đăng nhập | Login.jsx → authController.js → authService.js → userRepository.js |
| Đổi kết nối database | backend/.env, env.js; nếu Docker kiểm tra compose override DB_HOST |
| Đổi cổng API mà FE gọi | frontend/.env (API_PROXY_TARGET) và cổng BE đang chạy |
| Sửa cấu trúc bảng | schema.sql/migrations; database đã có dữ liệu cần migration được kiểm tra, không chỉ sửa file SQL rồi chạy lại init |
| Theo dõi sự cố thật | healthService.js, monitoring/src/server.js, SystemMonitoring.jsx |
| Sửa backup/restore | BackupRestore.jsx → backupController.js → backupService.js → integrity.js |
