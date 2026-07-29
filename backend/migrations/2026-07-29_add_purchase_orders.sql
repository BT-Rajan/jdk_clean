-- Adds Purchase Orders: the supply-side counterpart to sales Orders,
-- closing the loop MRP's supplier suggestions previously had nowhere to
-- land except a manual "Adjust stock" receipt.
--
-- A fresh install via schema.sql already has all of this -- this is only
-- for upgrading an existing database. Safe to re-run: CREATE TABLE IF
-- NOT EXISTS and INSERT IGNORE are both naturally idempotent.
--
-- Usage:
--   mysql -u <user> -p <database> < backend/migrations/2026-07-29_add_purchase_orders.sql

CREATE TABLE IF NOT EXISTS purchase_orders (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    po_number       VARCHAR(30) NOT NULL UNIQUE,
    supplier_id     BIGINT UNSIGNED NOT NULL,
    order_date      DATE NOT NULL,
    expected_delivery_date DATE NULL,
    status          ENUM('draft','sent','confirmed','partially_received','received','cancelled') NOT NULL DEFAULT 'draft',
    total_amount    DECIMAL(14,2) NOT NULL DEFAULT 0,
    notes           TEXT NULL,
    deleted_at      DATETIME NULL,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by      BIGINT UNSIGNED NULL,
    updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    updated_by      BIGINT UNSIGNED NULL,
    CONSTRAINT fk_po_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
    INDEX idx_po_status (status),
    INDEX idx_po_deleted_at (deleted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS purchase_order_lines (
    id                  BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    purchase_order_id   BIGINT UNSIGNED NOT NULL,
    raw_material_id     BIGINT UNSIGNED NOT NULL,
    quantity            DECIMAL(14,4) NOT NULL,
    unit_price          DECIMAL(14,2) NOT NULL,
    line_total          DECIMAL(14,2) NOT NULL,
    received_quantity   DECIMAL(14,4) NOT NULL DEFAULT 0,
    CONSTRAINT fk_pol_po FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id) ON DELETE CASCADE,
    CONSTRAINT fk_pol_material FOREIGN KEY (raw_material_id) REFERENCES raw_materials(id),
    INDEX idx_pol_po (purchase_order_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO number_series (doc_type, prefix, next_number, padding) VALUES
    ('PURCHASE_ORDER', 'PO', 1, 5);
