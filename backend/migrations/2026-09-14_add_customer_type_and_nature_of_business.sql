-- Adds customers.customer_type ('individual'/'business') and
-- customers.nature_of_business -- the onboarding wizard's new first
-- question ("Business or Individual") and the business-only free-text
-- field it unlocks. See app/models/customer.py CUSTOMER_TYPES.
--
-- customer_type defaults to 'business' so existing rows (all onboarded
-- before this field existed) stay valid without a backfill decision --
-- admin can correct any that were actually individuals via the now-
-- editable-anytime edit form.
--
-- A fresh install via schema.sql already has both columns -- this file is
-- only for upgrading an existing database. Safe to re-run: each ADD
-- COLUMN is guarded via information_schema.
--
-- Usage:
--   mysql -u <user> -p <database> < backend/migrations/2026-09-14_add_customer_type_and_nature_of_business.sql

SET @has_customer_type = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'customers' AND column_name = 'customer_type'
);
SET @sql = IF(@has_customer_type = 0,
  'ALTER TABLE customers ADD COLUMN customer_type ENUM(''individual'',''business'') NOT NULL DEFAULT ''business'' AFTER id',
  'SELECT ''customer_type already exists on customers, skipping'' AS status'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_nature_of_business = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'customers' AND column_name = 'nature_of_business'
);
SET @sql = IF(@has_nature_of_business = 0,
  'ALTER TABLE customers ADD COLUMN nature_of_business VARCHAR(150) NULL AFTER name',
  'SELECT ''nature_of_business already exists on customers, skipping'' AS status'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
