-- Upgrades Product to match Raw Material's identity/QC shape (see
-- 2026-09-16_raw_material_master_upgrade.sql): adds category/description
-- (descriptive identity fields, same as raw_materials) and
-- inspection_required/qc_notes (lightweight QC, same as raw_materials) --
-- see app/models/product.py.
--
-- A fresh install via schema.sql already has all of this -- this file is
-- only for upgrading an existing database. Safe to re-run: every step is
-- guarded via information_schema, same pattern as the earlier migrations.
--
-- Usage:
--   mysql -u <user> -p <database> < backend/migrations/2026-09-17_add_product_master_fields.sql

SET @has_col = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'products' AND column_name = 'category'
);
SET @sql = IF(@has_col = 0,
  'ALTER TABLE products
     ADD COLUMN category VARCHAR(100) NULL AFTER unit,
     ADD COLUMN description TEXT NULL AFTER category',
  'SELECT ''category already exists on products, skipping'' AS status'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_col = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'products' AND column_name = 'inspection_required'
);
SET @sql = IF(@has_col = 0,
  'ALTER TABLE products
     ADD COLUMN inspection_required TINYINT(1) NOT NULL DEFAULT 0 AFTER reorder_point,
     ADD COLUMN qc_notes TEXT NULL AFTER inspection_required',
  'SELECT ''inspection_required already exists on products, skipping'' AS status'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
