-- Department-based access control hardening: retires the "manager =
-- global write access" shape in favor of role + department + record
-- ownership (see app/core/permissions.py and app/api/customers.py).
--
-- 1. Widens users.role to add 'department_head' and 'team_member'.
--    'manager' and 'staff' stay in the enum (never dropped): a legacy
--    'staff' row is already exactly what 'team_member' means (department-
--    scoped, no special casing needed -- see app/core/permissions.py),
--    so it is treated as a team_member everywhere in code without a data
--    rewrite. 'manager' is NOT synonymous with 'department_head': see
--    step 3 for why some manager rows can't be migrated automatically.
--
-- 2. Adds customers.assigned_to -- the one ownership field this pass
--    introduces (see section 7/18 of the hardening spec). created_by
--    (already on every table via TimestampMixin) is left untouched: who
--    created a customer never changes, only who it's currently assigned
--    to does.
--
-- 3. Data migration for existing 'manager' users: a manager with a
--    department already on file becomes that department's
--    department_head (deterministic, no guessing). A manager with NO
--    department on file is intentionally left as role='manager' --
--    department_head/team_member both require a department (see
--    app/api/users.py validation added alongside this migration), so
--    there is no legal target role to move them to without guessing
--    one. app/core/permissions.py no longer gives 'manager' the old
--    global bypass, so any such row is running with NO page access
--    until an admin assigns it a department and role explicitly --
--    surfaced loudly below via a SELECT, not silently dropped.
--
-- Safe to re-run: every ALTER is guarded via information_schema, and the
-- UPDATE only ever touches rows still sitting at role='manager' with a
-- department_id already set (running it twice is a no-op the second
-- time since there won't be any such rows left).
--
-- A fresh install via schema.sql already has the new role enum -- this
-- file is only for upgrading an existing database.
--
-- Usage:
--   mysql -u <user> -p <database> < backend/migrations/2026-10-02_add_department_head_team_member_roles.sql

-- 1. Widen users.role.
SET @col_type = (
  SELECT COLUMN_TYPE FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'users' AND column_name = 'role'
);
SET @sql = IF(@col_type <> "enum('admin','manager','staff','viewer','department_head','team_member')",
  "ALTER TABLE users MODIFY role ENUM('admin','manager','staff','viewer','department_head','team_member') NOT NULL DEFAULT 'staff'",
  'SELECT ''users.role already includes department_head/team_member, skipping'' AS status'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2. customers.assigned_to
SET @has_col = (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'customers' AND column_name = 'assigned_to');
SET @sql = IF(@has_col = 0, 'ALTER TABLE customers ADD COLUMN assigned_to BIGINT UNSIGNED NULL AFTER category', 'SELECT ''customers.assigned_to already exists, skipping'' AS status');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_index = (SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'customers' AND index_name = 'idx_customers_assigned_to');
SET @sql = IF(@has_index = 0, 'CREATE INDEX idx_customers_assigned_to ON customers (assigned_to)', 'SELECT ''idx_customers_assigned_to already exists, skipping'' AS status');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_fk = (SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'customers' AND constraint_name = 'fk_customers_assigned_to');
SET @sql = IF(@has_fk = 0, 'ALTER TABLE customers ADD CONSTRAINT fk_customers_assigned_to FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL', 'SELECT ''fk_customers_assigned_to already exists, skipping'' AS status');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 3. Deterministic manager -> department_head migration (department
-- already on file only). Does nothing on a database where this already
-- ran, since no role='manager' row would still have one.
UPDATE users
SET role = 'department_head'
WHERE role = 'manager' AND department_id IS NOT NULL AND deleted_at IS NULL;

-- Surfaced in deploy logs (apply_all's on_notice, see
-- app/core/migrations.py) so an unresolved manager is never a silent
-- surprise -- these rows keep role='manager' and, as of this pass, have
-- NO page access anywhere until an admin gives them a department_id and
-- a real role via PUT /api/users/{id}.
SELECT CONCAT(
  'ACTION NEEDED: ', COUNT(*),
  ' user(s) still have role=manager with no department on file -- they lost global access ',
  'and now have NONE until an admin assigns them a department + role. ',
  'Run: SELECT id, username, email FROM users WHERE role=''manager'' AND department_id IS NULL AND deleted_at IS NULL (no trailing semicolon needed)'
) AS status
FROM users
WHERE role = 'manager' AND department_id IS NULL AND deleted_at IS NULL
HAVING COUNT(*) > 0;
