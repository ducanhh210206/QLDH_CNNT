-- Product revision changes on edits and inventory movements.
ALTER TABLE products ADD COLUMN version INT UNSIGNED NOT NULL DEFAULT 1;
