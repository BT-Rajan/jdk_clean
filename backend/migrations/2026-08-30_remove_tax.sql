-- Removes tax support entirely: it was provisioned (Kuwait has no
-- GST/VAT) but never activated, and the business decision is now to
-- not carry the dead weight -- no tax_rate/tax_amount on documents, no
-- tax_id on customers/suppliers, no default_tax_rate setting.
--
-- A fresh install via schema.sql no longer has any of this -- this
-- file is only for upgrading an existing database. Safe to re-run:
-- guarded via information_schema, same pattern as the earlier
-- migrations.
--
-- Usage:
--   mysql -u <user> -p <database> < backend/migrations/2026-08-30_remove_tax.sql

-- Orders
SET @col_exists = (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'orders' AND column_name = 'tax_rate');
SET @sql = IF(@col_exists > 0, 'ALTER TABLE orders DROP COLUMN tax_rate, DROP COLUMN tax_amount', 'SELECT ''tax_rate already absent on orders, skipping'' AS status');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Quotations
SET @col_exists = (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'quotations' AND column_name = 'tax_rate');
SET @sql = IF(@col_exists > 0, 'ALTER TABLE quotations DROP COLUMN tax_rate, DROP COLUMN tax_amount', 'SELECT ''tax_rate already absent on quotations, skipping'' AS status');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Purchase orders
SET @col_exists = (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'purchase_orders' AND column_name = 'tax_rate');
SET @sql = IF(@col_exists > 0, 'ALTER TABLE purchase_orders DROP COLUMN tax_rate, DROP COLUMN tax_amount', 'SELECT ''tax_rate already absent on purchase_orders, skipping'' AS status');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Customers
SET @col_exists = (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'customers' AND column_name = 'tax_id');
SET @sql = IF(@col_exists > 0, 'ALTER TABLE customers DROP COLUMN tax_id', 'SELECT ''tax_id already absent on customers, skipping'' AS status');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Suppliers
SET @col_exists = (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'suppliers' AND column_name = 'tax_id');
SET @sql = IF(@col_exists > 0, 'ALTER TABLE suppliers DROP COLUMN tax_id', 'SELECT ''tax_id already absent on suppliers, skipping'' AS status');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Settings: drop the provisioned-but-never-active default_tax_rate row.
DELETE FROM settings WHERE setting_key = 'default_tax_rate';
