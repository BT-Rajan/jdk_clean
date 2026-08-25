-- Adds products.reorder_point (DECIMAL, default 0) -- the finished-goods
-- equivalent of raw_materials.reorder_point, read by
-- inventory_service.get_finished_goods_stock to flag a product as low
-- stock (quantity_on_hand <= reorder_point). See app/models/product.py.
--
-- A fresh install via schema.sql already has this -- this file is only
-- for upgrading an existing database. Safe to re-run.
--
-- Usage:
--   mysql -u <user> -p <database> < backend/migrations/2026-08-25_add_product_reorder_point.sql

SET @has_reorder_point = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'products' AND column_name = 'reorder_point'
);
SET @sql = IF(@has_reorder_point = 0,
  'ALTER TABLE products ADD COLUMN reorder_point DECIMAL(14,4) NOT NULL DEFAULT 0 AFTER properties',
  'SELECT ''reorder_point already exists on products, skipping'' AS status'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
