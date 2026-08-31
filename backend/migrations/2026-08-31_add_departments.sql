-- MDM consolidation: Departments become a real master table instead of a
-- hardcoded ENUM('sales','procurement','warehouse') repeated on users,
-- department_permissions, and in Python (services/permission_service.py,
-- schemas/user.py). See app/models/department.py -- it's on the same
-- generic CRUD engine (app/crud/base.py) as every other master.
--
-- This file: creates departments, seeds the 3 existing values, adds
-- department_id to users and department_permissions, backfills it from
-- the old department ENUM column, then drops that column (and its
-- (department, page_key) unique key, replaced by (department_id, page_key)).
--
-- A fresh install via schema.sql already has the new shape -- this file
-- is only for upgrading an existing database. Safe to re-run: every step
-- is guarded via information_schema, same pattern as earlier migrations.
--
-- Usage:
--   mysql -u <user> -p <database> < backend/migrations/2026-08-31_add_departments.sql

-- 1. departments table + seed
CREATE TABLE IF NOT EXISTS departments (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    code            VARCHAR(30)  NOT NULL UNIQUE,
    name            VARCHAR(80)  NOT NULL,
    status          ENUM('active','inactive') NOT NULL DEFAULT 'active',
    deleted_at      DATETIME NULL,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by      BIGINT UNSIGNED NULL,
    updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    updated_by      BIGINT UNSIGNED NULL,
    INDEX idx_departments_deleted_at (deleted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO departments (code, name, status) VALUES
    ('sales',       'Sales',       'active'),
    ('procurement', 'Procurement', 'active'),
    ('warehouse',   'Warehouse',   'active')
ON DUPLICATE KEY UPDATE code = code;

-- 2. users.department_id: add, backfill, then drop the old ENUM column.
SET @has_col = (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'users' AND column_name = 'department_id');
SET @sql = IF(@has_col = 0, 'ALTER TABLE users ADD COLUMN department_id BIGINT UNSIGNED NULL AFTER avatar_filename', 'SELECT ''department_id already exists on users, skipping'' AS status');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_fk = (SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'users' AND constraint_name = 'fk_users_department_id');
SET @sql = IF(@has_fk = 0, 'ALTER TABLE users ADD CONSTRAINT fk_users_department_id FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL', 'SELECT ''fk_users_department_id already exists, skipping'' AS status');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_index = (SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'users' AND index_name = 'idx_users_department_id');
SET @sql = IF(@has_index = 0, 'CREATE INDEX idx_users_department_id ON users (department_id)', 'SELECT ''idx_users_department_id already exists, skipping'' AS status');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Backfill: only touches rows the old column still has an answer for --
-- a no-op on re-run since department_id is already set by then.
SET @old_col_exists = (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'users' AND column_name = 'department');
SET @sql = IF(@old_col_exists > 0,
  'UPDATE users u JOIN departments d ON d.code = u.department SET u.department_id = d.id WHERE u.department_id IS NULL AND u.department IS NOT NULL',
  'SELECT ''users.department already absent, skipping backfill'' AS status');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @old_col_exists = (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'users' AND column_name = 'department');
SET @sql = IF(@old_col_exists > 0, 'ALTER TABLE users DROP COLUMN department', 'SELECT ''users.department already dropped, skipping'' AS status');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 3. department_permissions.department_id: same add/backfill/drop, plus
-- swapping the unique key from (department, page_key) to (department_id, page_key).
SET @has_col = (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'department_permissions' AND column_name = 'department_id');
SET @sql = IF(@has_col = 0, 'ALTER TABLE department_permissions ADD COLUMN department_id BIGINT UNSIGNED NULL AFTER id', 'SELECT ''department_id already exists on department_permissions, skipping'' AS status');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @old_col_exists = (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'department_permissions' AND column_name = 'department');
SET @sql = IF(@old_col_exists > 0,
  'UPDATE department_permissions dp JOIN departments d ON d.code = dp.department SET dp.department_id = d.id WHERE dp.department_id IS NULL',
  'SELECT ''department_permissions.department already absent, skipping backfill'' AS status');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Old unique key on (department, page_key) has to go before the old
-- column can be dropped, and before the new one can be added.
SET @has_old_key = (SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'department_permissions' AND index_name = 'uq_dept_perm');
SET @old_col_exists = (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'department_permissions' AND column_name = 'department');
SET @sql = IF(@has_old_key > 0 AND @old_col_exists > 0, 'ALTER TABLE department_permissions DROP INDEX uq_dept_perm', 'SELECT ''uq_dept_perm already absent, skipping'' AS status');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @old_col_exists = (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'department_permissions' AND column_name = 'department');
SET @sql = IF(@old_col_exists > 0, 'ALTER TABLE department_permissions DROP COLUMN department', 'SELECT ''department_permissions.department already dropped, skipping'' AS status');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @null_left = (SELECT COUNT(*) FROM department_permissions WHERE department_id IS NULL);
SET @is_nullable = (SELECT IS_NULLABLE FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'department_permissions' AND column_name = 'department_id');
SET @sql = IF(@null_left = 0 AND @is_nullable = 'YES', 'ALTER TABLE department_permissions MODIFY COLUMN department_id BIGINT UNSIGNED NOT NULL', 'SELECT ''department_permissions.department_id already NOT NULL or has NULLs, skipping'' AS status');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_new_key = (SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'department_permissions' AND index_name = 'uq_dept_perm_id');
SET @sql = IF(@has_new_key = 0, 'ALTER TABLE department_permissions ADD UNIQUE KEY uq_dept_perm_id (department_id, page_key)', 'SELECT ''uq_dept_perm_id already exists, skipping'' AS status');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_fk = (SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'department_permissions' AND constraint_name = 'fk_dept_perm_department_id');
SET @sql = IF(@has_fk = 0, 'ALTER TABLE department_permissions ADD CONSTRAINT fk_dept_perm_department_id FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE CASCADE', 'SELECT ''fk_dept_perm_department_id already exists, skipping'' AS status');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
