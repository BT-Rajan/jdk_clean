-- Adds products.reorder_point (DECIMAL, default 0) -- the finished-goods
-- equivalent of raw_materials.reorder_point, read by
-- inventory_service.get_finished_goods_stock to flag a product as low
-- stock (quantity_on_hand <= reorder_point). See app/models/product.py.
--
-- A fresh install via schema.sql already has this -- this file is only
-- for upgrading an existing database. Safe to re-run.
--
-- Column position: on a fresh install this column sits AFTER properties
-- (see schema.sql). This file shares its date prefix with
-- 2026-08-25_add_product_tags_and_properties.sql, which creates that
-- properties column, and migration runners commonly apply files in
-- alphabetical filename order -- under which this file ("reorder_point")
-- would run BEFORE "tags_and_properties" and fail with "Unknown column
-- 'properties'". Rather than rely on run order, this checks whether
-- properties exists yet and positions the new column AFTER it if so,
-- falling back to AFTER status otherwise -- so this migration is
-- correct and safe to run in either order.
--
-- Usage:
--   mysql -u <user> -p <database> < backend/migrations/2026-08-25_add_product_reorder_point.sql

SET @has_reorder_point = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'products' AND column_name = 'reorder_point'
);
SET @has_properties = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'products' AND column_name = 'properties'
);
SET @after_col = IF(@has_properties > 0, 'properties', 'status');
SET @sql = IF(@has_reorder_point = 0,
  CONCAT('ALTER TABLE products ADD COLUMN reorder_point DECIMAL(14,4) NOT NULL DEFAULT 0 AFTER ', @after_col),
  'SELECT ''reorder_point already exists on products, skipping'' AS status'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
