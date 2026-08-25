-- Adds products.tags and products.properties (both JSON, nullable) --
-- descriptive-only fields for the product form: free-form labels for
-- filtering/grouping (tags) and arbitrary spec key-value pairs like
-- color or shelf-life (properties). Neither is read by feasibility/BOM/
-- capacity logic -- see app/models/product.py.
--
-- A fresh install via schema.sql already has both -- this file is only
-- for upgrading an existing database. Safe to re-run.
--
-- Usage:
--   mysql -u <user> -p <database> < backend/migrations/2026-08-25_add_product_tags_and_properties.sql

SET @has_tags = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'products' AND column_name = 'tags'
);
SET @sql = IF(@has_tags = 0,
  'ALTER TABLE products ADD COLUMN tags JSON NULL AFTER status, ADD COLUMN properties JSON NULL AFTER tags',
  'SELECT ''tags already exists on products, skipping'' AS status'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
