-- Adds suppliers.onboarding_status and suppliers.onboarding_reason -- the
-- "New supplier" wizard's onboarding workflow (pending -> under_review ->
-- active, with on_hold/rejected side states). Mirrors
-- 2026-09-08_add_customer_onboarding_status.sql exactly, applied to
-- suppliers. See app/models/supplier.py ONBOARDING_ALLOWED_TRANSITIONS
-- and app/services/supplier_service.change_onboarding_status.
--
-- A fresh install via schema.sql already has both columns -- this file is
-- only for upgrading an existing database. Safe to re-run: each ADD
-- COLUMN is guarded via information_schema.
--
-- Usage:
--   mysql -u <user> -p <database> < backend/migrations/2026-09-09_add_supplier_onboarding_status.sql

SET @has_onboarding_status = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'suppliers' AND column_name = 'onboarding_status'
);
SET @sql = IF(@has_onboarding_status = 0,
  'ALTER TABLE suppliers ADD COLUMN onboarding_status ENUM(''pending'',''under_review'',''active'',''on_hold'',''rejected'') NOT NULL DEFAULT ''pending'' AFTER status',
  'SELECT ''onboarding_status already exists on suppliers, skipping'' AS status'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_onboarding_reason = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'suppliers' AND column_name = 'onboarding_reason'
);
SET @sql = IF(@has_onboarding_reason = 0,
  'ALTER TABLE suppliers ADD COLUMN onboarding_reason TEXT NULL AFTER onboarding_status',
  'SELECT ''onboarding_reason already exists on suppliers, skipping'' AS status'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
