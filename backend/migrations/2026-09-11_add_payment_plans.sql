-- Adds a payment_plans table -- a recorded commitment to pay an order
-- off by some date (amount + a single target date, no per-installment
-- breakdown yet), entered by hand once Sales has that agreement with
-- the customer. Purely informational: unlike a Payment, a plan does NOT
-- reduce what counts against the customer's credit limit in
-- order_service.change_status -- confirming an over-limit order still
-- needs either the balance actually paid down or an admin's manual
-- approve_order override. See app/services/payment_plan_service.py.
--
-- A fresh install via schema.sql already has this table -- this file is
-- only for upgrading an existing database. Safe to re-run: the table
-- create is idempotent, same pattern as migrations/2026-09-03_add_payments.sql.
--
-- Usage:
--   mysql -u <user> -p <database> < backend/migrations/2026-09-11_add_payment_plans.sql

CREATE TABLE IF NOT EXISTS payment_plans (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    order_id        BIGINT UNSIGNED NOT NULL,
    customer_id     BIGINT UNSIGNED NOT NULL,
    amount          DECIMAL(14,2) NOT NULL,
    target_date     DATE NOT NULL,
    notes           TEXT NULL,
    deleted_at      DATETIME NULL,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by      BIGINT UNSIGNED NULL,
    updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    updated_by      BIGINT UNSIGNED NULL,
    CONSTRAINT fk_payment_plans_order FOREIGN KEY (order_id) REFERENCES orders(id),
    CONSTRAINT fk_payment_plans_customer FOREIGN KEY (customer_id) REFERENCES customers(id),
    INDEX idx_payment_plans_order (order_id),
    INDEX idx_payment_plans_customer (customer_id),
    INDEX idx_payment_plans_deleted_at (deleted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
