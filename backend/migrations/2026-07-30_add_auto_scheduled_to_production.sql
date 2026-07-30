-- Adds production_schedules.auto_scheduled -- true when the system
-- created the batch automatically on order confirmation (see
-- order_service.py's auto-scheduling hook, which reuses the same
-- vacant-slot capacity scan as the feasibility check), false for a
-- person-created batch.
--
-- A fresh install via schema.sql already has this -- this file is only
-- for upgrading an existing database. Safe to re-run: guarded via
-- information_schema, same pattern as the earlier migrations.
--
-- Usage:
--   mysql -u <user> -p <database> < backend/migrations/2026-07-30_add_auto_scheduled_to_production.sql

SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'production_schedules' AND column_name = 'auto_scheduled'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE production_schedules ADD COLUMN auto_scheduled TINYINT(1) NOT NULL DEFAULT 0 AFTER status',
  'SELECT ''auto_scheduled column already exists, skipping'' AS status'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
