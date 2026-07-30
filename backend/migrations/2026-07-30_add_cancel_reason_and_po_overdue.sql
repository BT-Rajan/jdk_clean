-- Consistency fixes:
--   1. Orders/quotations/feasibility already require a reason to cancel;
--      production batches, delivery notes, and purchase orders didn't.
--      Adds cancel_reason to all three, mandatory when status becomes
--      'cancelled' (see the three services' change_status functions).
--   2. Purchase orders had no admin-review overdue tracking, unlike
--      orders. Adds the same admin_review_required/admin_reviewed_at/
--      admin_reviewed_by/admin_review_notes columns orders already have,
--      for a supplier running late on expected_delivery_date.
--
-- A fresh install via schema.sql already has all of this -- this file is
-- only for upgrading an existing database. Safe to re-run: guarded via
-- information_schema, same pattern as the earlier migrations.
--
-- Usage:
--   mysql -u <user> -p <database> < backend/migrations/2026-07-30_add_cancel_reason_and_po_overdue.sql

SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'production_schedules' AND column_name = 'cancel_reason'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE production_schedules ADD COLUMN cancel_reason TEXT NULL AFTER auto_scheduled',
  'SELECT ''cancel_reason column already exists on production_schedules, skipping'' AS status'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'delivery_notes' AND column_name = 'cancel_reason'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE delivery_notes ADD COLUMN cancel_reason TEXT NULL AFTER auto_created',
  'SELECT ''cancel_reason column already exists on delivery_notes, skipping'' AS status'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'purchase_orders' AND column_name = 'cancel_reason'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE purchase_orders ADD COLUMN cancel_reason TEXT NULL AFTER notes',
  'SELECT ''cancel_reason column already exists on purchase_orders, skipping'' AS status'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'purchase_orders' AND column_name = 'admin_review_required'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE purchase_orders ADD COLUMN admin_review_required TINYINT(1) NOT NULL DEFAULT 0 AFTER cancel_reason, ADD COLUMN admin_reviewed_at DATETIME NULL AFTER admin_review_required, ADD COLUMN admin_reviewed_by BIGINT UNSIGNED NULL AFTER admin_reviewed_at, ADD COLUMN admin_review_notes TEXT NULL AFTER admin_reviewed_by, ADD CONSTRAINT fk_po_admin_reviewed_by FOREIGN KEY (admin_reviewed_by) REFERENCES users(id), ADD INDEX idx_po_admin_review (admin_review_required)',
  'SELECT ''admin_review_required column already exists on purchase_orders, skipping'' AS status'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
