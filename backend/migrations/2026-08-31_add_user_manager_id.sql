-- Adds users.manager_id -- a nullable self-referential FK recording which
-- Manager a Member (staff/viewer) reports to. Only meaningful for
-- staff/viewer rows; admin ("Owner") and manager rows are always drawn at
-- their own fixed tier in the org chart and don't need it set. Reporting
-- is deliberately NOT restricted to same-department (see AccessControlTab
-- org chart / app/api/users.py update_user validation, which only checks
-- that the target is an active manager, not that departments match).
--
-- ON DELETE SET NULL rather than CASCADE/RESTRICT: soft-deleting or
-- removing a manager should drop their reports back to "unassigned" in
-- the chart, not cascade-delete real staff accounts or block the delete.
--
-- A fresh install via schema.sql already has this -- this file is only
-- for upgrading an existing database. Safe to re-run.
--
-- Usage:
--   mysql -u <user> -p <database> < backend/migrations/2026-08-31_add_user_manager_id.sql

SET @has_manager_id = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'users' AND column_name = 'manager_id'
);
SET @sql = IF(@has_manager_id = 0,
  'ALTER TABLE users ADD COLUMN manager_id BIGINT UNSIGNED NULL AFTER department',
  'SELECT ''manager_id already exists on users, skipping'' AS status'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_fk = (
  SELECT COUNT(*) FROM information_schema.table_constraints
  WHERE table_schema = DATABASE() AND table_name = 'users' AND constraint_name = 'fk_users_manager_id'
);
SET @sql = IF(@has_fk = 0,
  'ALTER TABLE users ADD CONSTRAINT fk_users_manager_id FOREIGN KEY (manager_id) REFERENCES users(id) ON DELETE SET NULL',
  'SELECT ''fk_users_manager_id already exists, skipping'' AS status'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_index = (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'users' AND index_name = 'idx_users_manager_id'
);
SET @sql = IF(@has_index = 0,
  'CREATE INDEX idx_users_manager_id ON users (manager_id)',
  'SELECT ''idx_users_manager_id already exists, skipping'' AS status'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
