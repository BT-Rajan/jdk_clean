-- Two related, previously-manual identifiers become auto-generated:
--   - customers.customer_number (new) -- an internal "Customer ID",
--     separate from `code` (which now holds the Civil ID / Registration
--     number the person types in -- see the 2026-09-14 migration).
--   - suppliers.code -- was typed in on the "New supplier" wizard's
--     Company Details step; from now on the backend generates it the
--     same way order_number/quotation_number/etc. already do (see
--     app/services/number_series_service.py). Existing supplier codes
--     are left exactly as they are -- only new suppliers get an
--     auto-generated one.
--
-- Both draw from the same number_series table every other auto-numbered
-- document uses, under new doc_types 'CUSTOMER' (prefix CUST) and
-- 'SUPPLIER' (prefix SUP).
--
-- A fresh install via schema.sql already has customer_number and both
-- number_series rows -- this file is only for upgrading an existing
-- database. Safe to re-run: every step is guarded via information_schema.
--
-- Usage:
--   mysql -u <user> -p <database> < backend/migrations/2026-09-15_add_customer_number_and_auto_supplier_code.sql

SET @has_customer_number = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'customers' AND column_name = 'customer_number'
);
SET @sql = IF(@has_customer_number = 0,
  'ALTER TABLE customers ADD COLUMN customer_number VARCHAR(30) NULL AFTER id',
  'SELECT ''customer_number already exists on customers, skipping'' AS status'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Backfill any existing customer left without one, oldest first, so
-- customer_number can become NOT NULL UNIQUE below. New customers never
-- hit this path -- CustomerCRUD.create always sets it before insert.
SET @rownum = 0;
UPDATE customers SET customer_number = CONCAT('CUST-', LPAD(@rownum:=@rownum+1, 5, '0'))
WHERE customer_number IS NULL ORDER BY id;

SET @customer_number_nullable = (
  SELECT IS_NULLABLE FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'customers' AND column_name = 'customer_number'
);
SET @sql = IF(@customer_number_nullable = 'YES',
  'ALTER TABLE customers MODIFY COLUMN customer_number VARCHAR(30) NOT NULL',
  'SELECT ''customers.customer_number already NOT NULL, skipping'' AS status'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_customer_number_key = (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'customers' AND index_name = 'uq_customers_customer_number'
);
SET @sql = IF(@has_customer_number_key = 0,
  'ALTER TABLE customers ADD UNIQUE KEY uq_customers_customer_number (customer_number)',
  'SELECT ''uq_customers_customer_number already exists, skipping'' AS status'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Seed the two number series. next_number for CUSTOMER continues on
-- from whatever the backfill above just claimed, so newly-created
-- customers never collide with a backfilled customer_number.
INSERT IGNORE INTO number_series (doc_type, prefix, next_number, padding) VALUES
    ('CUSTOMER', 'CUST', 1, 5),
    ('SUPPLIER', 'SUP', 1, 5);

UPDATE number_series
SET next_number = (SELECT COUNT(*) FROM customers) + 1
WHERE doc_type = 'CUSTOMER' AND next_number = 1;
