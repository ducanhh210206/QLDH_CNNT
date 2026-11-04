# Tồn kho sản phẩm và chặn đơn thiếu hàng

## Sử dụng

1. Mở Sản phẩm, thêm sản phẩm với số lượng tồn kho ban đầu (số nguyên không âm).
2. Với sản phẩm hiện có, bấm **Sửa** trong bảng để đổi tên, giá bán và số lượng tồn kho. Số lượng nhập là tồn mới sau khi lưu, không phải số nhập thêm. Quyền products.create cho phép thêm/sửa sản phẩm; người chỉ có products.read chỉ được xem.
3. Mở Tạo đơn hàng, tìm mã/tên và chọn sản phẩm. Danh sách hiển thị tối đa 100 kết quả tìm kiếm, có số còn lại và tự làm mới mỗi 15 giây. Sản phẩm hết hàng không chọn được.
4. Nhập số lượng đặt. Nếu vượt tồn kho, form báo thiếu hàng và khóa nút lưu. Backend vẫn kiểm tra tồn kho mới nhất, trả HTTP 409/INSUFFICIENT_STOCK nếu không đủ; không tạo đơn hay trừ kho.

Tạo đơn Pending/Completed trừ kho ngay. Hoàn tất đơn Pending không trừ lần nữa. Hủy Pending hoàn kho một lần; phiên bản đơn ngăn gửi hủy lặp. Tạo trực tiếp Cancelled kiểm tra đủ kho nhưng không trừ. Yêu cầu tạo đơn lặp cùng Idempotency-Key nhận lại đơn đã tạo và không trừ kho lại, kể cả lúc tồn kho đã hết.

Nếu lưu báo mất kết nối, làm mới và kiểm tra trước khi sửa lại. Mỗi thay đổi danh mục hoặc biến động kho tăng phiên bản sản phẩm: cửa sổ sửa cũ bị từ chối HTTP 409 để không ghi đè đơn mới, lần nhập kho hoặc chỉnh sửa khác.

## Nâng cấp

Chạy từ thư mục gốc chứa package.json, bằng tài khoản provisioning có quyền ALTER:

```bash
npm run db:migrate
```

Với Aiven đã có file cấu hình riêng và CA:

```bash
node --env-file=backend/.env.hosting scripts/migrate-db.js
```

Runner tạo snapshot SQL + SHA-256 trước khi thêm cột products.stock_quantity và orders.product_id (migration 004_product_stock), chạy lại được. Không chạy db:init trên database đang có dữ liệu. Cài mới db:init đã gồm 001/002/003/004/005. Sau migration, build lại BE Docker hoặc triển khai bản code mới trên Render.

Sản phẩm cũ mặc định tồn kho 0. Không suy đoán số lượng thực tế từ lịch sử đơn. Đơn cũ giữ product_id NULL để không hoàn nhầm kho khi hủy. Backup vẫn gồm 13 bảng; dữ liệu tồn kho và liên kết sản phẩm được sao lưu trong products/orders. Restore backup cũ vào schema cách ly cần migration trước khi đưa schema đó vào vận hành.

## API

- POST /api/products: thêm stock_quantity là số nguyên 0–1.000.000.000.
- POST /api/products/:id/stock: body {"quantity": 5}, nhập thêm số nguyên dương tối đa 1.000.000.000; yêu cầu products.create.
- GET /api/orders/products?search=...&page=1&limit=100: danh mục để tạo đơn, yêu cầu orders.create; nhân viên không cần quyền quản lý sản phẩm.
- POST /api/orders: thêm product_id UUID bắt buộc; product_name vẫn thuộc payload, BE ghi tên thực trong danh mục.

Khóa dòng sản phẩm bằng SELECT FOR UPDATE để kiểm tra/trừ tồn trong cùng transaction với đơn, khóa gửi lại và lịch sử. Nếu bất kỳ bước ghi nào thất bại, toàn bộ transaction rollback.

## Sửa sản phẩm (schema 005)

Migration 005_product_edit thêm products.version mặc định 1, giữ nguyên tên/giá/tồn hiện có. Chạy cùng runner db:migrate, có snapshot trước thay đổi và chạy lại được.

PATCH /api/products/:id nhận body {"name":"Tên mới","unit_price":"250000.00","stock_quantity":7,"version":1}. Yêu cầu products.create; SKU không thay đổi qua API này. Giá, tồn phải không âm; tồn là số nguyên. API cập nhật cả ba trường trong một câu UPDATE có điều kiện version. Mọi lần trừ kho, hoàn kho và nhập thêm kho cũng tăng version, kể cả khi số lượng sau đó quay lại như cũ.

Nếu version đã cũ, trả PRODUCT_VERSION_CONFLICT và không ghi đè bất kỳ trường nào. Tải lại danh mục rồi mở Sửa lại. Đổi tên/giá trong danh mục không sửa dữ liệu đơn đã tạo. Endpoint POST /api/products/:id/stock vẫn giữ cho tích hợp nhập thêm; không còn là thao tác chính trong bảng.
