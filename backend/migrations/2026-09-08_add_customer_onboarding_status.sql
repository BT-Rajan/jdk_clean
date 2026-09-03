-- Adds customers.onboarding_status and customers.onboarding_reason -- the
-- "New customer" wizard's onboarding workflow (pending -> under_review ->
-- active, with on_hold/rejected side states). See app/models/customer.py
-- ONBOARDING_ALLOWED_TRANSITIONS and app/services/customer_service.
-- change_onboarding_status.
--
-- A fresh install via schema.sql already has both columns -- this file is
-- only for upgrading an existing database. Safe to re-run: each ADD
-- COLUMN is guarded via information_schema.
--
-- Usage:
--   mysql -u <user> -p <database> < backend/migrations/2026-09-08_add_customer_onboarding_status.sql

SET @has_onboarding_status = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'customers' AND column_name = 'onboarding_status'
);
SET @sql = IF(@has_onboarding_status = 0,
  'ALTER TABLE customers ADD COLUMN onboarding_status ENUM(''pending'',''under_review'',''active'',''on_hold'',''rejected'') NOT NULL DEFAULT ''pending'' AFTER status',
  'SELECT ''onboarding_status already exists on customers, skipping'' AS status'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_onboarding_reason = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'customers' AND column_name = 'onboarding_reason'
);
SET @sql = IF(@has_onboarding_reason = 0,
  'ALTER TABLE customers ADD COLUMN onboarding_reason TEXT NULL AFTER onboarding_status',
  'SELECT ''onboarding_reason already exists on customers, skipping'' AS status'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
