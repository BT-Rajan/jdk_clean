-- Adds delivery_notes.auto_created -- true when the system drafted the
-- note automatically once its order became ready to ship (see
-- order_service.py's auto-creation hook, the last joint in the
-- feasibility->quotation->order->production->delivery auto-progression
-- pipeline), false for a person-created delivery note.
--
-- A fresh install via schema.sql already has this -- this file is only
-- for upgrading an existing database. Safe to re-run: guarded via
-- information_schema, same pattern as the earlier migrations.
--
-- Usage:
--   mysql -u <user> -p <database> < backend/migrations/2026-07-30_add_auto_created_to_delivery_notes.sql

SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'delivery_notes' AND column_name = 'auto_created'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE delivery_notes ADD COLUMN auto_created TINYINT(1) NOT NULL DEFAULT 0 AFTER status',
  'SELECT ''auto_created column already exists, skipping'' AS status'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
