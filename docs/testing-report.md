# Báo cáo kiểm thử và nghiệm thu

## Cập nhật ngày 30/10/2026 — quản lý cấp tài khoản

- **33/33 kiểm thử đạt**, không bỏ qua, gồm MySQL và migration trên container riêng. Tài khoản do Quản lý tạo là Staff/Active, đăng nhập ngay bằng mật khẩu và chỉ dùng các quyền đã chọn.
- Đã kiểm tra từ chối nhân viên gọi API tạo tài khoản, từ chối role/trạng thái tự gửi, mật khẩu ngắn, quyền quản trị và quyền thiếu điều kiện xem; kiểm tra lại quyền Quản lý trong transaction khi có thay đổi đồng thời.
- Trùng username/email trả 409, không ghi đè. Mật khẩu được băm, không trả về hoặc ghi trong lịch sử; tài khoản và lịch sử được ghi trong một transaction. Backup/restore chứa bản ghi cấp tài khoản mới đã đối chiếu thành công.
- Danh sách tài khoản mặc định Active, hiển thị thông tin và quyền cấp, ngày tạo/cập nhật quyền và ghi chú. Đã kiểm tra hiển thị hai tài khoản thử, mở danh sách quyền và mở lại biểu mẫu tạo tài khoản. Ảnh: [tài khoản đã cấp](issued-accounts-preview.png).
- Build FE đạt. Đã mở biểu mẫu trên trình duyệt của bản chạy riêng, xác nhận trường thông tin/mật khẩu/quyền. Không tạo tài khoản thật trong database đang dùng. Ảnh: [biểu mẫu cấp tài khoản](create-staff-preview.png).
- Hướng dẫn và API cập nhật trong [phân quyền](auth-permissions.md) và README. Không cần schema mới ngoài 002. Chưa có email bàn giao tự động hoặc bắt buộc đổi mật khẩu lần đầu.

## Cập nhật ngày 29/10/2026 — phân quyền và xét duyệt

Kết quả mới dưới đây bổ sung cho báo cáo lịch sử ngày 26/10 ở phía sau; các mục NOT TESTED cũ phản ánh thời điểm cũ.

- **31/31 kiểm thử đạt**, không bỏ qua: unit/HTTP, MySQL tích hợp và migration. Chạy trên container MySQL 8.4 riêng; container đã dừng sau kiểm thử, dữ liệu kiểm thử giữ trong volume riêng.
- Đã kiểm tra đăng ký luôn Staff/Pending, không tự cấp quyền; đăng nhập trước duyệt bị từ chối; quản lý duyệt/cấp từng quyền; nhân viên bị chặn API quản trị; tạm khóa/đổi quyền thu hồi phiên; hai quản lý thay đổi quyền đồng thời vẫn giữ quản lý hoạt động.
- Đã kiểm tra tài khoản Google mới chờ duyệt, không tự gộp theo email, state/nonce/PKCE và dữ liệu sản phẩm. **Chưa đăng nhập Google thật** vì chủ dự án chưa cấu hình OAuth Client ID/Secret.
- Backup/restore tích hợp xác minh dữ liệu của cả 12 bảng. Migration 001 → 002 chạy lại được và giữ nguyên tài khoản/đơn cũ.
- Giao diện trình duyệt kiểm tra thực tế ở localhost:5180, dùng database và tài khoản thử riêng: đăng ký → chờ duyệt → quản lý cấp quyền → nhân viên đăng nhập → chỉ có menu được cấp → thêm sản phẩm thành công. Tên tiếng Việt và giá 12.000 ₫ hiển thị đúng. Ảnh: [xét duyệt](access-approval-preview.png), [menu nhân viên](staff-permissions-preview.png).
- `npm run build` đạt; CSS 27,24 KB, JS 260,84 KB trước gzip.
- Database cục bộ đang dùng đã được nâng cấp 002 sau khi tạo SQL snapshot bảo vệ + SHA-256. Đối chiếu đơn hàng và các trường tài khoản cũ trước/sau trùng khớp. Backend Docker có readiness Healthy sau nâng cấp.
- Google hiện trả `google.enabled=false` cho đến khi có cấu hình riêng. Xem [hướng dẫn cấu hình và sử dụng](auth-permissions.md).

## Báo cáo lịch sử ngày 26/10/2026

Ngày: **26/10/2026**, múi giờ Việt Nam. Đây là kết quả chạy thật trong phiên xây dựng, không phải cam kết đã vận hành production.

## Kết quả lệnh đã chạy

- `npm install`: thành công; có package-lock.json và phiên bản dependency cố định.
- npm báo **0 vulnerabilities** sau khi cập nhật concurrently 9.2.5, mysql2 3.24.6, express-rate-limit 8.7.1, zod 4.6.7. Kết quả advisory tại thời điểm cài; không thay thế đánh giá bảo mật vận hành.
- `npm run build`: **PASS**, Vite 8.3.5, React 19.2.0; CSS khoảng 25 KB và JS khoảng 240 KB trước gzip.
- `npm test`: **16 PASS, 0 FAIL, 1 SKIP**. Kiểm thử HTTP cần quyền mở cổng localhost; lần đầu sandbox chặn cổng, đã chạy lại có quyền và đạt. Không sửa test để bỏ qua lỗi.
- 29 tệp JS máy chủ/script qua `node --check`; shell qua kiểm tra cú pháp, script ZIP qua Python AST.
- Hai cấu hình Docker Compose qua `config --quiet`, dùng env.example và giá trị placeholder chỉ cho xác thực cấu hình; chưa build image hoặc chạy container. Compose app kiểm tra với OMDRS_ENV_FILE=../.env.example.
- Frontend thực tế tại cổng 5173 trả HTTP 200; Backend liveness cổng 5000 trả Healthy; readiness trả HTTP 503/Unhealthy khi không có MySQL.
- Monitoring là process riêng cổng 5001, liveness trả Healthy; JSONL ghi thực tế chuyển Unknown → Offline → Unhealthy của Backend trong lúc khởi động. Token nội bộ chưa cấu hình nên không tuyên bố đã kiểm chứng toàn bộ luồng System Dashboard có xác thực.
- Giao diện đăng nhập được quan sát trên trình duyệt với layout hai cột tại độ rộng desktop và tablet; mở được hướng dẫn thiết lập lần đầu. Ảnh: login-preview.png. Chưa kiểm tra tương tác dashboard sau đăng nhập hoặc thiết bị điện thoại thật.

## Phạm vi 16 kiểm thử đạt

1. Chuẩn hóa đơn hàng, trạng thái mặc định, bảo toàn chuỗi tiền thập phân.
2. Từ chối số lượng/tiền/tên/trạng thái không hợp lệ.
3. Giới hạn phân trang và enum sắp xếp để chặn SQL tùy ý.
4. Trạng thái terminal và version conflict.
5. Phát hiện bản ghi thiếu, thay đổi và thay thế dù tổng số bằng nhau.
6. Password hash có salt và kiểm chứng đúng/sai.
7. Liveness độc lập MySQL.
8. API nghiệp vụ/quản trị bắt buộc đăng nhập.
9. JWT giả bị từ chối.
10. Origin không tin cậy không được ghi dữ liệu.
11. Payload login sai bị chặn trước SQL.
12. 404 có cấu trúc và request ID.
13. Readiness trả 503 khi dependency bắt buộc mất kết nối (stub DB).
14. Staff bị chặn backup (stub session DB, JWT thật).
15. Đọc đơn lỗi DB trả 503 có cấu trúc, không trả dữ liệu giả (stub DB).
16. JSON lỗi trả 400 với mã INVALID_JSON.

Các stub ở 13–15 chỉ thuộc test, không thay MySQL trong runtime. Chưa chứng minh các thao tác SQL ghi hoạt động bằng các test đó.

## Integration test chưa chạy

Test opt-in tạo schema ngẫu nhiên omdrs_test_<uuid>, giữ nguyên database thật; kiểm tra login, tạo đơn đồng thời cùng key, xung đột nội dung, cập nhật đồng thời/version, history transaction, tìm kiếm, Staff/Admin, logout, backup SQL, restore cách ly và hash tất cả bảng. Chạy `RUN_DB_INTEGRATION=1 npm test -w backend` khi có Docker/MySQL và quyền CREATE database kiểm thử. Test giữ schema test/restore để kiểm tra, không tự DROP.

Lý do SKIP: Docker Engine không phản hồi qua socket khi kiểm tra có quyền; chưa có thông tin truy cập MySQL. Chưa kiểm tra database/tài khoản/volume thật, chưa ghi bất kỳ schema hoặc bản ghi nào vào MySQL hiện có.

## Ma trận nghiệm thu

| STT | Hạng mục | Trạng thái | Bằng chứng / giới hạn |
|---|---|---|---|
| 1 | React + Vite | PASS | Build + HTTP 200 + login render thực tế |
| 2 | Express | PASS | API liveness thực tế + HTTP tests |
| 3 | MySQL Docker | NOT CONFIGURED | Engine không phản hồi; container/volume chưa xác minh |
| 4 | Tạo đơn | NOT TESTED | Có code SQL/idempotency; chưa ghi MySQL thật |
| 5 | Danh sách đơn | NOT TESTED | Có truy vấn/filter/pagination; chưa đối chiếu DB thật |
| 6 | Trạng thái và lịch sử | PARTIAL | Unit test quy tắc đạt; transaction thật chưa chạy |
| 7 | Dashboard | NOT TESTED | Có API/UI dùng dữ liệu DB; chưa có dữ liệu thật |
| 8 | Đăng nhập/phân quyền | PARTIAL | Hash/JWT/role middleware test đạt; login DB thật chưa chạy |
| 9 | Monitoring | PARTIAL | Process/liveness/JSONL Live thực tế; chưa kiểm chứng toàn bộ trang có auth |
| 10 | Backup | NOT TESTED | Có snapshot SQL, SHA-256, metadata, GET_LOCK; cần DB |
| 11 | Restore | NOT TESTED | Có target mới và đối chiếu mọi bảng; cần DB |
| 12 | Backend failover | NOT TESTED | Có hai Backend, gateway passive failover, script lab |
| 13 | Network failure | PARTIAL | Test 503 + bản nháp/idempotency trong UI; lab toàn luồng chưa chạy |
| 14 | Power outage | NOT TESTED | Có Demo/runbook; không thử mất điện vật lý |
| 15 | Data loss | PARTIAL | Bộ so sánh phát hiện thay đổi đạt; restore thật chưa chạy |
| 16 | Responsive | PARTIAL | Có breakpoints; login desktop/tablet đã quan sát; mobile thật chưa kiểm tra |
| 17 | Security | PARTIAL | 0 advisory tại thời điểm cài, auth/origin/input test đạt; chưa audit production/TLS |
| 18 | Documentation | PASS | README và tài liệu API, DB, macOS, Windows, kiến trúc, runbook |
| 19 | ZIP | PASS | Gói được kiểm tra CRC và nội dung, không node_modules/.env/log/backup thật |

## Giới hạn vận hành cần xử lý trước production

- Chưa có credential/schema MySQL hoặc hai máy hoạt động; không tuyên bố HA/replication/promotion.
- Nginx OSS chỉ passive failover; không active readiness probe. Cấu hình lab HTTP cần TLS trước khi public.
- Backup/restore synchronous phù hợp dữ liệu nhỏ, cần worker bền vững khi mở rộng. Dữ liệu backup cần bản sao ngoài máy; PITR chưa triển khai.
- Scheduled backup chỉ một Primary. GET_LOCK bảo vệ giữa instance dùng cùng MySQL; snapshot không hỗ trợ DDL chạy đồng thời.
- Job Running có thể còn lại nếu process bị dừng đột ngột; kiểm tra log/tệp/schema cách ly trước khi thử lại. Schema cách ly không tự dọn.
- Log monitoring chưa xoay vòng tự động; session hết hạn chưa có job dọn. Cần chính sách lưu trữ khi vận hành lâu dài.
- RTO/RPO chưa đo, giữ null. Thời gian restore riêng không được coi là RTO hệ thống.
