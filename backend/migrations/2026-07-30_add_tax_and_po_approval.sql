-- Two business rules that didn't exist:
--   1. Tax provisioning: Kuwait has no GST/VAT today, but quotations,
--      orders, and purchase orders now carry subtotal_amount/tax_rate/
--      tax_amount alongside total_amount, defaulting to a 0% rate
--      (Settings -> default_tax_rate) so tax can be switched on later
--      without any schema or workflow rework. total_amount = subtotal +
--      tax, so it stays identical to subtotal_amount (and everything
--      that already reads total_amount keeps working unchanged) as long
--      as the rate is 0.
--   2. Large-PO admin approval: purchase_orders gains approved_at/
--      approved_by -- a PO at/above Settings -> large_po_approval_
--      threshold can't move from 'draft' to 'sent' until an admin
--      approves it. An unset threshold means the gate is off.
--
-- A fresh install via schema.sql already has all of this -- this file is
-- only for upgrading an existing database. Safe to re-run: guarded via
-- information_schema, same pattern as the earlier migrations.
--
-- Usage:
--   mysql -u <user> -p <database> < backend/migrations/2026-07-30_add_tax_and_po_approval.sql

-- Orders
SET @col_exists = (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'orders' AND column_name = 'subtotal_amount');
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE orders ADD COLUMN subtotal_amount DECIMAL(14,2) NOT NULL DEFAULT 0 AFTER status, ADD COLUMN tax_rate DECIMAL(5,2) NOT NULL DEFAULT 0 AFTER subtotal_amount, ADD COLUMN tax_amount DECIMAL(14,2) NOT NULL DEFAULT 0 AFTER tax_rate',
  'SELECT ''subtotal_amount already exists on orders, skipping'' AS status'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
-- Backfill: existing rows had no concept of tax, so their whole
-- total_amount was always the subtotal (0% rate).
UPDATE orders SET subtotal_amount = total_amount WHERE subtotal_amount = 0 AND total_amount != 0;

-- Quotations
SET @col_exists = (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'quotations' AND column_name = 'subtotal_amount');
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE quotations ADD COLUMN subtotal_amount DECIMAL(14,2) NOT NULL DEFAULT 0 AFTER status, ADD COLUMN tax_rate DECIMAL(5,2) NOT NULL DEFAULT 0 AFTER subtotal_amount, ADD COLUMN tax_amount DECIMAL(14,2) NOT NULL DEFAULT 0 AFTER tax_rate',
  'SELECT ''subtotal_amount already exists on quotations, skipping'' AS status'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
UPDATE quotations SET subtotal_amount = total_amount WHERE subtotal_amount = 0 AND total_amount != 0;

-- Purchase orders: tax fields + approval fields
SET @col_exists = (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'purchase_orders' AND column_name = 'subtotal_amount');
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE purchase_orders ADD COLUMN subtotal_amount DECIMAL(14,2) NOT NULL DEFAULT 0 AFTER status, ADD COLUMN tax_rate DECIMAL(5,2) NOT NULL DEFAULT 0 AFTER subtotal_amount, ADD COLUMN tax_amount DECIMAL(14,2) NOT NULL DEFAULT 0 AFTER tax_rate',
  'SELECT ''subtotal_amount already exists on purchase_orders, skipping'' AS status'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
UPDATE purchase_orders SET subtotal_amount = total_amount WHERE subtotal_amount = 0 AND total_amount != 0;

SET @col_exists = (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'purchase_orders' AND column_name = 'approved_at');
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE purchase_orders ADD COLUMN approved_at DATETIME NULL AFTER cancel_reason, ADD COLUMN approved_by BIGINT UNSIGNED NULL AFTER approved_at, ADD CONSTRAINT fk_po_approved_by FOREIGN KEY (approved_by) REFERENCES users(id)',
  'SELECT ''approved_at already exists on purchase_orders, skipping'' AS status'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
