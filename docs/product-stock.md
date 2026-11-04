# Tồn kho sản phẩm và chặn đơn thiếu hàng

## Sử dụng

1. Mở Sản phẩm, thêm sản phẩm với số lượng tồn kho ban đầu (số nguyên không âm).
2. Với sản phẩm hiện có, nhập số lượng hàng nhận thêm ở cột Nhập kho. Quyền products.create cho phép thêm sản phẩm và nhập kho; người chỉ có products.read không được nhập kho.
3. Mở Tạo đơn hàng, tìm mã/tên và chọn sản phẩm. Danh sách hiển thị tối đa 100 kết quả tìm kiếm, có số còn lại và tự làm mới mỗi 15 giây. Sản phẩm hết hàng không chọn được.
4. Nhập số lượng đặt. Nếu vượt tồn kho, form báo thiếu hàng và khóa nút lưu. Backend vẫn kiểm tra tồn kho mới nhất, trả HTTP 409/INSUFFICIENT_STOCK nếu không đủ; không tạo đơn hay trừ kho.

Tạo đơn Pending/Completed trừ kho ngay. Hoàn tất đơn Pending không trừ lần nữa. Hủy Pending hoàn kho một lần; phiên bản đơn ngăn gửi hủy lặp. Tạo trực tiếp Cancelled kiểm tra đủ kho nhưng không trừ. Yêu cầu tạo đơn lặp cùng Idempotency-Key nhận lại đơn đã tạo và không trừ kho lại, kể cả lúc tồn kho đã hết.

Nếu nhập kho báo mất kết nối, làm mới và kiểm tra số lượng trước khi nhập lại vì thao tác nhập thêm kho không có khóa idempotency.

## Nâng cấp

Chạy từ thư mục gốc chứa package.json, bằng tài khoản provisioning có quyền ALTER:

```bash
npm run db:migrate
```

Với Aiven đã có file cấu hình riêng và CA:

```bash
node --env-file=backend/.env.hosting scripts/migrate-db.js
```

Runner tạo snapshot SQL + SHA-256 trước khi thêm cột products.stock_quantity và orders.product_id (migration 004_product_stock), chạy lại được. Không chạy db:init trên database đang có dữ liệu. Cài mới db:init đã gồm 001/002/003/004. Sau migration, build lại BE Docker hoặc triển khai bản code mới trên Render.

Sản phẩm cũ mặc định tồn kho 0. Không suy đoán số lượng thực tế từ lịch sử đơn. Đơn cũ giữ product_id NULL để không hoàn nhầm kho khi hủy. Backup vẫn gồm 13 bảng; dữ liệu tồn kho và liên kết sản phẩm được sao lưu trong products/orders. Restore backup cũ vào schema cách ly cần migration trước khi đưa schema đó vào vận hành.

## API

- POST /api/products: thêm stock_quantity là số nguyên 0–1.000.000.000.
- POST /api/products/:id/stock: body {"quantity": 5}, nhập thêm số nguyên dương tối đa 1.000.000.000; yêu cầu products.create.
- GET /api/orders/products?search=...&page=1&limit=100: danh mục để tạo đơn, yêu cầu orders.create; nhân viên không cần quyền quản lý sản phẩm.
- POST /api/orders: thêm product_id UUID bắt buộc; product_name vẫn thuộc payload, BE ghi tên thực trong danh mục.

Khóa dòng sản phẩm bằng SELECT FOR UPDATE để kiểm tra/trừ tồn trong cùng transaction với đơn, khóa gửi lại và lịch sử. Nếu bất kỳ bước ghi nào thất bại, toàn bộ transaction rollback.
