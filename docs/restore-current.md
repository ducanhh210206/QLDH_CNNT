# Khôi phục dữ liệu đang sử dụng về backup

Admin mở Sao lưu & phục hồi, chọn backup Success có file trên backend hiện tại, bấm **Khôi phục dữ liệu đang dùng**, tích xác nhận tạm dừng thao tác và gõ 8 ký tự đầu mã backup. Phục hồi thử cách ly vẫn là một nút riêng.

Ví dụ: backup có 26 đơn/tồn kho 9; sau đó tạo đơn thứ 27/tồn kho 8; áp dụng bản backup đưa dữ liệu nghiệp vụ về 26 đơn/tồn kho 9. Đơn sau backup không còn trong dữ liệu đang phục vụ. Đây là thao tác thực tế trên database backend được cấu hình, không phải mô phỏng giao diện.

## Cách thực hiện

- Xác minh checksum rồi restore vào schema cách ly và đối chiếu toàn bộ backup.
- Tạo backup quay lui của dữ liệu hiện tại trước khi thay đổi.
- Lấy khóa tác vụ theo database, bật khóa phục hồi dùng chung giữa các backend đã cập nhật.
- So sánh cấu trúc bảng và kiểm tra tài khoản Admin hiện tại còn tồn tại trong backup.
- Trong giao dịch SERIALIZABLE, khóa toàn bộ dòng và khoảng chèn của các bảng cần thay đổi. Nếu dữ liệu đã khác backup quay lui do có ghi đồng thời, hủy và yêu cầu thử lại.
- DELETE/INSERT dữ liệu nghiệp vụ, kiểm chứng nội dung và tất cả liên kết khóa ngoại rồi COMMIT. Lỗi trước COMMIT sẽ ROLLBACK; không dùng TRUNCATE hay thay schema hệ thống chính.
- Giữ tên database và UUID máy chủ, nên backend Primary/Standby cùng DB không cần đổi DB_NAME. Replica MySQL riêng đang lọc database này nhận thay đổi qua replication; phải kiểm tra nó bắt kịp trước khi coi là hoàn tất.
- Trả mã backup quay lui và kết quả Applied. Tải lại trang; tài khoản/phiên đăng nhập có thể quay về trạng thái trong backup nên có thể cần đăng nhập lại.

Dữ liệu tài khoản, phiên đăng nhập, sản phẩm, tồn kho, đơn, lịch sử, khóa idempotency và dữ liệu nghiệp vụ khác có trong backup được thay thế. Lịch sử backup/restore, schema_migrations và recovery_probes được giữ để không mất nhật ký, đường quay lui, phiên bản cấu trúc hoặc mốc Monitoring. Không hạ cấp schema; backup thiếu bảng hoặc cấu trúc khác bị từ chối.

## Điều kiện vận hành

Cập nhật cả backend Primary và Standby trước khi dùng để mọi instance cùng từ chối ghi khi phục hồi. Tạm dừng các thao tác đang thực hiện và công cụ ghi ngoài ứng dụng. Các khóa InnoDB bảo vệ giao dịch thay thế; các câu lệnh đang chờ trước đó có thể tiếp tục sau COMMIT nên người vận hành vẫn cần tạm dừng thao tác khi xác nhận.

File SQL và manifest lưu trên filesystem của backend tạo backup. Dùng volume bền vững/kho dùng chung nếu muốn phục hồi qua backend khác hoặc qua redeploy. Danh sách ghi rõ file không có trên backend hiện tại và khóa nút của bản đó. Không coi bản ghi trong Aiven là bản thân file backup. Không tự retry yêu cầu apply có kết quả chưa rõ; xem restore_records và kiểm tra dữ liệu trước.

Quay lui: chọn bản rollback_backup_id trả về, dùng cùng chức năng để phục hồi; chức năng này cũng tạo backup mới trước khi áp dụng. Nếu file trên backend không còn thì phải lấy lại file từ kho backup trước.

## Kiểm thử

`npm test -w backend` kiểm tra phân quyền và khóa ghi. Kiểm thử opt-in trên MySQL disposable localhost:

```bash
RUN_RESTORE_INTEGRATION=1 TEST_RESTORE_PORT=<port_MySQL_test> node --test backend/tests/applyRestore.integration.test.js
```

Test chỉ tạo schema có tiền tố tc15_live_/tc15_backup_ và schema restore tạm trên MySQL test, kiểm tra rollback khi lỗi, ghi đồng thời, đơn sau backup bị xóa và tồn kho trở lại; kiểm tra backup quay lui phục hồi được. Không chạy test này trên Aiven hay MySQL có dữ liệu thật.
