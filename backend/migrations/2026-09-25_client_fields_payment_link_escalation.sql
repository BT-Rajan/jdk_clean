-- Three unrelated but small schema changes bundled together:
--
-- 1. Removes customers.nature_of_business -- dropped from the client
--    form on both apps; the column served no other purpose.
-- 2. Adds quotations.payment_link -- a manually-entered link to an
--    external payment system, required before an accepted quotation
--    can be converted to an order (see quotation_service.
--    set_payment_link / order_service.create_order_from_quotation).
-- 3. Adds orders.payment_link (copied from the quotation at conversion
--    time -- the order's own snapshot, not a live join), orders.
--    confirmed_at (when the order first reached 'confirmed', needed to
--    know how long it's been waiting on payment), and orders.
--    admin_review_reason (distinguishes an overdue-delivery escalation
--    from a payment-overdue one now that there are two -- see
--    order_service.escalate_overdue_orders / escalate_unpaid_orders).
--
-- A fresh install via schema.sql already reflects all of this -- this
-- file is only for upgrading an existing database. Safe to re-run:
-- every change is guarded via information_schema, same pattern as
-- earlier migrations.
--
-- Usage:
--   mysql -u <user> -p <database> < backend/migrations/2026-09-25_client_fields_payment_link_escalation.sql

-- 1. customers.nature_of_business
SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'customers' AND column_name = 'nature_of_business'
);
SET @sql = IF(@col_exists > 0,
  'ALTER TABLE customers DROP COLUMN nature_of_business',
  'SELECT ''customers.nature_of_business already absent, skipping'' AS status'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2. quotations.payment_link
SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'quotations' AND column_name = 'payment_link'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE quotations ADD COLUMN payment_link VARCHAR(500) NULL AFTER close_reason',
  'SELECT ''quotations.payment_link already exists, skipping'' AS status'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 3a. orders.payment_link
SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'orders' AND column_name = 'payment_link'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE orders ADD COLUMN payment_link VARCHAR(500) NULL AFTER close_reason',
  'SELECT ''orders.payment_link already exists, skipping'' AS status'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 3b. orders.confirmed_at
SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'orders' AND column_name = 'confirmed_at'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE orders ADD COLUMN confirmed_at DATETIME NULL AFTER payment_link',
  'SELECT ''orders.confirmed_at already exists, skipping'' AS status'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 3c. orders.admin_review_reason
SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'orders' AND column_name = 'admin_review_reason'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE orders ADD COLUMN admin_review_reason VARCHAR(30) NULL AFTER admin_review_required',
  'SELECT ''orders.admin_review_reason already exists, skipping'' AS status'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
