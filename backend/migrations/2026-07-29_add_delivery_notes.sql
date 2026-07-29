-- Adds Delivery Notes: proof of what physically left the warehouse
-- against a specific order -- the sales-side counterpart of a purchase
-- order receipt.
--
-- A fresh install via schema.sql already has all of this -- this is only
-- for upgrading an existing database. Safe to re-run: CREATE TABLE IF
-- NOT EXISTS and INSERT IGNORE are both naturally idempotent.
--
-- Usage:
--   mysql -u <user> -p <database> < backend/migrations/2026-07-29_add_delivery_notes.sql

CREATE TABLE IF NOT EXISTS delivery_notes (
    id                    BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    delivery_note_number  VARCHAR(30) NOT NULL UNIQUE,
    order_id              BIGINT UNSIGNED NOT NULL,
    delivery_date         DATE NOT NULL,
    status                ENUM('draft','issued','cancelled') NOT NULL DEFAULT 'draft',
    notes                 TEXT NULL,
    deleted_at            DATETIME NULL,
    created_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by            BIGINT UNSIGNED NULL,
    updated_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    updated_by            BIGINT UNSIGNED NULL,
    CONSTRAINT fk_dn_order FOREIGN KEY (order_id) REFERENCES orders(id),
    INDEX idx_dn_order (order_id),
    INDEX idx_dn_status (status),
    INDEX idx_dn_deleted_at (deleted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS delivery_note_lines (
    id                    BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    delivery_note_id      BIGINT UNSIGNED NOT NULL,
    product_id            BIGINT UNSIGNED NOT NULL,
    quantity_delivered    DECIMAL(14,4) NOT NULL,
    CONSTRAINT fk_dnl_note FOREIGN KEY (delivery_note_id) REFERENCES delivery_notes(id) ON DELETE CASCADE,
    CONSTRAINT fk_dnl_product FOREIGN KEY (product_id) REFERENCES products(id),
    INDEX idx_dnl_note (delivery_note_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO number_series (doc_type, prefix, next_number, padding) VALUES
    ('DELIVERY_NOTE', 'DN', 1, 5);
