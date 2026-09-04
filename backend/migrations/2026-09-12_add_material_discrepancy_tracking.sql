-- Adds production_schedules.material_discrepancy_flag/_notes -- set on
-- batch completion when actual raw-material usage (entered per material
-- alongside produced_quantity, see app/api/production_schedules.py)
-- either exceeds that material's BOM-configured scrap_percent allowance
-- or comes in below the bare zero-scrap requirement for the reported
-- output. See app/services/production_service.py's _complete_batch and
-- app/services/notification_service.py.
--
-- A fresh install via schema.sql already has both columns -- this file
-- is only for upgrading an existing database. Safe to re-run: each ADD
-- COLUMN is guarded via information_schema.
--
-- Usage:
--   mysql -u <user> -p <database> < backend/migrations/2026-09-12_add_material_discrepancy_tracking.sql

SET @has_flag = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'production_schedules' AND column_name = 'material_discrepancy_flag'
);
SET @sql = IF(@has_flag = 0,
  'ALTER TABLE production_schedules ADD COLUMN material_discrepancy_flag TINYINT(1) NOT NULL DEFAULT 0 AFTER notes',
  'SELECT ''material_discrepancy_flag already exists on production_schedules, skipping'' AS status'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_notes = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'production_schedules' AND column_name = 'material_discrepancy_notes'
);
SET @sql = IF(@has_notes = 0,
  'ALTER TABLE production_schedules ADD COLUMN material_discrepancy_notes TEXT NULL AFTER material_discrepancy_flag',
  'SELECT ''material_discrepancy_notes already exists on production_schedules, skipping'' AS status'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
