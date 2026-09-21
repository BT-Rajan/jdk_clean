-- Sales -> Finance invoice handoff (see the "Sales -> Finance Invoice
-- Handoff" design doc): Payments stops being something Sales owns a
-- pasted link for and becomes a proper handoff to Finance.
--
-- 1. Seeds a 'finance' department row (same reuse pattern as every other
--    department -- see app/models/department.py) so an admin can put
--    Finance staff in their own department and grant them the existing
--    'payments' page_key, exactly the guard payments.py's finance_guard
--    already uses for acknowledge/override/followup.
-- 2. Creates `invoices` -- one row per order, auto-created when Sales
--    confirms an order, carrying the payment link/QR/status that used to
--    live directly on Quotation/Order.
-- 3. Backfills an Invoice for every order that already has a payment_link,
--    then drops quotations.payment_link and orders.payment_link -- the
--    Invoice is now the one place that link lives.
--
-- A fresh install via schema.sql already has this shape -- this file is
-- only for upgrading an existing database. Safe to re-run: every step is
-- guarded via information_schema (or, for the invoices table/backfill,
-- naturally idempotent -- IF NOT EXISTS / INSERT IGNORE against a unique
-- key).
--
-- Usage:
--   mysql -u <user> -p <database> < backend/migrations/2026-10-10_add_invoices_and_finance_department.sql

-- 1. Finance department.
INSERT INTO departments (code, name, status) VALUES
    ('finance', 'Finance', 'active')
ON DUPLICATE KEY UPDATE code = code;

-- 2. invoices table.
CREATE TABLE IF NOT EXISTS invoices (
    id                       BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    invoice_number           VARCHAR(30) NOT NULL UNIQUE,      -- generated via number_series (prefix INV-00001)
    order_id                 BIGINT UNSIGNED NOT NULL UNIQUE,  -- one invoice per order -- see invoice_service.create_draft_invoice_for_order
    quotation_id             BIGINT UNSIGNED NULL,             -- denormalized from orders.deal_id's source quotation, for traceability
    customer_id              BIGINT UNSIGNED NOT NULL,          -- denormalized from orders.customer_id, so sales_scope's customer-scoping helpers work on Invoice unchanged
    status                   ENUM('draft','waiting_finance','link_generated','qr_ready','awaiting_payment','partially_paid','paid','voided') NOT NULL DEFAULT 'draft',
    -- Bumped every time Finance (re)generates the payment link -- lets a
    -- stale printed invoice be told apart from the current one (see
    -- invoice_service.generate_payment_link).
    version                  INT UNSIGNED NOT NULL DEFAULT 0,
    payment_link_url         VARCHAR(500) NULL,
    payment_link_ref         VARCHAR(120) NULL,   -- MyFatoorah's own InvoiceId for this link
    payment_link_expires_at  DATETIME NULL,
    qr_data_url              MEDIUMTEXT NULL,      -- base64 PNG data URL encoding payment_link_url, derived automatically -- never hand-edited
    voided_at                DATETIME NULL,
    voided_by                BIGINT UNSIGNED NULL,
    voided_reason            TEXT NULL,
    deleted_at               DATETIME NULL,
    created_at               DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by                BIGINT UNSIGNED NULL,
    updated_at               DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    updated_by               BIGINT UNSIGNED NULL,
    CONSTRAINT fk_invoices_order FOREIGN KEY (order_id) REFERENCES orders(id),
    CONSTRAINT fk_invoices_quotation FOREIGN KEY (quotation_id) REFERENCES quotations(id),
    CONSTRAINT fk_invoices_customer FOREIGN KEY (customer_id) REFERENCES customers(id),
    CONSTRAINT fk_invoices_voided_by FOREIGN KEY (voided_by) REFERENCES users(id),
    INDEX idx_invoices_customer (customer_id),
    INDEX idx_invoices_status (status),
    INDEX idx_invoices_deleted_at (deleted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO number_series (doc_type, prefix, next_number, padding) VALUES
    ('INVOICE', 'INV', 1, 5);

-- 3. Backfill: one Invoice per order that already has a payment_link,
-- only if quotations.payment_link/orders.payment_link still exist (a
-- second run of this file, after they've already been dropped below,
-- has nothing left to backfill from). Status is derived from acknowledged
-- payments the same way invoice_service.sync_status_from_payments does;
-- a backfilled row always has a link, so it never lands below
-- 'awaiting_payment'.
SET @has_old_col = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'orders' AND column_name = 'payment_link'
);

SET @sql = IF(@has_old_col > 0,
  'INSERT IGNORE INTO invoices (invoice_number, order_id, quotation_id, customer_id, status, version, payment_link_url, created_at, created_by)
   SELECT
     CONCAT(''INV-'', LPAD(o.id, 5, ''0'')),
     o.id,
     q.id,
     o.customer_id,
     CASE
       WHEN COALESCE(paid.acknowledged, 0) >= o.total_amount THEN ''paid''
       WHEN COALESCE(paid.acknowledged, 0) > 0 THEN ''partially_paid''
       ELSE ''awaiting_payment''
     END,
     1,
     o.payment_link,
     COALESCE(o.confirmed_at, o.created_at),
     o.created_by
   FROM orders o
   LEFT JOIN quotations q ON q.converted_order_id = o.id
   LEFT JOIN (
     SELECT order_id, SUM(amount) AS acknowledged
     FROM payments
     WHERE deleted_at IS NULL AND acknowledged_at IS NOT NULL
     GROUP BY order_id
   ) paid ON paid.order_id = o.id
   WHERE o.payment_link IS NOT NULL AND o.payment_link <> ''''',
  'SELECT ''orders.payment_link already dropped, nothing to backfill'' AS status'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Reserve enough of the INV series that a freshly-created invoice can
-- never collide with one of the backfilled INV-<order id> numbers above.
SET @next_after_backfill = (SELECT COALESCE(MAX(order_id), 0) + 1 FROM invoices);
UPDATE number_series SET next_number = GREATEST(next_number, @next_after_backfill) WHERE doc_type = 'INVOICE';

-- 4. Drop the retired columns -- the Invoice above is now the one place
-- a payment link lives.
SET @col_exists = (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'quotations' AND column_name = 'payment_link');
SET @sql = IF(@col_exists > 0, 'ALTER TABLE quotations DROP COLUMN payment_link', 'SELECT ''quotations.payment_link already dropped, skipping'' AS status');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists = (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'orders' AND column_name = 'payment_link');
SET @sql = IF(@col_exists > 0, 'ALTER TABLE orders DROP COLUMN payment_link', 'SELECT ''orders.payment_link already dropped, skipping'' AS status');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
