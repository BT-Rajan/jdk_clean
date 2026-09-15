-- Turns products.unit and raw_materials.unit from free text into a
-- fixed picklist (see app/models/product.py's PRODUCT_UNITS and
-- app/models/raw_material.py's RAW_MATERIAL_UNITS): 'kg', '20kg',
-- '25kg', 'ton', 'ml', 'litre' for both, plus 'pcs' for raw materials
-- only (packaging is counted in pieces; products in this catalog never
-- are). Confirmed as a dev-only, force-through change -- this normalizes
-- existing rows to a valid value before narrowing the column, rather
-- than requiring every row to already match.
--
-- Normalization: every packaging_material row (material_type =
-- 'packaging') is set to 'pcs'. Every other row whose current unit
-- isn't already one of the allowed values is set to 'kg' as a safe
-- placeholder -- with a catalog this small (5 products, 4 raw
-- materials, 1 packaging item), it's just as fast to review and correct
-- any of those by hand afterwards via the now-dropdown Unit field as it
-- would be to guess right here.
--
-- Safe to re-run: the normalization UPDATEs are no-ops once every row
-- already holds an allowed value, and the ALTER TABLEs are guarded by
-- information_schema so they only fire while the column is still
-- VARCHAR.
--
-- A fresh install via schema.sql already has both columns as ENUM --
-- this file is only for upgrading an existing database.
--
-- Usage:
--   mysql -u <user> -p <database> < backend/migrations/2026-09-20_constrain_unit_enum.sql

UPDATE raw_materials
SET unit = 'pcs'
WHERE material_type = 'packaging' AND unit <> 'pcs';

UPDATE raw_materials
SET unit = 'kg'
WHERE material_type <> 'packaging'
  AND unit NOT IN ('kg', '20kg', '25kg', 'ton', 'ml', 'litre');

UPDATE products
SET unit = 'kg'
WHERE unit NOT IN ('kg', '20kg', '25kg', 'ton', 'ml', 'litre');

SET @col_type = (
  SELECT COLUMN_TYPE FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'raw_materials' AND column_name = 'unit'
);
SET @sql = IF(@col_type <> "enum('kg','20kg','25kg','ton','ml','litre','pcs')",
  "ALTER TABLE raw_materials MODIFY unit ENUM('kg','20kg','25kg','ton','ml','litre','pcs') NOT NULL",
  'SELECT ''raw_materials.unit already constrained, skipping'' AS status'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_type = (
  SELECT COLUMN_TYPE FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'products' AND column_name = 'unit'
);
SET @sql = IF(@col_type <> "enum('kg','20kg','25kg','ton','ml','litre')",
  "ALTER TABLE products MODIFY unit ENUM('kg','20kg','25kg','ton','ml','litre') NOT NULL",
  'SELECT ''products.unit already constrained, skipping'' AS status'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
