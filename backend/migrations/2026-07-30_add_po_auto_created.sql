-- Adds purchase_orders.auto_created -- true when the system drafted this
-- PO automatically from an MRP shortage (see purchase_order_service.
-- auto_draft_from_mrp_shortages), false for a person-created one.
-- Mirrors quotations.auto_created / production_schedules.auto_scheduled
-- / delivery_notes.auto_created.
--
-- A fresh install via schema.sql already has this -- this file is only
-- for upgrading an existing database. Safe to re-run: guarded via
-- information_schema, same pattern as the earlier migrations.
--
-- Usage:
--   mysql -u <user> -p <database> < backend/migrations/2026-07-30_add_po_auto_created.sql

SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'purchase_orders' AND column_name = 'auto_created'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE purchase_orders ADD COLUMN auto_created TINYINT(1) NOT NULL DEFAULT 0 AFTER notes',
  'SELECT ''auto_created column already exists on purchase_orders, skipping'' AS status'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
