# Recovery Metrics trong lúc chuyển máy

Mục 3 tự theo dõi lần đo mới nhất. Mục 4 lưu lịch sử. Bấm **Xem** để đọc một lần cũ và **Theo dõi mới nhất** để quay lại. Bộ đếm cập nhật mỗi giây, còn Monitoring lấy mẫu theo chu kỳ mặc định 10 giây.

- Khi Primary chuyển Healthy sang Offline/Unhealthy, Monitoring tạo một sự cố mới kể cả khi sự cố cũ còn thiếu mốc xác nhận. Lịch sử cũ được giữ, không tự điền recovered.
- Khi quan sát Gateway chuyển Primary sang Standby trong lúc Primary vẫn Healthy, có thể ghi nhận lần chuyển tuyến riêng. Không suy diễn đây là sự cố mất điện hay biết chính xác giờ bắt đầu lỗi.
- Khi Primary Healthy và Gateway trở lại Primary, kết thúc theo dõi lần cũ; đây không phải bằng chứng giao dịch đã phục hồi hoặc dữ liệu đã đối chiếu.
- Monitoring phải đang chạy và quan sát được chuyển trạng thái. Không tái dựng thời gian đã bỏ lỡ khi Monitoring tắt, không tạo mốc quá khứ giả sau nâng cấp.

## Mỗi lần diễn tập là một bản ghi

Giữ Monitoring chạy xuyên suốt. Mỗi lần quan sát Primary từ Healthy sang Offline/Unhealthy sẽ tạo ID sự cố mới. Khi Gateway trở về Primary và Primary Healthy, phiên theo dõi cũ kết thúc. Lần lỗi tiếp theo không ghi đè phiên cũ, kể cả phiên cũ chưa có đủ mốc RTO/RPO. Không cần xóa file, tạo lại tài khoản hoặc xóa sự cố để làm lại.

Mục 4 hiển thị tổng số lần đã lưu, sắp theo **giờ phát hiện**.

Lưu bền vững trên máy chạy Monitoring tại `monitoring/data/recovery.jsonl` (hoặc MONITOR_DATA_DIR nếu cấu hình). Tất cả bản ghi được giữ qua khởi động lại; không còn cắt danh sách ở 100 sự cố. Cần giữ volume/thư mục này khi cập nhật code. Nhật ký health trong `incidents.jsonl` cũng cần được giữ. Khi nâng cấp, Monitoring có thể tạo lại các bản ghi phát hiện lỗi bị bỏ sót từ 100 chuyển trạng thái gần nhất đã lưu; không tạo trùng và không tự suy diễn giờ bắt đầu lỗi/tiếp quản/khôi phục. Khi chỉ thấy Primary Offline ở lần kiểm tra đầu tiên sau khởi động và không có nhật ký trước đó, không thể biết giờ bắt đầu sự cố.

RTO API đo từ lúc phát hiện tới lúc API qua Gateway trả Healthy. Hai mốc trong cùng lượt kiểm tra có thể cho kết quả 0 giây. Cửa sổ phát hiện tính từ lần kiểm tra Primary Healthy cuối tới lần phát hiện lỗi. Thời gian chuyển Gateway dựa trên các mẫu Gateway có sẵn. Khi thiếu dữ liệu Monitoring mới, bộ đếm trực tiếp tạm dừng.

Sau khi đối chiếu dữ liệu trên Standby, vào mục 3, mở **Xác minh RPO dữ liệu** và ghi giờ bắt đầu lỗi thực tế, giờ lưu giao dịch mới nhất trước lỗi đã đối chiếu, cùng mã giao dịch và kết quả đối chiếu. Nếu cần bổ sung lần đo cũ, bấm **Xem** ở mục 4 trước khi ghi. RPO bằng giờ bắt đầu lỗi trừ giờ lưu giao dịch đã đối chiếu. Kết quả được lưu vào lần đo đã chọn.

## Bật RPO tự động cho buổi diễn tập

1. Áp dụng migration `006_recovery_probes` trên MySQL Primary bằng `npm run db:migrate` với cấu hình kết nối tới đúng database. Nếu Standby là MySQL replica, chờ bảng `recovery_probes` được replicate. Nếu hai backend dùng chung database, chạy migration một lần. Với một database Standby độc lập có thể ghi, áp dụng migration vào database đó để chuẩn bị trước buổi diễn tập.
2. Cập nhật frontend, backend Primary, backend Standby và Monitoring. Đặt `RPO_PROBE_ENABLED=true` trên hai backend và Monitoring, dùng cùng `MONITOR_TOKEN` và giữ `GATEWAY_URL` trỏ đến Gateway thực sự phục vụ cả hai backend. Khởi động lại các tiến trình đã đổi cấu hình.
3. Giữ Gateway phục vụ từ Primary và đợi mục 3 báo có lần Primary xác nhận giao dịch kiểm chứng. Sau đó mới gây lỗi và chờ Gateway phục vụ từ Standby. Monitoring đối chiếu các bản ghi qua Standby và lưu kết quả vào lần đo.

Monitoring giữ tối đa 120 mẫu Primary đã xác nhận trong 30 phút gần nhất, theo chu kỳ lấy mẫu. Sau khi chuyển máy, nó chọn bản ghi cuối trong dãy còn đủ dữ liệu trên Standby, dừng ở bản ghi bị thiếu đầu tiên. Nếu không có mẫu phù hợp, giao diện hiện **Chưa xác minh**. RPO quan sát mặc định dùng giờ phát hiện lỗi và chỉ phản ánh các giao dịch kiểm chứng. Mốc giờ được ghi lúc Monitoring nhận xác nhận từ Primary. Kết quả đối chiếu thủ công vẫn có thể lưu khi chưa có số đo.

## Cập nhật trên Windows

Tại thư mục dự án, pull đúng nhánh đang sử dụng (main và gateway-render-demo đều có bản cập nhật này):

```powershell
git pull --ff-only
```

Dừng đúng tiến trình Monitoring bằng Ctrl+C rồi khởi động lại:

```powershell
npm run start -w monitoring
```

Giữ nguyên monitoring/.env và thư mục monitoring/data; không xóa nhật ký. Nếu dùng Docker để chạy Monitoring, rebuild/recreate đúng service Monitoring thay vì chạy thêm một tiến trình trùng cổng. Gateway Docker Windows cũng cần build lại frontend:

```powershell
docker compose --env-file gateway/.env -f docker/compose.gateway-windows.yml up -d --build gateway
```

Nhánh Render cần triển khai bản frontend mới. Nâng cấp mỗi frontend sẽ không sửa cách Monitoring trên Windows chia các sự cố. Sau nâng cấp, kiểm chứng bằng một lần chuyển có kiểm soát theo Runbook; số liệu sự cố lịch sử thiếu bằng chứng không tự thành số đo thực tế.
