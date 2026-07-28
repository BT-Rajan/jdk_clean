-- Adds the fields needed for the "what can a supplier supply, how much,
-- their mode of supply, and a star rating" feature, plus a 'suspended'
-- supplier status. A fresh install via schema.sql already has all of
-- this -- this is only for upgrading an existing database.
--
-- Safe to re-run: ADD COLUMN is guarded via information_schema (see
-- 2026-07-28_add_profile_fields.sql for why -- MySQL 8.x doesn't support
-- "ADD COLUMN IF NOT EXISTS"). The status ENUM MODIFY and the
-- CREATE TABLE IF NOT EXISTS are both naturally idempotent on their own.
--
-- Usage:
--   mysql -u <user> -p <database> < backend/migrations/2026-07-29_add_supplier_capability_fields.sql

SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'suppliers' AND column_name = 'mode_of_supply'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE suppliers ADD COLUMN mode_of_supply ENUM(''direct'',''distributor'',''broker'',''import'') NULL AFTER payment_terms_days',
  'SELECT ''mode_of_supply column already exists, skipping'' AS status'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'suppliers' AND column_name = 'rating'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE suppliers ADD COLUMN rating TINYINT UNSIGNED NULL AFTER mode_of_supply',
  'SELECT ''rating column already exists, skipping'' AS status'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Adding 'suspended' to an existing ENUM's allowed values: redefining it
-- to the same target list is a no-op on re-run, so this needs no guard.
ALTER TABLE suppliers MODIFY COLUMN status ENUM('active','inactive','suspended') NOT NULL DEFAULT 'active';

CREATE TABLE IF NOT EXISTS supplier_materials (
    id                  BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    supplier_id         BIGINT UNSIGNED NOT NULL,
    raw_material_id     BIGINT UNSIGNED NOT NULL,
    max_supply_quantity DECIMAL(14,4) NOT NULL,
    lead_time_days      SMALLINT UNSIGNED NULL,
    deleted_at          DATETIME NULL,
    created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by          BIGINT UNSIGNED NULL,
    updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    updated_by          BIGINT UNSIGNED NULL,
    CONSTRAINT fk_sm_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
    CONSTRAINT fk_sm_material FOREIGN KEY (raw_material_id) REFERENCES raw_materials(id),
    INDEX idx_sm_supplier (supplier_id),
    INDEX idx_sm_material (raw_material_id),
    INDEX idx_sm_deleted_at (deleted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
