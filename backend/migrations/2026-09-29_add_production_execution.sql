-- P6 of the Production pass (see docs/production-lifecycle.md and the
-- P6 implementation report): adds `consumed_quantity` to
-- production_order_material_requirements (the column P4's own docstring
-- anticipated -- how much of a row's allocation has actually been
-- issued to production, as a running total independent of
-- allocated_quantity), and the new production_executions table -- the
-- WHAT-HAPPENED record for the Production Order flow, alongside
-- production_orders (WHAT, P2) and production_schedules (WHEN/WHERE for
-- this flow, P5).
--
-- A fresh install via schema.sql already has both -- this file is only
-- for upgrading an existing database. Safe to re-run: guarded by
-- information_schema, same pattern as every other ALTER migration.
--
-- Usage:
--   mysql -u <user> -p <database> < backend/migrations/2026-09-29_add_production_execution.sql

SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'production_order_material_requirements' AND column_name = 'consumed_quantity'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE production_order_material_requirements ADD COLUMN consumed_quantity DECIMAL(14,4) NOT NULL DEFAULT 0 AFTER allocated_quantity',
  'SELECT ''production_order_material_requirements.consumed_quantity already exists, skipping'' AS status'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

CREATE TABLE IF NOT EXISTS production_executions (
    id                  BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    production_order_id BIGINT UNSIGNED NOT NULL,
    schedule_id         BIGINT UNSIGNED NOT NULL,
    product_id          BIGINT UNSIGNED NOT NULL,
    machine_id          BIGINT UNSIGNED NULL,
    planned_quantity    DECIMAL(14,4) NOT NULL,
    produced_quantity   DECIMAL(14,4) NOT NULL DEFAULT 0,
    started_at          DATETIME NOT NULL,
    ended_at            DATETIME NULL,
    status              ENUM('in_progress','completed','cancelled') NOT NULL DEFAULT 'in_progress',
    started_by          BIGINT UNSIGNED NULL,
    completed_by        BIGINT UNSIGNED NULL,
    cancel_reason       TEXT NULL,
    notes               TEXT NULL,
    created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by          BIGINT UNSIGNED NULL,
    updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    updated_by          BIGINT UNSIGNED NULL,
    CONSTRAINT fk_pe_production_order FOREIGN KEY (production_order_id) REFERENCES production_orders(id),
    CONSTRAINT fk_pe_schedule FOREIGN KEY (schedule_id) REFERENCES production_schedules(id),
    CONSTRAINT fk_pe_product FOREIGN KEY (product_id) REFERENCES products(id),
    CONSTRAINT fk_pe_machine FOREIGN KEY (machine_id) REFERENCES machines(id),
    CONSTRAINT fk_pe_started_by FOREIGN KEY (started_by) REFERENCES users(id),
    CONSTRAINT fk_pe_completed_by FOREIGN KEY (completed_by) REFERENCES users(id),
    INDEX idx_pe_production_order (production_order_id),
    INDEX idx_pe_schedule (schedule_id),
    INDEX idx_pe_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
