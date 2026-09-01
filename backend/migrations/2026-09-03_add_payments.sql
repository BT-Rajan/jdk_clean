-- Adds a payments table (recorded against an order, entered by hand once
-- someone's confirmed the money actually arrived -- bank transfer,
-- cheque, cash; there's no online payment collection yet) and
-- orders.payment_requested_at (set when a payment-request email goes
-- out, purely informational). Together with customers.credit_limit
-- (already existed, previously unenforced) these back the credit-limit
-- gate on order confirmation -- see payment_service.py and
-- order_service.py's change_status.
--
-- A fresh install via schema.sql already has both -- this file is only
-- for upgrading an existing database. Safe to re-run: the table create
-- is idempotent and the column add is guarded via information_schema,
-- same pattern as earlier migrations.
--
-- Usage:
--   mysql -u <user> -p <database> < backend/migrations/2026-09-03_add_payments.sql

CREATE TABLE IF NOT EXISTS payments (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    order_id        BIGINT UNSIGNED NOT NULL,
    customer_id     BIGINT UNSIGNED NOT NULL,
    amount          DECIMAL(14,2) NOT NULL,
    payment_date    DATE NOT NULL,
    method          VARCHAR(60) NULL,
    reference       VARCHAR(120) NULL,
    notes           TEXT NULL,
    deleted_at      DATETIME NULL,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by      BIGINT UNSIGNED NULL,
    updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    updated_by      BIGINT UNSIGNED NULL,
    CONSTRAINT fk_payments_order FOREIGN KEY (order_id) REFERENCES orders(id),
    CONSTRAINT fk_payments_customer FOREIGN KEY (customer_id) REFERENCES customers(id),
    INDEX idx_payments_order (order_id),
    INDEX idx_payments_customer (customer_id),
    INDEX idx_payments_deleted_at (deleted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SET @has_col = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'orders' AND column_name = 'payment_requested_at'
);
SET @sql = IF(@has_col = 0,
  'ALTER TABLE orders ADD COLUMN payment_requested_at DATETIME NULL AFTER admin_review_notes',
  'SELECT ''payment_requested_at already exists on orders, skipping'' AS status'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
