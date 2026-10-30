# API

Cùng origin qua Vite/Nginx, JSON UTF-8. Login đặt cookie `omdrs` HttpOnly; các API còn lại cần cookie. Lỗi: `{error:{code,message,request_id}}`. 400 dữ liệu sai; 401 chưa đăng nhập; 403 sai quyền; 404 không tồn tại; 409 xung đột; 503 MySQL không sẵn sàng.

| Method | Endpoint | Quyền / dữ liệu |
|---|---|---|
| POST | /api/auth/login | username, password; rate limit 10/15 phút |
| POST | /api/auth/logout | User; thu hồi session |
| GET | /api/auth/me | User |
| GET | /api/orders | User; page, limit 1–100, status, search, sort asc/desc |
| POST | /api/orders | User; Idempotency-Key 16–100 ký tự; customer_name, product_name, quantity, total_amount, status. 201 mới; 200 replay |
| GET | /api/orders/:id | User; UUID |
| PATCH | /api/orders/:id/status | User; status Completed/Cancelled, version số nguyên |
| GET | /api/orders/:id/history | User |
| GET | /api/dashboard/summary | User; total, revenue, pending/completed/cancelled |
| GET | /api/dashboard/order-statistics | User; số đơn theo ngày trong 30 ngày UTC |
| GET | /health/live | Public; process liveness |
| GET | /health/ready | Public; dependency readiness, 200/503 |
| GET | /api/admin/system/status | Admin; backend, monitor components/events |
| GET | /api/admin/system/metrics | Admin; uptime, memory thực tế |
| GET | /api/admin/incidents | Admin; nhật ký mô phỏng DB |
| GET | /api/admin/incidents/:id | Admin |
| POST | /api/admin/simulations | Admin; type Power Outage/Server Crash/Network Failure/Data Loss; chỉ Demo |
| GET | /api/admin/backups | Admin |
| POST | /api/admin/backups | Admin; snapshot SQL nhất quán |
| POST | /api/admin/restores | Admin; backup_id, confirmation=RESTORE_TO_ISOLATED_DATABASE |
| GET | /api/admin/restores/:id | Admin; báo cáo theo ID |

System/status trả các sự kiện Live từ tiến trình monitoring riêng; API incidents không nhập lại những sự kiện đó thành dữ liệu mô phỏng. Không có API thực thi lệnh shell. Không có API xóa dữ liệu hoặc promotion database.

Backup/restore hiện chạy đồng bộ trong request. Giới hạn thiết kế cho đồ án/dữ liệu nhỏ; production cần worker bền vững, trạng thái job, cơ chế nhận lại kết quả khi timeout và phân trang nhật ký lâu dài. Request mất kết nối không chứng minh tác vụ đã dừng: xem backup list/restore record và log trước khi chạy lại.

## Phân quyền và OAuth (schema 002)

Xem [API, quyền chức năng, duyệt nhân viên và Google OAuth](auth-permissions.md). Admin được hiển thị là Quản lý, Staff là Nhân viên. API auth/me trả permissions/account_status; mọi API nghiệp vụ yêu cầu tài khoản Active và đúng quyền.
