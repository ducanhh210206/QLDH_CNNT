# Chuyển sang Windows / WSL2

1. Giải nén ZIP vào filesystem Linux trong WSL2 (tránh thư mục đồng bộ cloud). Cài Docker Desktop với tích hợp WSL2 và Node 24 LTS nếu chạy Node trực tiếp; không mặc định máy đã có.
2. Trong WSL chạy `node -v`, `npm -v`, `docker version`. Dùng `npm ci` từ lockfile; không mang node_modules từ macOS sang Windows.
3. Tạo backend/.env và monitoring/.env như README. Nếu ứng dụng ở máy khác MySQL, thay DB_HOST bằng IP/DNS đã được kiểm tra; chỉ mở cổng 3306 cho IP tin cậy qua firewall/TLS. Không giả định 127.0.0.1 là máy Mac.
4. Nếu dùng database mới, kiểm tra tên/quyền, chỉ khởi tạo database rỗng. Không dùng mật khẩu ví dụ, không đưa secret vào Git/ZIP.
5. Trong Bash nhập password không ghi history: `read -s -p 'Password: ' NEW_PASSWORD`, `export NEW_PASSWORD`; cung cấp NEW_USERNAME, chạy `npm run user:create`, rồi `unset NEW_PASSWORD`.
6. Chạy các lệnh Backend/Frontend/Monitoring như README; truy cập bằng localhost forwarding WSL2 nếu đã bật.
7. Hoặc dùng Docker Compose ứng dụng sau khi cấu hình DB_HOST phù hợp với topology thật. Đường dẫn bind mount cấu hình Standby tương đối với compose file.

## Standby database lab riêng

Standby của nhóm dùng cấu hình [runbook chuyển đổi](../database-deliverables/05_CHUYEN_DOI/huong-dan-chuyen-doi.md), container và volume riêng trên máy Phúc, với cổng `127.0.0.1:3308`. Cần mật khẩu root riêng và chứng chỉ CA Aiven tại đường dẫn được cấu hình. Không dùng cấu hình Standby để thay Primary hiện có nếu chưa thực hiện quy trình chuyển đổi.

Replication Aiven → Standby đã được thử trong môi trường của nhóm. Trên máy hoặc môi trường mới vẫn phải xác minh snapshot, GTID, tài khoản replication, TLS, kết nối và độ trễ theo runbook. Không đồng thời bật ghi hai DB; kiểm chứng triển khai liên máy trước khi tuyên bố HA.
