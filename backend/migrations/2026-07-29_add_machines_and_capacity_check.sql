-- Adds machine-availability + time-required-for-production to the
-- feasibility check, on top of the existing raw-material check:
--   * New `machines` table -- production capacity (hours/day).
--   * `products.machine_id` / `products.production_hours_per_unit` -- the
--     "formula" data: which machine makes this product and how many
--     machine-hours one unit takes.
--   * `production_schedules.machine_id` -- so existing/planned batches can
--     be summed per machine to know what's already booked.
--   * `feasibility_lines.capacity_ok` / `capacity_shortfall_json` -- the
--     per-line result of checking the product's machine has enough free
--     capacity, between today and the check's required_by_date, for this
--     line's quantity.
--
-- A fresh install via schema.sql already has all of this -- this file is
-- only for upgrading an existing database. Safe to re-run: guarded via
-- information_schema, same pattern as the earlier migrations.
--
-- Usage:
--   mysql -u <user> -p <database> < backend/migrations/2026-07-29_add_machines_and_capacity_check.sql

CREATE TABLE IF NOT EXISTS machines (
    id                      BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    code                    VARCHAR(30)  NOT NULL UNIQUE,
    name                    VARCHAR(150) NOT NULL,
    capacity_hours_per_day  DECIMAL(6,2) NOT NULL DEFAULT 8,
    status                  ENUM('active','inactive') NOT NULL DEFAULT 'active',
    deleted_at              DATETIME NULL,
    created_at              DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by              BIGINT UNSIGNED NULL,
    updated_at              DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    updated_by              BIGINT UNSIGNED NULL,
    INDEX idx_machines_deleted_at (deleted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'products' AND column_name = 'machine_id'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE products ADD COLUMN machine_id BIGINT UNSIGNED NULL AFTER selling_price, ADD CONSTRAINT fk_products_machine FOREIGN KEY (machine_id) REFERENCES machines(id)',
  'SELECT ''machine_id column already exists, skipping'' AS status'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'products' AND column_name = 'production_hours_per_unit'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE products ADD COLUMN production_hours_per_unit DECIMAL(10,4) NULL AFTER machine_id',
  'SELECT ''production_hours_per_unit column already exists, skipping'' AS status'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'production_schedules' AND column_name = 'machine_id'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE production_schedules ADD COLUMN machine_id BIGINT UNSIGNED NULL AFTER product_id, ADD CONSTRAINT fk_ps_machine FOREIGN KEY (machine_id) REFERENCES machines(id)',
  'SELECT ''machine_id column already exists, skipping'' AS status'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'feasibility_lines' AND column_name = 'capacity_ok'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE feasibility_lines ADD COLUMN capacity_ok TINYINT(1) NULL AFTER shortfall_json',
  'SELECT ''capacity_ok column already exists, skipping'' AS status'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'feasibility_lines' AND column_name = 'capacity_shortfall_json'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE feasibility_lines ADD COLUMN capacity_shortfall_json TEXT NULL AFTER capacity_ok',
  'SELECT ''capacity_shortfall_json column already exists, skipping'' AS status'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
