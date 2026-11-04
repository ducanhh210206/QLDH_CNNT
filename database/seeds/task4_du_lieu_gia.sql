-- Dữ liệu giả dành riêng cho bài thử sao lưu/khôi phục task 4.
-- Chỉ nạp vào MySQL thử cô lập, không nạp vào Aiven hoặc standby của ứng dụng.
INSERT INTO users (id, username, password_hash, role)
VALUES ('00000000-0000-4000-8000-000000000001', 'task4_user_gia', NULL, 'Staff');

INSERT INTO products (id, sku, name, unit_price, description, created_by)
VALUES ('00000000-0000-4000-8000-000000000101', 'TASK4-SP-01',
        'Sản phẩm giả Á', 120000.00, 'Dữ liệu kiểm thử',
        '00000000-0000-4000-8000-000000000001');

INSERT INTO orders (id, customer_name, product_name, quantity, total_amount, status, version)
VALUES
 ('00000000-0000-4000-8000-000000000201', 'Khách hàng giả A', 'Sản phẩm giả Á', 1, 120000.00, 'Pending', 1),
 ('00000000-0000-4000-8000-000000000202', 'Khách hàng giả B', 'Sản phẩm giả Á', 2, 240000.00, 'Completed', 2);

INSERT INTO order_status_history (order_id, old_status, new_status, user_id)
VALUES
 ('00000000-0000-4000-8000-000000000201', NULL, 'Pending', '00000000-0000-4000-8000-000000000001'),
 ('00000000-0000-4000-8000-000000000202', NULL, 'Pending', '00000000-0000-4000-8000-000000000001'),
 ('00000000-0000-4000-8000-000000000202', 'Pending', 'Completed', '00000000-0000-4000-8000-000000000001');
