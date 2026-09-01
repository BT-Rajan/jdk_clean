-- Adds supplier_returns/supplier_return_lines (raw material sent back to
-- a supplier, almost always a quality rejection) and widens
-- stock_movements.movement_type with 'return_to_supplier' -- the
-- movement recorded when one is created. See supplier_return_service.py.
--
-- A fresh install via schema.sql already has all of this -- this file is
-- only for upgrading an existing database. Safe to re-run: the table
-- creates are idempotent and the enum widen is guarded via
-- information_schema, same pattern as earlier migrations.
--
-- Usage:
--   mysql -u <user> -p <database> < backend/migrations/2026-09-04_add_supplier_returns.sql

CREATE TABLE IF NOT EXISTS supplier_returns (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    return_number   VARCHAR(30) NOT NULL UNIQUE,
    supplier_id     BIGINT UNSIGNED NOT NULL,
    purchase_order_id BIGINT UNSIGNED NULL,
    return_date     DATE NOT NULL,
    reason          TEXT NOT NULL,
    notes           TEXT NULL,
    deleted_at      DATETIME NULL,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by      BIGINT UNSIGNED NULL,
    updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    updated_by      BIGINT UNSIGNED NULL,
    CONSTRAINT fk_sret_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
    CONSTRAINT fk_sret_po FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id),
    INDEX idx_sret_supplier (supplier_id),
    INDEX idx_sret_deleted_at (deleted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS supplier_return_lines (
    id                  BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    supplier_return_id  BIGINT UNSIGNED NOT NULL,
    raw_material_id     BIGINT UNSIGNED NOT NULL,
    quantity             DECIMAL(14,4) NOT NULL,
    CONSTRAINT fk_srl_return FOREIGN KEY (supplier_return_id) REFERENCES supplier_returns(id) ON DELETE CASCADE,
    CONSTRAINT fk_srl_material FOREIGN KEY (raw_material_id) REFERENCES raw_materials(id),
    INDEX idx_srl_return (supplier_return_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO number_series (doc_type, prefix, next_number, padding) VALUES
    ('SUPPLIER_RETURN', 'SRN', 1, 5);

SET @has_rts = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'stock_movements' AND column_name = 'movement_type'
    AND COLUMN_TYPE LIKE '%''return_to_supplier''%'
);
SET @sql = IF(@has_rts = 0,
  'ALTER TABLE stock_movements MODIFY COLUMN movement_type ENUM(''receipt'',''issue'',''adjustment'',''production_in'',''production_out'',''return'',''return_to_supplier'') NOT NULL',
  'SELECT ''return_to_supplier already in stock_movements.movement_type, skipping'' AS status'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
