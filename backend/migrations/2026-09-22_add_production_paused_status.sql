-- Adds a 'paused' status to production_schedules and a pause_reason
-- column, so a batch that stops mid-run (machine breakdown, worker
-- shortage, quality hold) can be held and resumed instead of only ever
-- being cancelled -- see app/models/production_schedule.py's comment on
-- ALLOWED_TRANSITIONS and app/services/production_service.py's
-- log_partial_production.
--
-- Safe to re-run: the ALTER TABLEs are guarded by information_schema so
-- they only fire while the column/enum value is missing.
--
-- A fresh install via schema.sql already has both -- this file is only
-- for upgrading an existing database.
--
-- Usage:
--   mysql -u <user> -p <database> < backend/migrations/2026-09-22_add_production_paused_status.sql

SET @col_type = (
  SELECT COLUMN_TYPE FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'production_schedules' AND column_name = 'status'
);
SET @sql = IF(@col_type <> "enum('planned','in_progress','paused','completed','cancelled')",
  "ALTER TABLE production_schedules MODIFY status ENUM('planned','in_progress','paused','completed','cancelled') NOT NULL DEFAULT 'planned'",
  'SELECT ''production_schedules.status already includes paused, skipping'' AS status'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'production_schedules' AND column_name = 'pause_reason'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE production_schedules ADD COLUMN pause_reason TEXT NULL AFTER cancel_reason',
  'SELECT ''production_schedules.pause_reason already exists, skipping'' AS status'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
