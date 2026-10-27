# Quy trình sự cố & phục hồi

## Chế độ Demo

Bốn nút mô phỏng chỉ ghi timeline có nhãn Demo vào MySQL. Tất cả timestamp là thời điểm tạo mô phỏng; không mô tả tiến trình dò lỗi thật hoặc dùng để tính RTO/RPO. Dữ liệu health Live từ Monitoring có timestamp riêng và lưu JSONL ngoài Backend.

## Backend crash — lab ứng dụng

Chạy hai Backend dùng chung database, Gateway và Monitor từ compose.app. Ghi snapshot bằng backup trước thử nghiệm. Chạy `OMDRS_LAB_CONFIRM=backend-only bash scripts/simulate-backend-crash.sh`. Script dừng riêng backend-primary, kiểm tra Gateway readiness rồi đợi Enter để start lại; trap khôi phục khi script thoát. Không đụng MySQL. Xác minh instance phản hồi là standby, GET dữ liệu, tạo đơn với key cố định và xem log Monitor. Kiểm tra dữ liệu sau thử, ghi nhận phát hiện/khôi phục thực tế. Nếu cả hai Backend dùng MySQL trên máy tắt, cả hai không thể ghi.

Nginx sử dụng kiểm tra lỗi thụ động, chưa phải active health checker; failover thực tế phải được kiểm thử trước nghiệm thu. Không tự retry request ghi đã gửi tới upstream.

## Network failure

A. Browser → API: DevTools Offline, giữ bản nháp, thử gửi, xác minh không báo thành công. Online trở lại và dùng nút gửi lại cùng key/nội dung; đối chiếu một mã đơn duy nhất.

B. Backend → MySQL: chỉ ở Backend lab riêng dùng cổng DB không có dịch vụ (ví dụ 33999) và database kiểm thử. Kiểm tra ready 503 và API lỗi 503, sau đó đưa cấu hình về endpoint lab đúng và khởi động lại Backend lab; pool tự lấy kết nối mới nếu DB phục hồi sau lỗi mạng tạm thời. Không disconnect container/network MySQL thật. API không tự retry ghi; GET có thể thử lại bằng nút làm mới.

## Power outage

Dừng Backend ứng dụng chỉ mô phỏng mất dịch vụ, không tương đương mất điện vật lý. Không tắt máy chủ/mất điện thật trong phiên triển khai. Giám sát phải nằm trên máy khác nếu muốn phát hiện mất cả máy. Failover liên máy cần database standby, quorum/fencing, xác minh replication và quyền ghi duy nhất. Nếu chưa có, ghi NOT CONFIGURED, không bật ghi trên DB độc lập.

## Data loss / backup restore

1. Tạo bản sao lưu trên trang Admin. SQL và manifest có quyền 0600, thư mục 0700. Transaction nhất quán toàn bộ bảng ứng dụng, lưu checksum SQL và hash từng bảng. Không chạy migration/DDL cùng lúc. Backup chứa dữ liệu và password hash, cần bảo vệ như DB.
2. Chọn backup Success, xác nhận phục hồi cách ly. Kiểm tra checksum so với DB và manifest trước khi chạy. Tạo database mới omdrs_restore_<uuid>; không tái sử dụng tên đã có, không DROP/TRUNCATE.
3. Đối chiếu từng bản ghi orders (ID, trạng thái, thời gian, số tiền, toàn bộ trường) và hash mọi bảng ứng dụng. Report chứa missing/changed/unexpected và duration restore. Database cách ly được giữ lại để kiểm tra, không tự xóa; chỉ quản trị viên mới dọn sau đánh giá.
4. Lỗi quyền hoặc restore thất bại được ghi Failed. Có thể còn database phục hồi một phần; không dùng nó để vận hành. Nếu process chết, Running có thể còn treo; đối chiếu log và DB trước khi thử lại.
5. Chuyển dữ liệu phục hồi vào sử dụng là bước vận hành riêng cần kiểm tra, backup hiện trạng, hạn chế ghi, phê duyệt và đổi endpoint; ứng dụng không tự thực hiện.
6. Lịch backup: BACKUP_INTERVAL_HOURS>0 trên Primary duy nhất; retention dọn sau backup lịch thành công, giữ ít nhất bản Success mới nhất. Khi chỉ chạy backup thủ công, retention không tự chạy. Không có backup liên máy tự động; cần copy ra ổ/máy khác.

Không xóa dữ liệu thật để demo. Test suite chỉ tạo schema omdrs_test_<uuid> mới và để lại cho kiểm tra. Mẫu seed không tự chèn dữ liệu production.

## Đo lường

Ghi Incident Type, Started At, Detected At, Recovered At, đơn trước/sau và missing/changed/unexpected. RTO = thời gian phục hồi dịch vụ theo điểm bắt đầu sự cố được quan sát; duration của một lệnh restore không phải RTO toàn hệ thống. RPO chỉ tính khi biết giao dịch đã commit cuối trước sự cố và dữ liệu phục hồi; nếu thiếu thông tin để null/NOT TESTED. Số bản ghi bằng nhau chưa chứng minh toàn vẹn. Replication không thay backup; PITR chưa triển khai.
