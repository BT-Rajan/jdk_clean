-- Adds products.maximum_stock -- the finished-goods ceiling to pair with
-- the existing reorder_point floor (see app/models/product.py). Mirrors
-- raw_materials.maximum_stock exactly: default 0 means "no ceiling
-- configured yet", not "cap stock at zero" (see
-- app/schemas/product.py's cross-field check).

SET @has_col = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'products' AND column_name = 'maximum_stock'
);
SET @sql = IF(@has_col = 0,
  'ALTER TABLE products ADD COLUMN maximum_stock DECIMAL(14,4) NOT NULL DEFAULT 0 AFTER reorder_point',
  'SELECT ''products.maximum_stock already exists, skipping'' AS status'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
