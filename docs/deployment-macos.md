# Triển khai macOS

Theo 16 bước README cho development. Không thay đổi Docker network hoặc cấu hình MySQL đang tồn tại tự động.

## Docker ứng dụng

1. Kiểm tra Engine/container/volume/cổng và quyền tài khoản thực tế. Backend container kết nối qua cổng MySQL publish bằng `host.docker.internal:3306`; kiểm tra MySQL bind/grants cho kết nối từ Docker VM. Không dùng localhost trong Backend container. Không mở MySQL ra mạng công cộng.
2. Tạo `.env` gốc từ `.env.example`, điền secret; `.env` này riêng với backend/.env. Đặt DB_HOST theo cấu hình đã kiểm tra, JWT_SECRET >=32, MONITOR_TOKEN >=32. Chỉ một Primary chạy lịch backup.
3. Schema và người dùng phải khởi tạo theo README trước; Compose không tự ghi schema.
4. `docker compose --env-file .env -f docker/compose.app.yml config --quiet` để kiểm tra cú pháp; tránh in config mở rộng vì có secret.
5. `docker compose --env-file .env -f docker/compose.app.yml up --build -d` chỉ tạo ứng dụng. Mở http://localhost:8080. Chế độ production đặt Secure cookie; cần HTTPS reverse proxy ở môi trường triển khai thực, cấu hình CORS tương ứng. Localhost có thể được trình duyệt coi là nguồn tin cậy; kiểm chứng cookie trên trình duyệt đang dùng.
6. Kiểm tra readiness, login, CRUD, backup. Backup volume là `omdrs_app_backups`, không phải mysql_data. Cần chủ động sao chép bản backup sang máy/ổ khác theo chính sách bảo mật.
7. Script crash chỉ dừng backend-primary thuộc project omdrs, phục hồi khi thoát script. Chỉ chạy trong lab ứng dụng riêng.

## Giới hạn production

Cấu hình Nginx đi kèm phục vụ HTTP cho lab. Trước khi mở LAN/Internet: TLS termination, firewall, quyền MySQL tối thiểu, tách worker backup/credential restore, secret management, log rotation, giám sát ngoài máy, kiểm thử backup và tải thực tế. Không dùng cấu hình lab làm bằng chứng nghiệm thu production/HA.
