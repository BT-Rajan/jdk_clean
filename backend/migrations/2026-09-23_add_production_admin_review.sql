-- Adds the same admin-review escalation columns orders and purchase
-- orders already have to production_schedules -- a batch running past
-- its scheduled_end without being completed or cancelled now gets a
-- persisted, admin-visible flag (not just a dashboard alert that
-- disappears once nobody's looking at it) -- see
-- app/services/production_service.py's escalate_overdue_batches/
-- admin_review and app/models/production_schedule.py's comment on
-- these columns.
--
-- Safe to re-run: each ALTER is guarded by information_schema so it only
-- fires while the column doesn't already exist.
--
-- A fresh install via schema.sql already has these columns -- this file
-- is only for upgrading an existing database.
--
-- Usage:
--   mysql -u <user> -p <database> < backend/migrations/2026-09-23_add_production_admin_review.sql

SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'production_schedules' AND column_name = 'admin_review_required'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE production_schedules ADD COLUMN admin_review_required TINYINT(1) NOT NULL DEFAULT 0 AFTER material_discrepancy_notes',
  'SELECT ''production_schedules.admin_review_required already exists, skipping'' AS status'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'production_schedules' AND column_name = 'admin_reviewed_at'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE production_schedules ADD COLUMN admin_reviewed_at DATETIME NULL AFTER admin_review_required',
  'SELECT ''production_schedules.admin_reviewed_at already exists, skipping'' AS status'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'production_schedules' AND column_name = 'admin_reviewed_by'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE production_schedules ADD COLUMN admin_reviewed_by BIGINT UNSIGNED NULL AFTER admin_reviewed_at',
  'SELECT ''production_schedules.admin_reviewed_by already exists, skipping'' AS status'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'production_schedules' AND column_name = 'admin_review_notes'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE production_schedules ADD COLUMN admin_review_notes TEXT NULL AFTER admin_reviewed_by',
  'SELECT ''production_schedules.admin_review_notes already exists, skipping'' AS status'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fk_exists = (
  SELECT COUNT(*) FROM information_schema.table_constraints
  WHERE table_schema = DATABASE() AND table_name = 'production_schedules' AND constraint_name = 'fk_ps_admin_reviewed_by'
);
SET @sql = IF(@fk_exists = 0,
  'ALTER TABLE production_schedules ADD CONSTRAINT fk_ps_admin_reviewed_by FOREIGN KEY (admin_reviewed_by) REFERENCES users(id)',
  'SELECT ''fk_ps_admin_reviewed_by already exists, skipping'' AS status'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
