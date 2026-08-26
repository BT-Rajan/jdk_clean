-- Creates units_of_measure -- the admin-managed unit list (kg/ton/bag/
-- pcs) that raw_materials.unit and bom_lines.unit are validated against
-- and looked up in for quantity conversion. See
-- app/models/unit_of_measure.py and app/services/bom_service.py.
--
-- A fresh install via schema.sql already has this -- this file is only
-- for upgrading an existing database. Safe to re-run.
--
-- Usage:
--   mysql -u <user> -p <database> < backend/migrations/2026-08-26_add_units_of_measure.sql

CREATE TABLE IF NOT EXISTS units_of_measure (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    code            VARCHAR(20)  NOT NULL UNIQUE,
    name            VARCHAR(60)  NOT NULL,
    category        ENUM('weight','count','volume') NOT NULL,
    factor_to_base  DECIMAL(14,6) NOT NULL DEFAULT 1,
    is_base         TINYINT(1) NOT NULL DEFAULT 0,
    status          ENUM('active','inactive') NOT NULL DEFAULT 'active',
    deleted_at      DATETIME NULL,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by      BIGINT UNSIGNED NULL,
    updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    updated_by      BIGINT UNSIGNED NULL,
    INDEX idx_uom_deleted_at (deleted_at),
    INDEX idx_uom_category (category)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- `bag` = 50kg is a configurable assumption -- edit this row's
-- factor_to_base under Settings -> Units of measure if that's wrong for
-- what's actually being bagged, or add more specific bag-size units
-- (e.g. "bag25") alongside it. ON DUPLICATE KEY UPDATE makes this safe
-- to re-run without erroring if these codes already exist.
INSERT INTO units_of_measure (code, name, category, factor_to_base, is_base, status) VALUES
    ('kg',  'Kilogram',    'weight', 1,    1, 'active'),
    ('ton', 'Metric Ton',  'weight', 1000, 0, 'active'),
    ('bag', 'Bag (50kg)',  'weight', 50,   0, 'active'),
    ('pcs', 'Pieces',      'count',  1,    1, 'active')
ON DUPLICATE KEY UPDATE code = code;
