-- Adds products.workers_required -- the labor side of the per-product
-- "formula" (alongside machine_id/production_hours_per_unit and the BOM):
-- how many workers are needed concurrently to run this product's
-- production_hours_per_unit. Used by the feasibility check's capacity
-- scan together with the factory-wide worker pool (settings:
-- factory_total_workers / factory_workday_hours, no schema change needed
-- since settings is a flat key-value table).
--
-- A fresh install via schema.sql already has this -- this file is only
-- for upgrading an existing database. Safe to re-run: guarded via
-- information_schema, same pattern as the earlier migrations.
--
-- Usage:
--   mysql -u <user> -p <database> < backend/migrations/2026-07-29_add_workers_required_to_products.sql

SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'products' AND column_name = 'workers_required'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE products ADD COLUMN workers_required SMALLINT UNSIGNED NULL AFTER production_hours_per_unit',
  'SELECT ''workers_required column already exists, skipping'' AS status'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
