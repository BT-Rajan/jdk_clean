-- Customer Master field pass -- brings the Customer screen in line with
-- the standard master-data reference list (Type/Name/Avatar/Email/Phone,
-- Company/Job Position/Website/Tags/structured address, Payment Method/
-- Pricelist, Purchase Configuration, Fiscal Position/Reference, Bank
-- Accounts/GL account references, and Invoice Follow-up/E-Invoicing
-- status fields).
--
-- Every column added here is plain data with no automation behind it:
-- this app has no accounting/GL module, no e-invoicing or dunning
-- engine, and no purchase-RFQ workflow, so nothing downstream posts to
-- account_receivable/account_payable, auto-generates a reminder off
-- reminder_mode/next_reminder_date, or raises an RFQ off group_rfq --
-- these are stored reference values a human sets and reads, same as the
-- pre-existing `category`/`fiscal_position`-shaped free-text fields
-- elsewhere in this schema. See app/models/customer.py's own
-- "Customer Master field pass" comment for the same rationale per field.
--
-- A fresh install via schema.sql already reflects all of this -- this
-- file is only for upgrading an existing database. Safe to re-run:
-- every change is guarded via information_schema, same pattern as
-- earlier migrations (see 2026-09-26_client_master_upgrade.sql).
--
-- Usage:
--   mysql -u <user> -p <database> < backend/migrations/2026-10-03_customer_master_fields.sql

-- 1. customers.avatar_filename
SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'customers' AND column_name = 'avatar_filename'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE customers ADD COLUMN avatar_filename VARCHAR(255) NULL AFTER trade_name',
  'SELECT ''customers.avatar_filename already exists, skipping'' AS status'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2. customers.parent_company_id
SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'customers' AND column_name = 'parent_company_id'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE customers ADD COLUMN parent_company_id BIGINT UNSIGNED NULL AFTER contact_person',
  'SELECT ''customers.parent_company_id already exists, skipping'' AS status'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fk_exists = (
  SELECT COUNT(*) FROM information_schema.table_constraints
  WHERE table_schema = DATABASE() AND table_name = 'customers' AND constraint_name = 'fk_customers_parent_company_id'
);
SET @sql = IF(@fk_exists = 0,
  'ALTER TABLE customers ADD CONSTRAINT fk_customers_parent_company_id FOREIGN KEY (parent_company_id) REFERENCES customers(id) ON DELETE SET NULL',
  'SELECT ''fk_customers_parent_company_id already exists, skipping'' AS status'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 3. customers.job_position
SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'customers' AND column_name = 'job_position'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE customers ADD COLUMN job_position VARCHAR(120) NULL AFTER parent_company_id',
  'SELECT ''customers.job_position already exists, skipping'' AS status'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 4. customers.website
SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'customers' AND column_name = 'website'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE customers ADD COLUMN website VARCHAR(255) NULL AFTER job_position',
  'SELECT ''customers.website already exists, skipping'' AS status'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 5. customers.tags
SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'customers' AND column_name = 'tags'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE customers ADD COLUMN tags JSON NULL AFTER website',
  'SELECT ''customers.tags already exists, skipping'' AS status'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 6a. customers.address_line1
SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'customers' AND column_name = 'address_line1'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE customers ADD COLUMN address_line1 VARCHAR(255) NULL AFTER shipping_address',
  'SELECT ''customers.address_line1 already exists, skipping'' AS status'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 6b. customers.address_line2
SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'customers' AND column_name = 'address_line2'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE customers ADD COLUMN address_line2 VARCHAR(255) NULL AFTER address_line1',
  'SELECT ''customers.address_line2 already exists, skipping'' AS status'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 6c. customers.state
SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'customers' AND column_name = 'state'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE customers ADD COLUMN state VARCHAR(80) NULL AFTER city',
  'SELECT ''customers.state already exists, skipping'' AS status'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 7. customers.payment_method
SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'customers' AND column_name = 'payment_method'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE customers ADD COLUMN payment_method ENUM(''cash'',''credit_card'',''bank_transfer'',''cheque'',''other'') NULL AFTER payment_terms_type',
  'SELECT ''customers.payment_method already exists, skipping'' AS status'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 8. customers.pricelist
SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'customers' AND column_name = 'pricelist'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE customers ADD COLUMN pricelist VARCHAR(100) NULL AFTER payment_method',
  'SELECT ''customers.pricelist already exists, skipping'' AS status'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 9. customers.group_rfq
SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'customers' AND column_name = 'group_rfq'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE customers ADD COLUMN group_rfq TINYINT(1) NOT NULL DEFAULT 0 AFTER pricelist',
  'SELECT ''customers.group_rfq already exists, skipping'' AS status'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 10. customers.buyer_id
SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'customers' AND column_name = 'buyer_id'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE customers ADD COLUMN buyer_id BIGINT UNSIGNED NULL AFTER group_rfq',
  'SELECT ''customers.buyer_id already exists, skipping'' AS status'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fk_exists = (
  SELECT COUNT(*) FROM information_schema.table_constraints
  WHERE table_schema = DATABASE() AND table_name = 'customers' AND constraint_name = 'fk_customers_buyer_id'
);
SET @sql = IF(@fk_exists = 0,
  'ALTER TABLE customers ADD CONSTRAINT fk_customers_buyer_id FOREIGN KEY (buyer_id) REFERENCES users(id) ON DELETE SET NULL',
  'SELECT ''fk_customers_buyer_id already exists, skipping'' AS status'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 11a. customers.purchase_payment_terms_days
SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'customers' AND column_name = 'purchase_payment_terms_days'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE customers ADD COLUMN purchase_payment_terms_days SMALLINT UNSIGNED NULL AFTER buyer_id',
  'SELECT ''customers.purchase_payment_terms_days already exists, skipping'' AS status'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 11b. customers.purchase_payment_terms_type
SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'customers' AND column_name = 'purchase_payment_terms_type'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE customers ADD COLUMN purchase_payment_terms_type ENUM(''cash'',''advance'',''credit'',''custom'') NULL AFTER purchase_payment_terms_days',
  'SELECT ''customers.purchase_payment_terms_type already exists, skipping'' AS status'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 11c. customers.purchase_payment_method
SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'customers' AND column_name = 'purchase_payment_method'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE customers ADD COLUMN purchase_payment_method ENUM(''cash'',''credit_card'',''bank_transfer'',''cheque'',''other'') NULL AFTER purchase_payment_terms_type',
  'SELECT ''customers.purchase_payment_method already exists, skipping'' AS status'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 12. customers.receipt_reminder
SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'customers' AND column_name = 'receipt_reminder'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE customers ADD COLUMN receipt_reminder TINYINT(1) NOT NULL DEFAULT 0 AFTER purchase_payment_method',
  'SELECT ''customers.receipt_reminder already exists, skipping'' AS status'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 13. customers.supplier_currency
SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'customers' AND column_name = 'supplier_currency'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE customers ADD COLUMN supplier_currency VARCHAR(10) NULL AFTER receipt_reminder',
  'SELECT ''customers.supplier_currency already exists, skipping'' AS status'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 14. customers.fiscal_position
SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'customers' AND column_name = 'fiscal_position'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE customers ADD COLUMN fiscal_position VARCHAR(120) NULL AFTER supplier_currency',
  'SELECT ''customers.fiscal_position already exists, skipping'' AS status'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 15. customers.reference
SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'customers' AND column_name = 'reference'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE customers ADD COLUMN `reference` VARCHAR(100) NULL AFTER fiscal_position',
  'SELECT ''customers.reference already exists, skipping'' AS status'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 16. customers.bank_accounts
SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'customers' AND column_name = 'bank_accounts'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE customers ADD COLUMN bank_accounts JSON NULL AFTER `reference`',
  'SELECT ''customers.bank_accounts already exists, skipping'' AS status'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 17a. customers.account_receivable
SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'customers' AND column_name = 'account_receivable'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE customers ADD COLUMN account_receivable VARCHAR(50) NULL AFTER bank_accounts',
  'SELECT ''customers.account_receivable already exists, skipping'' AS status'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 17b. customers.account_payable
SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'customers' AND column_name = 'account_payable'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE customers ADD COLUMN account_payable VARCHAR(50) NULL AFTER account_receivable',
  'SELECT ''customers.account_payable already exists, skipping'' AS status'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 18. customers.auto_post_bills
SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'customers' AND column_name = 'auto_post_bills'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE customers ADD COLUMN auto_post_bills ENUM(''manual'',''automatic'') NULL AFTER account_payable',
  'SELECT ''customers.auto_post_bills already exists, skipping'' AS status'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 19. customers.follow_up_stage
SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'customers' AND column_name = 'follow_up_stage'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE customers ADD COLUMN follow_up_stage ENUM(''none'',''15_days'',''30_days'',''45_days'',''legal'') NULL AFTER auto_post_bills',
  'SELECT ''customers.follow_up_stage already exists, skipping'' AS status'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 20. customers.follow_up_status
SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'customers' AND column_name = 'follow_up_status'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE customers ADD COLUMN follow_up_status ENUM(''up_to_date'',''in_progress'',''overdue'',''escalated'') NULL AFTER follow_up_stage',
  'SELECT ''customers.follow_up_status already exists, skipping'' AS status'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 21. customers.reminder_mode
SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'customers' AND column_name = 'reminder_mode'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE customers ADD COLUMN reminder_mode ENUM(''automatic'',''manual'') NULL AFTER follow_up_status',
  'SELECT ''customers.reminder_mode already exists, skipping'' AS status'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 22. customers.next_reminder_date
SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'customers' AND column_name = 'next_reminder_date'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE customers ADD COLUMN next_reminder_date DATE NULL AFTER reminder_mode',
  'SELECT ''customers.next_reminder_date already exists, skipping'' AS status'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 23. customers.followup_responsible_id
SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'customers' AND column_name = 'followup_responsible_id'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE customers ADD COLUMN followup_responsible_id BIGINT UNSIGNED NULL AFTER next_reminder_date',
  'SELECT ''customers.followup_responsible_id already exists, skipping'' AS status'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fk_exists = (
  SELECT COUNT(*) FROM information_schema.table_constraints
  WHERE table_schema = DATABASE() AND table_name = 'customers' AND constraint_name = 'fk_customers_followup_responsible_id'
);
SET @sql = IF(@fk_exists = 0,
  'ALTER TABLE customers ADD CONSTRAINT fk_customers_followup_responsible_id FOREIGN KEY (followup_responsible_id) REFERENCES users(id) ON DELETE SET NULL',
  'SELECT ''fk_customers_followup_responsible_id already exists, skipping'' AS status'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
