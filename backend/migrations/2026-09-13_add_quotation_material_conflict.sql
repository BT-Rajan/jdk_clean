-- Adds quotations.material_conflict_acknowledged/_notes -- set when a
-- quotation's material needs overlap another still-open quotation/order
-- and Sales explicitly acknowledged that at creation/edit time. See
-- app/services/quotation_service.py's check_material_conflicts and
-- app/api/quotations.py's POST /material-conflicts pre-check.
--
-- A fresh install via schema.sql already has both columns -- this file
-- is only for upgrading an existing database. Safe to re-run: each ADD
-- COLUMN is guarded via information_schema.
--
-- Usage:
--   mysql -u <user> -p <database> < backend/migrations/2026-09-13_add_quotation_material_conflict.sql

SET @has_ack = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'quotations' AND column_name = 'material_conflict_acknowledged'
);
SET @sql = IF(@has_ack = 0,
  'ALTER TABLE quotations ADD COLUMN material_conflict_acknowledged TINYINT(1) NOT NULL DEFAULT 0 AFTER approved_by',
  'SELECT ''material_conflict_acknowledged already exists on quotations, skipping'' AS status'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_notes = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'quotations' AND column_name = 'material_conflict_notes'
);
SET @sql = IF(@has_notes = 0,
  'ALTER TABLE quotations ADD COLUMN material_conflict_notes TEXT NULL AFTER material_conflict_acknowledged',
  'SELECT ''material_conflict_notes already exists on quotations, skipping'' AS status'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
