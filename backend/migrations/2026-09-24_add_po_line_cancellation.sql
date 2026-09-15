-- Lets one line of a purchase order be closed out (the supplier can't
-- deliver the rest of it) without cancelling the whole PO -- see
-- app/services/purchase_order_service.py's cancel_purchase_order_line.
--
-- Safe to re-run: each ALTER is guarded by information_schema so it only
-- fires while the column doesn't already exist.
--
-- A fresh install via schema.sql already has these columns -- this file
-- is only for upgrading an existing database.
--
-- Usage:
--   mysql -u <user> -p <database> < backend/migrations/2026-09-24_add_po_line_cancellation.sql

SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'purchase_order_lines' AND column_name = 'is_cancelled'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE purchase_order_lines ADD COLUMN is_cancelled TINYINT(1) NOT NULL DEFAULT 0 AFTER received_quantity',
  'SELECT ''purchase_order_lines.is_cancelled already exists, skipping'' AS status'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'purchase_order_lines' AND column_name = 'cancel_reason'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE purchase_order_lines ADD COLUMN cancel_reason TEXT NULL AFTER is_cancelled',
  'SELECT ''purchase_order_lines.cancel_reason already exists, skipping'' AS status'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
