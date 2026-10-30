# Nhân viên, Quản lý và đăng nhập Google

## Vai trò và quy trình

Hệ thống giữ giá trị DB/API `Admin` (hiển thị **Quản lý**) và `Staff` (hiển thị **Nhân viên**) để tương thích tài khoản đã có.

| Chức năng | Nhân viên đã duyệt | Quản lý |
|---|---|---|
| Danh mục/thêm sản phẩm | Theo quyền được cấp | Có |
| Xem/tạo/cập nhật đơn | Theo từng quyền được cấp | Có |
| Thống kê | Khi được cấp statistics.read | Có |
| Lịch sử giao dịch đơn hàng | Khi được cấp transactions.read | Có |
| Sao lưu/phục hồi | Không | Có, đồng thời cần quyền MySQL phù hợp |
| Duyệt/khóa/cấp quyền người dùng | Không | Có |
| Tạo và cấp tài khoản nhân viên sử dụng ngay | Không | Có |
| Giám sát/mô phỏng hạ tầng | Không | Có |

1. Nhân viên chọn **Đăng ký nhân viên** hoặc dùng Google lần đầu.
2. Tài khoản được tạo với role Staff, trạng thái Pending và chưa có quyền. Public API không nhận role/status/permissions do người đăng ký tự gửi.
3. Quản lý đăng nhập → **Nhân viên & phê duyệt** → danh sách Chờ duyệt → **Xét duyệt**.
4. Chọn vai trò, trạng thái, quyền chức năng và ghi chú, rồi **Lưu & cấp quyền**.
5. Người dùng đăng nhập lại để sử dụng. Nếu bị từ chối/tạm khóa thì không vào được hệ thống.

Quyền thay đổi được kiểm tra tại API, không chỉ ẩn menu. Đổi quyền/role/trạng thái thu hồi các session cũ. UI kiểm tra lại phiên mỗi 15 giây; API áp dụng quyền hiện tại ngay khi nhận yêu cầu. Quản lý không tự đổi quyền/trạng thái của tài khoản đang đăng nhập. Các quyết định được tuần tự hóa và kiểm tra lại người thao tác trong transaction để tránh hai quản lý đồng thời vô hiệu hóa lẫn nhau.

Quyền Nhân viên hợp lệ: products.read, products.create, orders.read, orders.create, orders.update, statistics.read, transactions.read. Thêm sản phẩm cần đi kèm quyền xem sản phẩm; tạo/cập nhật đơn cần đi kèm xem đơn. Quyền tạo đơn không tự cho phép tạo đơn Completed/Cancelled nếu thiếu orders.update. Không thể cấp backups.manage/users.manage cho role Staff qua API.

Lịch sử giao dịch là lịch sử tạo/chuyển trạng thái đơn hàng, chưa phải ledger thanh toán ngân hàng. Danh mục sản phẩm độc lập có SKU duy nhất, tên, giá và mô tả. Biểu mẫu tạo đơn có thể chọn nhanh từ tối đa 100 sản phẩm đầu; thông tin sản phẩm trong đơn là bản ghi tại thời điểm tạo, chưa có quản lý tồn kho hoặc liên kết khóa ngoại sản phẩm trong đơn.

## Quản lý tạo tài khoản cho nhân viên

Mở **Nhân viên & phê duyệt → Cấp tài khoản nhân viên**, nhập họ tên, email, username, mật khẩu ban đầu và xác nhận. Chọn quyền nghiệp vụ, ghi chú rồi **Tạo & cấp quyền**. Tài khoản được cấp luôn là Staff/Active, dùng mật khẩu đăng nhập ngay; quản lý không cần duyệt lại. Form mặc định chọn các quyền nghiệp vụ, có thể bỏ chọn theo công việc.

Trang mặc định mở danh sách **Tài khoản đã cấp** (Active), có họ tên/username, email, phương thức đăng nhập, vai trò, trạng thái, số quyền có thể mở xem, ngày tạo/cập nhật quyền và ghi chú. Dùng bộ lọc để xem Chờ duyệt, Tạm khóa, Từ chối hoặc Tất cả tài khoản. Ngày cấp/cập nhật phản ánh lần xét duyệt gần nhất; tài khoản cũ tạo bằng CLI có thể chưa có thông tin xét duyệt. Không hiển thị mật khẩu.

Tên đăng nhập/email phải duy nhất, username 3–100 ký tự chữ ASCII/số/dấu chấm/gạch dưới/gạch ngang; mật khẩu 12–256 ký tự. Mật khẩu được băm scrypt và không xuất hiện trong response/lịch sử. Email chưa được xác minh; không tự liên kết Google theo email. Hệ thống không tự gửi email bàn giao và chưa bắt buộc đổi mật khẩu ở lần đăng nhập đầu; quản lý tự bàn giao qua kênh riêng.

API chỉ cho quản lý đang Active tạo nhân viên; kiểm tra lại quyền quản lý trong transaction trước khi ghi để xử lý thay đổi quyền đồng thời. Tạo tài khoản và ghi lịch sử cấp quyền là cùng một transaction. Public registration vẫn Pending. Không cần nâng schema ngoài 002 để dùng chức năng này.

## Cập nhật database đang có dữ liệu

**Không chạy lại db:init.** Mã mới yêu cầu schema 002. Chạy từ thư mục gốc:

```bash
npm ci
npm run db:migrate
```

Cần credential provisioning có SELECT/INSERT/CREATE/ALTER/INDEX/REFERENCES trên schema ứng dụng. Tài khoản runtime cũ có thể thiếu ALTER; không mặc định đã được cấp. Có thể dùng biến DB_USER/DB_PASSWORD của tài khoản provisioning trong môi trường lệnh migration; không ghi root hoặc secret vào Git. Không chạy DDL và backup đồng thời; tạm dừng ghi trong thời gian migration.

Runner lấy khóa MySQL, tạo SQL snapshot + SHA-256 trong BACKUP_DIR (mặc định database/backups), rồi bổ sung cột/bảng. Không DROP/TRUNCATE hoặc sửa các trường đơn cũ. MySQL DDL không rollback nguyên khối: nếu gián đoạn, kiểm tra backup và lỗi; runner kiểm tra cột/bảng đã tạo để có thể chạy lại. Đánh dấu migration chỉ sau khi các bước hoàn tất. Snapshot trước migration là bản bảo vệ vận hành, không tự xuất hiện trong danh sách backup_records của giao diện; phục hồi bản này cần quy trình kiểm tra vào schema cách ly.

Tài khoản cũ được giữ role và trạng thái Active. Staff cũ có permissions NULL được giữ các quyền nghiệp vụ mặc định; đăng ký mới luôn Pending + danh sách quyền rỗng. Chỉ CLI `user:create` dành cho người quản trị máy chủ được phép tạo tài khoản đã duyệt trực tiếp; không phải API đăng ký công khai.

Cài mới trên database rỗng vẫn dùng db:init: schema.sql chứa cả phiên bản 001 và 002. Các file 001_initial.sql, 002_user_access.sql lưu lịch sử cấu trúc; không tự chạy cả hai bằng tay trên DB đang có dữ liệu.

Sau migration, build lại BE Docker:

```bash
docker compose -f docker/compose.backend.yml up -d --build
```

Khởi động lại FE. /health/ready phải trả Healthy. Khi BE chạy Node, dừng/chạy lại tiến trình để nạp mã mới.

## Thiết lập Google / Gmail

Đây là **đăng nhập bằng tài khoản Google**, chỉ yêu cầu openid/email/profile. Ứng dụng không đọc hoặc gửi thư trong Gmail.

1. Vào Google Cloud / Google Auth Platform, tạo/chọn project thuộc quyền của bạn.
2. Thiết lập consent screen/Branding và Audience. Nếu app ở chế độ Testing, thêm email người thử vào Test users.
3. Tạo OAuth client loại **Web application** trong Clients / Khách hàng. Không dùng API key hoặc Service Account thay cho OAuth client. Sau khi tạo, lấy Client ID đầy đủ từ trang chi tiết client (kết thúc bằng `.apps.googleusercontent.com`), không dùng chuỗi rút gọn ở danh sách. Client Secret chỉ xem/tải đầy đủ khi tạo; lưu ngay hoặc lấy trường `client_secret` trong JSON đã tải. Nếu chưa lưu, dùng Client secrets → Add secret nếu có để tạo thêm và lưu secret mới. Không dùng chuỗi bị che. [Hướng dẫn Google](https://support.google.com/cloud/answer/15549257?hl=en).
4. Đăng ký Authorized redirect URI chính xác:

   ```text
   http://127.0.0.1:5173/api/auth/google/callback
   ```

   Callback đi qua proxy của FE, nên dùng được khi BE ở cổng 5000 (Node) hoặc 5002 (Docker). Dùng nhất quán 127.0.0.1; localhost là một địa chỉ khác và cần cấu hình riêng nếu chọn nó.
5. Điền trong backend/.env:

   ```dotenv
   GOOGLE_CLIENT_ID=client_id_cua_ban
   GOOGLE_CLIENT_SECRET=client_secret_cua_ban
   GOOGLE_REDIRECT_URI=http://127.0.0.1:5173/api/auth/google/callback
   FRONTEND_URL=http://127.0.0.1:5173
   ```

   Thay chữ mẫu client_id_cua_ban/client_secret_cua_ban bằng giá trị thật; không tạo dòng khóa trùng. Giữ CORS_ORIGINS có http://127.0.0.1:5173 và JWT_SECRET ít nhất 32 ký tự. Frontend URL và callback phải cùng origin; cấu hình sẽ báo chưa sẵn sàng nếu không khớp. Secret chỉ ở BE, không dùng VITE_GOOGLE_CLIENT_SECRET.
6. BE Node: khởi động lại. BE Docker: `docker compose -f docker/compose.backend.yml up -d --force-recreate backend` để nạp env mới (sau khi đã build image có mã mới).
7. Tải lại FE, nút **Tiếp tục với Google / Gmail** sẽ bật. Kiểm tra `/api/auth/providers` qua FE để xem google.enabled. Cờ này chỉ xác nhận cấu hình bật, không kiểm chứng credential với Google. Thử đăng nhập qua Chrome/Safari thông thường; trình duyệt nhúng có thể bị Google chặn.
8. Lần Google đầu tiên vẫn cần quản lý duyệt. Sau khi duyệt, dùng cùng tài khoản Google để đăng nhập lại.

Khi dùng Gateway cổng 8080, đổi FRONTEND_URL và GOOGLE_REDIRECT_URI sang origin Gateway thực tế rồi đăng ký đúng callback đó trong Google Console. Production dùng HTTPS, NODE_ENV=production và domain/CORS thực tế. Không đưa Client Secret lên Git hoặc gửi vào chat.

Nếu email đã có tài khoản mật khẩu, hệ thống **không tự liên kết Google dựa vào email**: đăng ký local chưa có cơ chế xác minh email nên tự gộp có thể gây chiếm tài khoản. Khi gặp ACCOUNT_LINK_REQUIRED, dùng mật khẩu đã có. Chưa có màn hình liên kết hai phương thức cho cùng tài khoản; có thể bắt đầu bằng Google ngay từ lần đăng ký đầu, rồi chờ duyệt.

Luồng server dùng thư viện Google chính thức để kiểm tra ID token (chữ ký, issuer/audience và hạn token), kiểm tra nonce/email_verified, state gắn với cookie HttpOnly và PKCE. Cookie OAuth SameSite=Lax riêng cho callback; session ứng dụng vẫn SameSite=Strict. State dùng một lần được ghi trong MySQL để chặn phát lại giữa nhiều BE. Không lưu access/refresh token của Google vào DB hoặc trình duyệt.

## API bổ sung

| Method | Endpoint | Quyền |
|---|---|---|
| POST | /api/auth/register | Công khai; luôn Pending Staff |
| GET | /api/auth/providers | Công khai; trạng thái cấu hình Google |
| GET | /api/auth/google | Bắt đầu OAuth, có giới hạn tần suất |
| GET | /api/auth/google/callback | Callback OAuth có state/PKCE/nonce |
| POST | /api/admin/users | Quản lý; username, full_name, email, password, permissions, note; tạo Staff Active và ghi lịch sử |
| GET | /api/admin/users | Quản lý; page, limit, status, search |
| GET | /api/admin/users/permissions | Quản lý; danh sách quyền có thể cấp |
| PATCH | /api/admin/users/:id/access | Quản lý; version, role Admin/Staff, account_status Active/Rejected/Suspended, permissions, note |
| GET | /api/admin/users/:id/history | Quản lý; lịch sử xét duyệt |
| GET | /api/products | products.read; page, limit, search |
| POST | /api/products | products.create; sku, name, unit_price, description |
| GET | /api/transactions | transactions.read; page, limit, search, status |

## Kiểm thử và giới hạn

Test mặc định kiểm tra đăng ký không tự nâng quyền, chặn Pending/Suspended, phân quyền ở API, không tự đổi quyền quản lý, state/PKCE/nonce và dữ liệu sản phẩm. Integration test chạy trên MySQL riêng, kiểm tra duyệt/cấp quyền/thu hồi session, Google account mới chờ duyệt, chống tự liên kết email, backup/restore các bảng mới, migration giữ dữ liệu và xung đột hai quản lý. Đây không thay thế đăng nhập Google thật bằng OAuth client của chủ dự án.

Google Client ID/Secret không có trong source; nếu chưa cấu hình, nút Google bị tắt và API thông báo Not Configured. Trên máy phát triển ngày 30/10/2026 đã nạp credential OAuth riêng và kiểm tra google.enabled=true/readiness Healthy. Chưa xác nhận E2E đăng nhập Google thật; credential không nằm trong source và không áp dụng tự động cho máy clone.

Tài liệu chính thức: [Google OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect), [OAuth Web Server](https://developers.google.com/identity/protocols/oauth2/web-server).
