-- Manual stock adjustment hardening: a reservation/release lifecycle
-- event is now itself a traceable stock_movements row ('reserve'/
-- 'release' movement types added to the enum), and a manual adjustment
-- at/above the configurable large-stock-adjustment threshold is held
-- for admin approval in a new stock_adjustment_requests table instead
-- of applying immediately -- see inventory_service.
-- submit_manual_adjustment/approve_stock_adjustment_request.
--
-- Safe to re-run: the ALTER and CREATE TABLE are both guarded.
--
-- A fresh install via schema.sql already has both changes -- this file
-- is only for upgrading an existing database.
--
-- Usage:
--   mysql -u <user> -p <database> < backend/migrations/2026-10-07_add_stock_adjustment_approval.sql

ALTER TABLE stock_movements
    MODIFY COLUMN movement_type ENUM('receipt','issue','adjustment','production_in','production_out','return','return_to_supplier','reserve','release') NOT NULL;

CREATE TABLE IF NOT EXISTS stock_adjustment_requests (
    id                  BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    item_type           ENUM('raw_material','product') NOT NULL,
    item_id             BIGINT UNSIGNED NOT NULL,
    quantity            DECIMAL(14,4) NOT NULL,
    movement_type       VARCHAR(20) NOT NULL,
    reason              TEXT NOT NULL,
    supplier_id         BIGINT UNSIGNED NULL,
    unit_cost           DECIMAL(14,4) NULL,
    batch_number        VARCHAR(60) NULL,
    expiry_date         DATE NULL,
    invoice_number      VARCHAR(60) NULL,
    received_by         VARCHAR(120) NULL,
    received_date       DATE NULL,
    status              ENUM('pending','applied','rejected') NOT NULL DEFAULT 'pending',
    rejection_reason    TEXT NULL,
    resulting_movement_id BIGINT UNSIGNED NULL,
    requested_by        BIGINT UNSIGNED NULL,
    requested_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    decided_by          BIGINT UNSIGNED NULL,
    decided_at          DATETIME NULL,
    INDEX idx_stock_adj_req_status (status),
    INDEX idx_stock_adj_req_item (item_type, item_id),
    CONSTRAINT fk_stock_adj_req_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
    CONSTRAINT fk_stock_adj_req_movement FOREIGN KEY (resulting_movement_id) REFERENCES stock_movements(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
