-- Per-customer/per-supplier overrides of the global approval thresholds
-- in Settings (large_po_approval_threshold, large_discount_approval_
-- threshold -- see app/services/settings_service.py). A trusted
-- long-standing party can be given a higher (or a new/risky one a lower)
-- ceiling than the factory-wide default, without changing that default
-- for everyone else. NULL on any of these means "use the global
-- setting" -- see settings_service.get_effective_po_approval_threshold /
-- get_effective_discount_approval_threshold.
--
-- Safe to re-run: each ALTER is guarded by information_schema so it only
-- fires while the column doesn't already exist.
--
-- A fresh install via schema.sql already has these columns -- this file
-- is only for upgrading an existing database.
--
-- Usage:
--   mysql -u <user> -p <database> < backend/migrations/2026-09-21_add_approval_threshold_overrides.sql

SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'customers'
    AND column_name = 'discount_approval_threshold_override'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE customers ADD COLUMN discount_approval_threshold_override DECIMAL(5,2) NULL AFTER payment_terms_days',
  'SELECT ''customers.discount_approval_threshold_override already exists, skipping'' AS status'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'suppliers'
    AND column_name = 'po_approval_threshold_override'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE suppliers ADD COLUMN po_approval_threshold_override DECIMAL(12,2) NULL AFTER payment_terms_days',
  'SELECT ''suppliers.po_approval_threshold_override already exists, skipping'' AS status'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'suppliers'
    AND column_name = 'discount_approval_threshold_override'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE suppliers ADD COLUMN discount_approval_threshold_override DECIMAL(5,2) NULL AFTER po_approval_threshold_override',
  'SELECT ''suppliers.discount_approval_threshold_override already exists, skipping'' AS status'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
