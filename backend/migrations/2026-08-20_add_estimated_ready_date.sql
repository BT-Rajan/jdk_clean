-- Adds feasibility_lines.estimated_ready_date -- the date by which the
-- remainder of a line's quantity (after netting off finished-goods
-- stock) can actually be supplied: today if fully covered by stock,
-- otherwise the machine/labor capacity scan's projected completion
-- date. Always computed when evaluable (materials sufficient, capacity
-- scan runs), regardless of whether the check itself has a
-- required_by_date -- this is what lets Sales see *when* the remainder
-- ships, not just whether it beats a deadline. See feasibility_service.
-- run_check / _check_capacity.
--
-- Also seeds the factory_working_days setting (Sunday-Thursday, Kuwait's
-- standard work week) if it isn't already set, so the capacity scan's
-- "next working day" logic has something to read on an existing
-- install. INSERT IGNORE is a no-op if an admin already configured it.
--
-- A fresh install via schema.sql already has both -- this file is only
-- for upgrading an existing database. Safe to re-run.
--
-- Usage:
--   mysql -u <user> -p <database> < backend/migrations/2026-08-20_add_estimated_ready_date.sql

SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'feasibility_lines' AND column_name = 'estimated_ready_date'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE feasibility_lines ADD COLUMN estimated_ready_date DATE NULL AFTER capacity_shortfall_json',
  'SELECT ''estimated_ready_date column already exists, skipping'' AS status'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

INSERT IGNORE INTO settings (setting_key, setting_value) VALUES
    ('factory_working_days', 'Sun,Mon,Tue,Wed,Thu');
