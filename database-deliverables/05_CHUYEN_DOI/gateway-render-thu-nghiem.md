# Thử Gateway trên Render trước khi chuyển website chính

Mục tiêu: Gateway phục vụ giao diện, chọn backend Render hoặc backend trên Windows; cả hai backend dùng cùng MySQL Aiven. Việc tắt backend Render không mô phỏng mất Aiven. Gateway và Aiven vẫn là các điểm phụ thuộc chung.

## Trước khi thử

- Phối hợp thay các mật khẩu Aiven, JWT, Google client secret và token monitoring từng bị lộ. Cập nhật đồng bộ các dịch vụ và dự kiến người dùng phải đăng nhập lại nếu đổi JWT.
- Review và đưa các file Gateway, backend readiness, frontend thông báo và Dockerfile lên nhánh thử mà Render có thể đọc. Không commit `.env`, token, chứng chỉ riêng tư hay backup dữ liệu. `frontend/dist` được build trong image.
- Không thay `qldh-demo` cho tới khi Gateway thử nghiệm, đăng nhập, chuyển hướng và khôi phục đều đạt. Không tắt database hoặc xóa dữ liệu để thử backend.

## Trên máy Windows

1. Chạy `scripts/khoi-dong-backend-du-phong-aiven.ps1`; nhập riêng tài khoản Aiven và JWT giống backend chính. Nếu thử giao diện trên Render staging, truyền `-TestGatewayOrigin 'https://TEN-GATEWAY-THU.onrender.com'`. Kiểm tra `http://127.0.0.1:5000/health/ready`: `instance=standby`, `shared_database_verified=true`, UUID là Aiven.
2. Tạo token ngẫu nhiên 32 byte / 64 ký tự hex bằng công cụ mật mã; giữ bí mật. Nhập cùng token vào `scripts/khoi-dong-cau-noi-api.ps1` và biến Render `GATEWAY_STANDBY_TOKEN`; không dán vào chat hoặc chụp ảnh. Đổi token sau khi hoàn tất thử.
3. Với một cửa sổ PowerShell riêng, chạy cloudflared quick tunnel tới `http://127.0.0.1:5052`. Giữ tiến trình chạy; URL `https://...trycloudflare.com` là URL cầu nối API, không phải tunnel health-only cổng 5051. Quick tunnel chỉ dùng thử; URL có thể đổi khi khởi động lại. Không mở cổng MySQL ra Internet.
4. Không có token, truy cập `/health/ready` qua tunnel API phải trả 401. Tự kiểm tra token hợp lệ bằng công cụ HTTP mà không đưa token vào URL, lịch sử shell hay ảnh; bảo vệ token ở cả hai đầu.

## Tạo Gateway thử nghiệm

Tạo một Render Web Service thử riêng từ nhánh đã review, runtime Docker, root trống, Dockerfile `docker/Dockerfile.gateway-render`, health check `/gateway/live`. Cấu hình biến trong Render:

- `GATEWAY_PRIMARY_URL`: URL gốc HTTPS của backend chính riêng, ví dụ `https://backend-primary.onrender.com`; không trỏ về chính Gateway.
- `GATEWAY_STANDBY_URL`: URL gốc HTTPS của tunnel API cổng 5052.
- `GATEWAY_STANDBY_TOKEN`: token cầu nối bí mật.
- `GATEWAY_EXPECTED_DB_UUID`: UUID MySQL Aiven đã xác minh.

Chờ `/gateway/status` hiển thị primary và standby healthy, active primary. Kiểm tra đăng nhập bằng mật khẩu và đọc đơn qua URL thử. Để thử ghi từ URL thử, cả hai backend phải cho phép chính xác origin của Gateway thử trong `CORS_ORIGINS`; backend Windows dùng `-TestGatewayOrigin`. Không gửi lại một giao dịch nếu kết quả bị ngắt mà chưa đối chiếu.

Sau khi phối hợp, tạm Suspend **backend chính riêng**, không Suspend Gateway. Ghi thời gian, kiểm tra active standby, thông báo, đăng nhập và tạo một đơn kiểm thử trên cùng Aiven. Resume backend chính và xác nhận Gateway chuyển về primary. Đối chiếu đơn trên Aiven và các chỉ số thực tế; health/lag không chứng minh RPO.

Khi tất cả đạt, chuẩn bị đổi cấu hình `qldh-demo` sang Dockerfile Gateway và cập nhật đúng biến môi trường của Gateway. Đây là thay đổi website đang chạy: lưu cấu hình/commit hiện tại, thống nhất thời điểm và cách rollback với dev. Không xóa dịch vụ backend hiện tại. Đăng nhập Google và phiên cookie phải được thử riêng; không mặc định Google hoạt động sau thay đổi.

Hạn chế: `qldh-demo` vẫn phụ thuộc Render Gateway; nếu chính Gateway/Render hoặc Aiven bị lỗi thì phương án này không đảm bảo hoạt động. Tunnel tạm và máy Windows cần bật, có mạng. Cơ chế hiện tại không đảm bảo không mất yêu cầu đang xử lý và không thay thế backup.
