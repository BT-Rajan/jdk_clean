-- Upgrades Raw Material into a fuller manufacturing material-control
-- master: identity/classification fields, stock-control thresholds
-- beyond reorder_point, lightweight QC flags, and a 'blocked' status
-- (see app/models/raw_material.py); extends supplier_materials with
-- supplier-specific pricing/terms (see app/models/supplier_material.py);
-- and adds the raw_material_alternatives table for approved substitutes
-- (see app/models/raw_material_alternative.py).
--
-- A fresh install via schema.sql already has all of this -- this file is
-- only for upgrading an existing database. Safe to re-run: every step is
-- guarded via information_schema, same pattern as the earlier migrations.
--
-- Usage:
--   mysql -u <user> -p <database> < backend/migrations/2026-09-16_raw_material_master_upgrade.sql

-- ============================================================
-- raw_materials: identity/classification + stock control + QC
-- ============================================================
SET @has_col = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'raw_materials' AND column_name = 'material_type'
);
SET @sql = IF(@has_col = 0,
  'ALTER TABLE raw_materials
     ADD COLUMN material_type ENUM(''raw_material'',''packaging'',''consumable'') NOT NULL DEFAULT ''raw_material'' AFTER name,
     ADD COLUMN category VARCHAR(100) NULL AFTER material_type,
     ADD COLUMN description TEXT NULL AFTER category,
     ADD COLUMN properties JSON NULL AFTER description,
     ADD COLUMN manufacturer VARCHAR(150) NULL AFTER properties,
     ADD COLUMN manufacturer_part_number VARCHAR(100) NULL AFTER manufacturer',
  'SELECT ''material_type already exists on raw_materials, skipping'' AS status'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_col = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'raw_materials' AND column_name = 'safety_stock'
);
SET @sql = IF(@has_col = 0,
  'ALTER TABLE raw_materials
     ADD COLUMN safety_stock DECIMAL(14,4) NOT NULL DEFAULT 0 AFTER reorder_point,
     ADD COLUMN maximum_stock DECIMAL(14,4) NOT NULL DEFAULT 0 AFTER safety_stock,
     ADD COLUMN storage_location VARCHAR(100) NULL AFTER maximum_stock',
  'SELECT ''safety_stock already exists on raw_materials, skipping'' AS status'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_col = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'raw_materials' AND column_name = 'inspection_required'
);
SET @sql = IF(@has_col = 0,
  'ALTER TABLE raw_materials
     ADD COLUMN inspection_required TINYINT(1) NOT NULL DEFAULT 0 AFTER unit_cost,
     ADD COLUMN certificate_required TINYINT(1) NOT NULL DEFAULT 0 AFTER inspection_required,
     ADD COLUMN qc_notes TEXT NULL AFTER certificate_required',
  'SELECT ''inspection_required already exists on raw_materials, skipping'' AS status'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_blocked = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'raw_materials' AND column_name = 'status'
    AND COLUMN_TYPE LIKE '%''blocked''%'
);
SET @sql = IF(@has_blocked = 0,
  'ALTER TABLE raw_materials MODIFY COLUMN status ENUM(''active'',''inactive'',''blocked'') NOT NULL DEFAULT ''active''',
  'SELECT ''blocked already in raw_materials.status, skipping'' AS status'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ============================================================
-- supplier_materials: supplier-specific pricing/terms
-- ============================================================
SET @has_col = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'supplier_materials' AND column_name = 'purchase_price'
);
SET @sql = IF(@has_col = 0,
  'ALTER TABLE supplier_materials
     ADD COLUMN supplier_material_code VARCHAR(60) NULL AFTER raw_material_id,
     ADD COLUMN purchase_price DECIMAL(14,4) NOT NULL DEFAULT 0 AFTER supplier_material_code,
     ADD COLUMN currency VARCHAR(3) NOT NULL DEFAULT ''KWD'' AFTER purchase_price,
     ADD COLUMN moq DECIMAL(14,4) NOT NULL DEFAULT 0 AFTER max_supply_quantity,
     ADD COLUMN is_preferred TINYINT(1) NOT NULL DEFAULT 0 AFTER moq,
     ADD COLUMN status ENUM(''active'',''inactive'') NOT NULL DEFAULT ''active'' AFTER is_preferred',
  'SELECT ''purchase_price already exists on supplier_materials, skipping'' AS status'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ============================================================
-- raw_material_alternatives: approved substitutes
-- ============================================================
CREATE TABLE IF NOT EXISTS raw_material_alternatives (
    id                      BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    raw_material_id         BIGINT UNSIGNED NOT NULL,
    alternative_material_id BIGINT UNSIGNED NOT NULL,
    priority                SMALLINT UNSIGNED NOT NULL DEFAULT 1,
    status                  ENUM('approved','blocked') NOT NULL DEFAULT 'approved',
    conversion_ratio        DECIMAL(14,6) NOT NULL DEFAULT 1,
    notes                   VARCHAR(255) NULL,
    deleted_at              DATETIME NULL,
    created_at              DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by              BIGINT UNSIGNED NULL,
    updated_at              DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    updated_by              BIGINT UNSIGNED NULL,
    CONSTRAINT fk_rma_material FOREIGN KEY (raw_material_id) REFERENCES raw_materials(id),
    CONSTRAINT fk_rma_alternative FOREIGN KEY (alternative_material_id) REFERENCES raw_materials(id),
    INDEX idx_rma_material (raw_material_id),
    INDEX idx_rma_alternative (alternative_material_id),
    INDEX idx_rma_deleted_at (deleted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
