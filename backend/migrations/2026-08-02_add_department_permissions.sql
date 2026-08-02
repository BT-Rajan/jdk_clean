-- Governs which pages a 'staff' user (identified by their department)
-- can view or edit. admin/manager always have full access everywhere;
-- 'viewer' always has read-only access everywhere; neither consults
-- this table. Only 'staff' users are governed by it, since department
-- is the whole basis for the permission -- see
-- backend/app/core/permissions.py.
--
-- A fresh install via schema.sql already has this -- this file is only
-- for upgrading an existing database.
--
-- Usage:
--   mysql -u <user> -p <database> < backend/migrations/2026-08-02_add_department_permissions.sql

CREATE TABLE IF NOT EXISTS department_permissions (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    department      ENUM('sales','procurement','warehouse') NOT NULL,
    page_key        VARCHAR(40) NOT NULL,
    access_level    ENUM('none','read','write') NOT NULL DEFAULT 'none',
    updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    updated_by      BIGINT UNSIGNED NULL,
    CONSTRAINT fk_dept_perm_updated_by FOREIGN KEY (updated_by) REFERENCES users(id),
    UNIQUE KEY uq_dept_perm (department, page_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
