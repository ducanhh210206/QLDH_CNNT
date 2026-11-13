# Recovery Metrics trong lúc chuyển máy

Mục 3 mặc định chọn **Tự động — sự cố mới nhất**. Có thể chọn sự cố lịch sử bằng tay; chọn lại Tự động để theo dõi lần tiếp theo. Bộ đếm hiển thị cập nhật mỗi giây, còn các lần kiểm tra máy vẫn theo chu kỳ Monitoring (mặc định 10 giây).

- Khi Primary chuyển Healthy sang Offline/Unhealthy, Monitoring tạo một sự cố mới kể cả khi sự cố cũ còn thiếu mốc xác nhận. Lịch sử cũ được giữ, không tự điền recovered.
- Khi quan sát Gateway chuyển Primary sang Standby trong lúc Primary vẫn Healthy, có thể ghi nhận lần chuyển tuyến riêng. Không suy diễn đây là sự cố mất điện hay biết chính xác giờ bắt đầu lỗi.
- Khi Primary Healthy và Gateway trở lại Primary, kết thúc theo dõi lần cũ; đây không phải bằng chứng giao dịch đã phục hồi hoặc dữ liệu đã đối chiếu.
- Monitoring phải đang chạy và quan sát được chuyển trạng thái. Không tái dựng thời gian đã bỏ lỡ khi Monitoring tắt, không tạo mốc quá khứ giả sau nâng cấp.

Phần **thời gian quan sát** chạy từ lúc ghi nhận sự cố đến khi Gateway quan sát Standby Healthy rồi dừng. Hai mốc trong cùng lượt kiểm tra có thể cho kết quả 0 giây; không có nghĩa failover thực tế tức thời. Đây không phải RTO xác nhận và không chứng minh database được phép ghi.

RTO và thời gian failover có bộ đếm đang đo nếu đã nhập mốc bắt đầu tương ứng. Chốt kết quả khi có mốc kết thúc. RPO và thời gian phát hiện vẫn cần bằng chứng thời điểm bắt đầu lỗi/dữ liệu đã đối chiếu. Không lấy replication lag làm RPO. Dữ liệu Monitoring cũ hoặc mất kết nối sẽ tạm dừng bộ đếm trực tiếp.

## Cập nhật trên Windows

Tại thư mục dự án, pull đúng nhánh đang sử dụng (main và gateway-render-demo đều có bản cập nhật này):

```powershell
git pull --ff-only
```

Dừng đúng tiến trình Monitoring bằng Ctrl+C rồi khởi động lại:

```powershell
npm run dev -w monitoring
```

Giữ nguyên monitoring/.env và thư mục monitoring/data; không xóa nhật ký. Nếu dùng Docker để chạy Monitoring, rebuild/recreate đúng service Monitoring thay vì chạy thêm một tiến trình trùng cổng. Gateway Docker Windows cũng cần build lại frontend:

```powershell
docker compose --env-file gateway/.env -f docker/compose.gateway-windows.yml up -d --build gateway
```

Nhánh Render cần triển khai bản frontend mới. Nâng cấp mỗi frontend sẽ không sửa cách Monitoring trên Windows chia các sự cố. Sau nâng cấp, kiểm chứng bằng một lần chuyển có kiểm soát theo Runbook; số liệu sự cố lịch sử thiếu bằng chứng không tự thành số đo thực tế.
