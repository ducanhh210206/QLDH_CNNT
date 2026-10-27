# Chuyển sang Windows / WSL2

1. Giải nén ZIP vào filesystem Linux trong WSL2 (tránh thư mục đồng bộ cloud). Cài Docker Desktop với tích hợp WSL2 và Node 24 LTS nếu chạy Node trực tiếp; không mặc định máy đã có.
2. Trong WSL chạy `node -v`, `npm -v`, `docker version`. Dùng `npm ci` từ lockfile; không mang node_modules từ macOS sang Windows.
3. Tạo backend/.env và monitoring/.env như README. Nếu ứng dụng ở máy khác MySQL, thay DB_HOST bằng IP/DNS đã được kiểm tra; chỉ mở cổng 3306 cho IP tin cậy qua firewall/TLS. Không giả định 127.0.0.1 là máy Mac.
4. Nếu dùng database mới, kiểm tra tên/quyền, chỉ khởi tạo database rỗng. Không dùng mật khẩu ví dụ, không đưa secret vào Git/ZIP.
5. Trong Bash nhập password không ghi history: `read -s -p 'Password: ' NEW_PASSWORD`, `export NEW_PASSWORD`; cung cấp NEW_USERNAME, chạy `npm run user:create`, rồi `unset NEW_PASSWORD`.
6. Chạy các lệnh Backend/Frontend/Monitoring như README; truy cập bằng localhost forwarding WSL2 nếu đã bật.
7. Hoặc dùng Docker Compose ứng dụng sau khi cấu hình DB_HOST phù hợp với topology thật. Đường dẫn bind mount cấu hình Standby tương đối với compose file.

## Standby database lab riêng

`docker/compose.standby.yml` chỉ là mẫu opt-in trên máy Standby: cần STANDBY_ROOT_PASSWORD riêng và profile standby-lab. Volume standby_lab_data khác mysql_data, cổng 3307. Không chạy mẫu này để thay Primary hiện có. Image MySQL 8.4.13 phải được registry hỗ trợ trên kiến trúc đích; chưa pull/build ở phiên làm việc này.

Replication chưa cấu hình. Cần snapshot nguồn hợp lệ, GTID, tài khoản replication với quyền tối thiểu/TLS, mạng hai chiều, kiểm tra lag và quy trình fencing/promotion thủ công được phê duyệt. Không đồng thời bật ghi hai DB. Kiểm chứng triển khai liên máy trước khi tuyên bố HA.
