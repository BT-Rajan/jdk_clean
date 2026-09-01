-- Departments only had 3 seeded rows (sales, procurement, warehouse --
-- see 2026-08-31_add_departments.sql), but app/core/permissions.py's
-- PAGE_KEYS has carried a "production" page since the Production module
-- shipped, with no department to assign its staff to. Adds that missing
-- 4th department. Safe to re-run: ON DUPLICATE KEY guards it like every
-- other seed row.
--
-- Usage:
--   mysql -u <user> -p <database> < backend/migrations/2026-09-01_add_production_department.sql

INSERT INTO departments (code, name, status) VALUES
    ('production', 'Production', 'active')
ON DUPLICATE KEY UPDATE code = code;
