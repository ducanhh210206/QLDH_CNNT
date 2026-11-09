# Monitoring: máy chủ, replication và đo khôi phục

## Chạy

Từ thư mục gốc repository, cấu hình `monitoring/.env` theo `monitoring/.env.example` rồi chạy `npm start -w monitoring`. Backend phải có cùng `MONITOR_TOKEN` (ít nhất 32 ký tự) và `MONITOR_URL` trỏ tới tiến trình này. Không đưa token hoặc mật khẩu vào biến `VITE_*`.

- `PRIMARY_URL`: backend Primary, instance trả về phải là `primary`.
- `STANDBY_URL`: backend Standby, đặt `INSTANCE_NAME=standby` ở backend này.
- `GATEWAY_URL`: URL Gateway thực sự định tuyến giữa hai backend. Monitoring đọc `/health/ready` qua Gateway để xác định instance đang phục vụ. Nếu dùng hai URL rời nhau và chưa có Gateway, Active hiển thị chưa xác định.
- `REPLICA_DB_HOST`, `REPLICA_DB_PORT`, `REPLICA_DB_USER`, `REPLICA_DB_PASSWORD`: kết nối tới **MySQL Standby**, không phải Aiven Primary. Lab sau failback hiện dùng cổng 3308 theo tài liệu nhóm; xác nhận địa chỉ trên máy chạy Monitoring trước khi điền. Monitoring chạy trong Docker không dùng localhost của máy chủ.
- `REPLICA_DB_SSL=true` và `REPLICA_DB_SSL_CA_FILE` nếu máy đích yêu cầu TLS. Không tắt kiểm chứng chứng chỉ.
- Tài khoản giám sát chỉ cần quyền `REPLICATION CLIENT` để `SHOW REPLICA STATUS` và quyền SELECT phù hợp trên `performance_schema.replication_applier_status_by_worker` để đọc thời gian áp dụng. Nhờ người quản trị cấp đúng quyền; không dùng root hoặc cấp quyền ghi để giám sát.
- `MONITOR_DATA_DIR`: thư mục lưu nhật ký bền vững, mặc định `monitoring/data`. Compose ứng dụng đã gắn volume ở thư mục mặc định. Nếu deploy riêng, gắn ổ/volume hoặc sao chép nhật ký ra nơi lưu bền vững. Đĩa tạm trên hosting có thể mất khi triển khai lại.

Backend chỉ proxy API Monitoring cho tài khoản quản lý. Tiến trình Monitoring cần chạy độc lập với máy Primary. Khi Primary mất, mở giao diện qua Gateway/Backend Standby; giao diện chỉ đi qua Primary sẽ không truy cập được trong lúc Primary lỗi. Không công khai cổng Monitoring; giới hạn mạng tới backend và cấu hình token.

Render hiện chạy ứng dụng web, không tự tạo tiến trình Monitoring hoặc đường kết nối từ Render vào MySQL trên máy cá nhân. Cần đặt Monitoring ở máy/server có thể truy cập cả Primary, Standby, Gateway, rồi cung cấp URL có thể truy cập cho backend. Nếu chưa có kết nối này, giao diện hiện chưa cấu hình/chưa đo thay vì số giả.

## Bốn khu vực

1. **Server Status**: HTTP readiness của từng backend và Gateway; instance Active là instance Gateway trả về trong lần kiểm tra gần nhất. Healthy không chứng minh máy có quyền ghi an toàn hay chống split-brain.
2. **Database Replication**: từng kênh, luồng nhận/áp dụng và `Seconds_Behind_Source`. Giá trị NULL, mất kết nối hoặc luồng lỗi không được đổi thành 0. “Áp dụng giao dịch cuối” lấy timestamp MySQL performance_schema, không phải thời điểm kiểm tra; có thể không có nếu thiếu quyền hoặc chưa áp dụng giao dịch. Replica lag không phải RPO và không chứng minh toàn bộ nội dung hai DB giống nhau. Sau promotion, replication dừng có thể là trạng thái chủ động theo runbook.
3. **Recovery Metrics**: tính cho sự cố được chọn. Thiếu mốc trả null/“Chưa đo”. Các mốc operator là số liệu người vận hành xác nhận bằng ghi chú, không phải đo tự động toàn bộ quy trình.
4. **Incident Timeline**: bắt đầu lỗi, phát hiện, bắt đầu failover, standby tiếp quản, khôi phục xong. Ghi vào `recovery.jsonl`; các chuyển trạng thái cũ tiếp tục vào `incidents.jsonl`. Giữ 100 sự cố gần nhất trong API, nhật ký file tiếp tục append; cần sao lưu/rotation vận hành.

## Thu thập số liệu trong lần demo thật

1. Chạy Monitoring trước khi thử lỗi để đã quan sát Primary Healthy. Đồng bộ giờ các máy. Nếu khởi động Monitoring khi Primary đã offline, không tự đoán thời điểm bắt đầu lỗi và không tự tạo sự cố từ trạng thái khởi động.
2. Thực hiện kịch bản lỗi theo runbook đã được chuẩn bị, ghi lại giờ bắt đầu lỗi từ log thực. Monitoring thấy Primary Healthy → Offline/Unhealthy sẽ tạo timeline và lưu giờ phát hiện. Chu kỳ mặc định 10 giây, timeout probe 4 giây; số đo quan sát có sai số do polling, mạng và đồng hồ.
3. Chọn sự cố, bổ sung mốc **Bắt đầu lỗi**, thời gian và bằng chứng. Sau đó ghi **Bắt đầu failover** theo thao tác thực tế. Form này chỉ ghi bằng chứng, không điều khiển hạ tầng hay chuyển quyền ghi.
4. Khi Gateway phản hồi Healthy với `instance=standby`, mốc tiếp quản được tự ghi. Nếu chuyển URL thủ công, người vận hành có thể ghi mốc tiếp quản bằng chứng riêng; đây không phải xác minh tự động qua Gateway.
5. Sau khi xác minh hệ thống phục vụ được và đối chiếu dữ liệu, ghi **Hoàn tất khôi phục**. Có thể điền mốc giao dịch/dữ liệu cuối đã phục hồi và đối chiếu, không muộn hơn thời điểm bắt đầu lỗi, để tính RPO theo điểm phục hồi được xác nhận. Không lấy thời gian áp dụng replica thay cho mốc dữ liệu đã đối chiếu.
6. Mỗi mốc chỉ lưu một lần, theo đúng thứ tự; không chấp nhận thời gian tương lai. Mốc đã lưu không được sửa bằng UI. Mốc phát hiện lấy từ Monitoring. Các mốc nhập dùng giờ máy người vận hành, chuyển UTC khi lưu.

Công thức:

- RTO = hoàn tất khôi phục − bắt đầu lỗi.
- RPO theo điểm đã đối chiếu = bắt đầu lỗi − mốc dữ liệu cuối đã phục hồi và đối chiếu. Đây là tuổi điểm phục hồi được xác nhận, không tự đếm số giao dịch mất và không bảo đảm không mất dữ liệu sau mốc đó.
- Phát hiện = phát hiện lỗi − bắt đầu lỗi.
- Chuyển máy = standby tiếp quản − bắt đầu failover.

Đây là theo dõi và ghi bằng chứng, chưa phải bộ điều khiển HA/failover tự động. Minh chứng failover/failback ngày 08/11 có trong repository không tự được nhập thành các số RTO/RPO vì chưa có đủ mốc đo được kiểm chứng.

## Kiểm thử

`npm test` gồm backend và Monitoring. Tests của Monitoring dùng dữ liệu fixture để kiểm tra tính thời gian, không suy diễn Active, NULL lag, nhiều kênh, thứ tự mốc và trùng mốc. Chạy riêng: `npm test -w monitoring`. Các phép thử không gây failover thật và không ghi vào MySQL production.
