-- Adds receipt-detail columns to stock_movements: supplier_id, unit_cost,
-- batch_number, expiry_date, invoice_number, received_by, received_date.
--
-- Every raw material coming into the factory used to be logged with only
-- a quantity and a free-text note if it didn't go through a Purchase
-- Order -- no supplier, no cost, no traceability. inventory_service.
-- adjust_stock now requires supplier_id, unit_cost, invoice_number,
-- received_by, and received_date on every raw_material 'receipt'
-- movement (batch_number and expiry_date stay optional -- not every raw
-- material is batch/expiry tracked). purchase_order_service.receive_lines
-- fills these in automatically from the PO where it can (supplier,
-- unit_cost default from the PO line) and accepts the rest per call.
--
-- A fresh install via schema.sql already has this -- this file is only
-- for upgrading an existing database. Safe to re-run.
--
-- Usage:
--   mysql -u <user> -p <database> < backend/migrations/2026-08-26_add_stock_movement_receipt_details.sql

SET @has_supplier_id = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'stock_movements' AND column_name = 'supplier_id'
);
SET @sql = IF(@has_supplier_id = 0,
  'ALTER TABLE stock_movements
     ADD COLUMN supplier_id BIGINT UNSIGNED NULL AFTER reference_id,
     ADD COLUMN unit_cost DECIMAL(14,4) NULL AFTER supplier_id,
     ADD COLUMN batch_number VARCHAR(60) NULL AFTER unit_cost,
     ADD COLUMN expiry_date DATE NULL AFTER batch_number,
     ADD COLUMN invoice_number VARCHAR(60) NULL AFTER expiry_date,
     ADD COLUMN received_by VARCHAR(120) NULL AFTER invoice_number,
     ADD COLUMN received_date DATE NULL AFTER received_by,
     ADD CONSTRAINT fk_stock_mov_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
     ADD INDEX idx_stock_mov_supplier (supplier_id)',
  'SELECT ''stock_movements receipt-detail columns already exist, skipping'' AS status'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
