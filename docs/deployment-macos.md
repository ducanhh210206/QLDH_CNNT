# Triển khai macOS

Theo các mục 1–9 của README cho development; chọn mục 7 để chạy BE Node hoặc mục 14 để chạy riêng BE Docker. Không thay đổi Docker network hoặc cấu hình MySQL đang tồn tại tự động.

## Docker ứng dụng

1. Kiểm tra Engine/container/volume/cổng và quyền tài khoản thực tế. Backend container kết nối qua cổng MySQL publish bằng `host.docker.internal:3306`; kiểm tra MySQL bind/grants cho kết nối từ Docker VM. Không dùng localhost trong Backend container. Không mở MySQL ra mạng công cộng.
2. Tạo `.env` gốc từ `.env.example`, điền secret; `.env` này riêng với backend/.env. Đặt DB_HOST theo cấu hình đã kiểm tra, JWT_SECRET >=32, MONITOR_TOKEN >=32. Chỉ một Primary chạy lịch backup.
3. Schema và người dùng phải khởi tạo theo README trước; Compose không tự ghi schema.
4. `docker compose --env-file .env -f docker/compose.app.yml config --quiet` để kiểm tra cú pháp; tránh in config mở rộng vì có secret.
5. `docker compose --env-file .env -f docker/compose.app.yml up --build -d` chỉ tạo ứng dụng. Mở http://localhost:8080. Compose dùng NODE_ENV=development cho lab HTTP cục bộ để trình duyệt gửi cookie đăng nhập qua HTTP. Triển khai thực cần HTTPS reverse proxy, NODE_ENV=production để bật Secure cookie và cấu hình CORS tương ứng.
6. Kiểm tra readiness, login, CRUD, backup. Backup volume là `omdrs_app_backups`, không phải mysql_data. Cần chủ động sao chép bản backup sang máy/ổ khác theo chính sách bảo mật.
7. Script crash chỉ dừng backend-primary thuộc project omdrs, phục hồi khi thoát script. Chỉ chạy trong lab ứng dụng riêng.

## Giới hạn production

Cấu hình Nginx đi kèm phục vụ HTTP cho lab. Trước khi mở LAN/Internet: TLS termination, firewall, quyền MySQL tối thiểu, tách worker backup/credential restore, secret management, log rotation, giám sát ngoài máy, kiểm thử backup và tải thực tế. Không dùng cấu hình lab làm bằng chứng nghiệm thu production/HA.
