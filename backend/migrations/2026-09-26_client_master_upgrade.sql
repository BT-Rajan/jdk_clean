-- Client Master Data hardening upgrade -- adds the fields genuinely
-- missing against the recently-upgraded Raw Materials Master pattern:
--
-- 1. customers.trade_name -- optional display/trading name, shown
--    instead of the legal `name` where set (falls back to `name`).
-- 2. customers.alternate_phone, customers.alternate_email -- backup
--    contact only, not deduplicated the way phone/email are.
-- 3. customers.category -- free-text operational classification for
--    filtering/reporting, same shape as raw_materials.category /
--    products.category.
-- 4. customers.payment_terms_type (cash/advance/credit/custom) --
--    classification alongside the existing numeric
--    payment_terms_days; app/crud/master_data.py enforces days > 0
--    when this is 'credit'.
--
-- A fresh install via schema.sql already reflects all of this -- this
-- file is only for upgrading an existing database. Safe to re-run:
-- every change is guarded via information_schema, same pattern as
-- earlier migrations.
--
-- Usage:
--   mysql -u <user> -p <database> < backend/migrations/2026-09-26_client_master_upgrade.sql

-- 1. customers.trade_name
SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'customers' AND column_name = 'trade_name'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE customers ADD COLUMN trade_name VARCHAR(150) NULL AFTER name',
  'SELECT ''customers.trade_name already exists, skipping'' AS status'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2a. customers.alternate_phone
SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'customers' AND column_name = 'alternate_phone'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE customers ADD COLUMN alternate_phone VARCHAR(30) NULL AFTER phone',
  'SELECT ''customers.alternate_phone already exists, skipping'' AS status'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2b. customers.alternate_email
SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'customers' AND column_name = 'alternate_email'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE customers ADD COLUMN alternate_email VARCHAR(120) NULL AFTER alternate_phone',
  'SELECT ''customers.alternate_email already exists, skipping'' AS status'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 3. customers.category
SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'customers' AND column_name = 'category'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE customers ADD COLUMN category VARCHAR(100) NULL AFTER country',
  'SELECT ''customers.category already exists, skipping'' AS status'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 4. customers.payment_terms_type
SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'customers' AND column_name = 'payment_terms_type'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE customers ADD COLUMN payment_terms_type ENUM(''cash'',''advance'',''credit'',''custom'') NOT NULL DEFAULT ''credit'' AFTER payment_terms_days',
  'SELECT ''customers.payment_terms_type already exists, skipping'' AS status'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
