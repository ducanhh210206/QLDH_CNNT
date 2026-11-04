-- Legacy orders keep product_id NULL; no inferred stock movements.
ALTER TABLE products ADD COLUMN stock_quantity BIGINT UNSIGNED NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN product_id CHAR(36) NULL;
