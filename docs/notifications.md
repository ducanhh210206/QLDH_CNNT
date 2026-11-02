# Thông báo trong ứng dụng

Sau khi đăng nhập, bấm chuông trên thanh đầu trang. Số đỏ là số chưa đọc trong tối đa 100 sự kiện gần nhất của 90 ngày. Danh sách hiển thị 20 mục mỗi trang, tự cập nhật mỗi 15 giây khi trang đang mở.

- Người có quyền xem đơn nhận thông báo tạo đơn và đổi trạng thái đơn.
- Quản lý xem thêm tài khoản mới/chờ duyệt, lịch sử cấp quyền và kết quả sao lưu/phục hồi thành công hoặc thất bại.
- Nhân viên chỉ xem lịch sử thay đổi quyền của chính mình và sự kiện phù hợp quyền hiện tại.

Bấm một thông báo để đánh dấu đọc và mở trang liên quan; tài khoản chờ duyệt mở đúng bộ lọc Pending. Nút dấu tích chỉ đánh dấu đọc. **Đọc tất cả** áp dụng cho toàn bộ sự kiện đang được phép xem trong giới hạn 100 mục, kể cả các trang khác. Trạng thái đọc lưu trong MySQL theo từng người, giữ lại khi đăng xuất/đăng nhập. Đọc trên một tài khoản không ảnh hưởng tài khoản khác.

Đây là thông báo bên trong website; chưa gửi email hay thông báo đẩy của trình duyệt. Danh sách được tổng hợp từ bản ghi nghiệp vụ đã lưu, không phụ thuộc bộ nhớ của một máy BE.

## Database và chạy thử

Từ thư mục gốc chứa package.json, database cũ chạy:

```bash
npm ci
npm run db:migrate
```

Runner tạo SQL snapshot + SHA-256 trước nâng cấp và thêm migration 003_notifications. Không chạy db:init lại trên database đang có dữ liệu. Sau đó khởi động lại BE Node hoặc build lại image BE Docker theo README. Database mới dùng db:init, đã gồm schema 001/002/003.

Với Aiven dùng cấu hình riêng: `node --env-file=backend/.env.hosting scripts/migrate-db.js`. File riêng phải chứa đúng host, port, user, password, schema và CA; không commit file đó.

Backup mới bao gồm bảng notification_reads (13 bảng). Restore vẫn kiểm tra được backup cũ không có bảng này (12 bảng). Restore tạo schema cách ly để xác minh, không tự chuyển database đang chạy sang bản phục hồi.

## API

Các endpoint đều yêu cầu phiên đăng nhập hợp lệ.

| Endpoint | Công dụng |
|---|---|
| GET /api/notifications?page=1&limit=20 | Danh sách được phép xem, total và unread_count. |
| POST /api/notifications/:id/read | Đánh dấu một sự kiện đang được phép xem; body {}. |
| POST /api/notifications/read-all | Đánh dấu toàn bộ sự kiện được phép xem; body {}. |

API không nhận user_id từ client; người đọc lấy từ phiên đăng nhập.
