# Xem lịch sử khi Monitoring mất kết nối

Backend lưu snapshot cuối, các sự cố đo và các lần chuyển trạng thái vào bảng monitoring_history trong database backend đang dùng. Khi Windows hoặc tunnel tắt, trang giám sát lấy dữ liệu từ kho này. Trạng thái hiện tại là Unknown/Chưa xác định; bộ đếm dừng và không cho lưu mốc vào Monitoring đã offline. Số đo đã hoàn tất, timeline và lịch sử chuyển trạng thái vẫn xem được.

Backend đang chạy đồng bộ mỗi 30 giây khi có MONITOR_TOKEN, và khi Admin mở/làm mới trang giám sát. Nếu hosting cho backend ngủ thì tác vụ nền không chạy; không hứa thu thập được lúc backend ngủ hoặc cả Monitoring bị tắt. Khi kết nối lại, các log Monitoring còn giữ được đưa vào archive. Archive không xóa bản cũ nếu Monitoring restart và trả lịch sử rỗng.

## Cập nhật

1. Chạy migration 007_monitoring_history bằng `npm run db:migrate -w backend` với đúng cấu hình database. Aiven order_management đã được tạo bảng này trong lần cập nhật 23/11/2026. Database/replica khác cần áp dụng migration hoặc nhận DDL qua replication phù hợp.
2. Cập nhật backend Primary và Standby, khởi động lại. Cập nhật giao diện trên Gateway.
3. Bật Windows Monitoring/tunnel, xác nhận trang nhận được dữ liệu live ít nhất một lượt và không có cảnh báo archive_error.
4. Tắt tunnel Monitoring. Làm mới trang: phải thấy “Đang xem lịch sử lưu trên database”, thời điểm cuối, trạng thái hiện tại chưa xác định và các lần đo vẫn còn.
5. Bật lại: trang trở về Live, lịch sử trước vẫn giữ và các bản ghi trùng ID được cập nhật, không nhân đôi.

Đây là lịch sử trạng thái/kết quả kiểm tra HTTP từ Monitoring, không phải lịch sử gói tin hoặc chứng minh trực tiếp mạng vật lý giữa hai máy. Khi toàn bộ web/Aiven không truy cập được thì trang cũng không lấy được archive.

## Lưu trữ và vận hành

Archive dùng ID của sự cố/sự kiện để upsert; phiên bản theo checked_at của Monitoring. Phản hồi poll cũ không ghi đè phiên bản mới đã lưu. Cần đồng bộ đồng hồ trên các host. UI tải tối đa 1000 lần đo và 200 chuyển trạng thái gần nhất; bảng vẫn giữ các bản cũ hơn.

Các bản ghi chỉ được lấy từ endpoint Monitoring có xác thực; UI/API vẫn yêu cầu Admin. Không lưu MONITOR_TOKEN vào archive. Dữ liệu lịch sử là ghi chú/số đo hiện có từ Monitoring, có thể chứa thông tin vận hành nên giữ quyền database phù hợp.

monitoring_history được giữ nguyên khi dùng chức năng khôi phục dữ liệu đang sử dụng, giống nhật ký backup/restore; không trở về mốc backup cũ. Bản backup nghiệp vụ hiện không sao lưu bảng archive; bảo vệ riêng bằng backup database đầy đủ nếu cần bảo toàn qua sự cố Aiven.

Kiểm thử: `npm test -w backend`. Kiểm thử MySQL riêng với `RUN_HISTORY_INTEGRATION=1 TEST_HISTORY_PORT=<port> node --test backend/tests/monitoringHistory.integration.test.js`. Không chạy kiểm thử opt-in trên database vận hành.
