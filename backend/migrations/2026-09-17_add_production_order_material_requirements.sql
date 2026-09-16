-- Adds the `production_order_material_requirements` table -- P3 of the
-- Production pass (see docs/production-lifecycle.md and the P3
-- implementation report). Persists the calculated material requirement
-- for a Production Order: how much of each raw material its BOM and
-- packaging definition call for, at the planned quantity.
--
-- Deliberately does NOT persist available/shortage quantities (those
-- are computed live from the existing inventory ledger every time
-- they're read, same "computed fresh" stance mrp_service already takes)
-- or an allocated-quantity column (that's P4's job to add).
--
-- A fresh install via schema.sql already has this table -- this file is
-- only for upgrading an existing database. Safe to re-run: CREATE TABLE
-- IF NOT EXISTS and INSERT IGNORE, same pattern as every other
-- new-table migration (e.g. 2026-09-16_add_production_orders.sql).
--
-- Dated the day after production_orders.sql on purpose, even though both
-- were written the same day: migrations/*.sql are applied in plain
-- filename-sorted order (see app/core/migrations.py), and this table's
-- own foreign key to production_orders(id) means it must run strictly
-- after that table exists. "2026-09-16_add_production_order_material_..."
-- would otherwise sort *before* "2026-09-16_add_production_orders.sql"
-- (an underscore sorts below 's'), applying this file first and failing
-- with "Foreign key constraint is incorrectly formed" (errno 150) since
-- production_orders wouldn't exist yet.
--
-- Usage:
--   mysql -u <user> -p <database> < backend/migrations/2026-09-17_add_production_order_material_requirements.sql

CREATE TABLE IF NOT EXISTS production_order_material_requirements (
    id                      BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    production_order_id    BIGINT UNSIGNED NOT NULL,
    bom_id                  BIGINT UNSIGNED NULL,        -- the BOM this row was calculated from (NULL for packaging-sourced rows)
    raw_material_id         BIGINT UNSIGNED NOT NULL,
    source                  ENUM('bom','packaging') NOT NULL,
    required_quantity       DECIMAL(14,4) NOT NULL,
    created_at              DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by              BIGINT UNSIGNED NULL,
    updated_at              DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    updated_by              BIGINT UNSIGNED NULL,
    CONSTRAINT fk_pomr_production_order FOREIGN KEY (production_order_id) REFERENCES production_orders(id),
    CONSTRAINT fk_pomr_bom FOREIGN KEY (bom_id) REFERENCES boms(id),
    CONSTRAINT fk_pomr_raw_material FOREIGN KEY (raw_material_id) REFERENCES raw_materials(id),
    UNIQUE KEY uq_pomr_line (production_order_id, raw_material_id, source),
    INDEX idx_pomr_production_order (production_order_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
