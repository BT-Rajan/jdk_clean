-- Discounts, both per-line and whole-document (per the business-rules
-- scoping conversation): every line-item table (quotation_details,
-- order_details, purchase_order_lines) gains its own discount_percent,
-- applied before the line_total is computed; every document table
-- (quotations, orders, purchase_orders) gains a document-level
-- discount_percent + discount_amount, applied on top of the
-- already-line-discounted subtotal_amount. See app/core/pricing.py for
-- the shared computation.
--
-- A fresh install via schema.sql already has all of this -- this file is
-- only for upgrading an existing database. Safe to re-run: guarded via
-- information_schema, same pattern as the earlier migrations.
--
-- Usage:
--   mysql -u <user> -p <database> < backend/migrations/2026-07-31_add_discounts.sql

-- Line-level discount_percent
SET @col_exists = (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'quotation_details' AND column_name = 'discount_percent');
SET @sql = IF(@col_exists = 0, 'ALTER TABLE quotation_details ADD COLUMN discount_percent DECIMAL(5,2) NOT NULL DEFAULT 0 AFTER unit_price', 'SELECT ''discount_percent already exists on quotation_details, skipping'' AS status');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists = (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'order_details' AND column_name = 'discount_percent');
SET @sql = IF(@col_exists = 0, 'ALTER TABLE order_details ADD COLUMN discount_percent DECIMAL(5,2) NOT NULL DEFAULT 0 AFTER unit_price', 'SELECT ''discount_percent already exists on order_details, skipping'' AS status');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists = (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'purchase_order_lines' AND column_name = 'discount_percent');
SET @sql = IF(@col_exists = 0, 'ALTER TABLE purchase_order_lines ADD COLUMN discount_percent DECIMAL(5,2) NOT NULL DEFAULT 0 AFTER unit_price', 'SELECT ''discount_percent already exists on purchase_order_lines, skipping'' AS status');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Document-level discount_percent + discount_amount
SET @col_exists = (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'quotations' AND column_name = 'discount_percent');
SET @sql = IF(@col_exists = 0, 'ALTER TABLE quotations ADD COLUMN discount_percent DECIMAL(5,2) NOT NULL DEFAULT 0 AFTER subtotal_amount, ADD COLUMN discount_amount DECIMAL(14,2) NOT NULL DEFAULT 0 AFTER discount_percent', 'SELECT ''discount_percent already exists on quotations, skipping'' AS status');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists = (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'orders' AND column_name = 'discount_percent');
SET @sql = IF(@col_exists = 0, 'ALTER TABLE orders ADD COLUMN discount_percent DECIMAL(5,2) NOT NULL DEFAULT 0 AFTER subtotal_amount, ADD COLUMN discount_amount DECIMAL(14,2) NOT NULL DEFAULT 0 AFTER discount_percent', 'SELECT ''discount_percent already exists on orders, skipping'' AS status');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists = (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'purchase_orders' AND column_name = 'discount_percent');
SET @sql = IF(@col_exists = 0, 'ALTER TABLE purchase_orders ADD COLUMN discount_percent DECIMAL(5,2) NOT NULL DEFAULT 0 AFTER subtotal_amount, ADD COLUMN discount_amount DECIMAL(14,2) NOT NULL DEFAULT 0 AFTER discount_percent', 'SELECT ''discount_percent already exists on purchase_orders, skipping'' AS status');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
