-- Payments hardening: Finance acknowledgment of payments, payment-plan
-- completion, and an order-level collection-queue worklist.
--
-- orders: payment_followup_owner_id/payment_followup_date (Finance's own
-- worklist entry -- who's chasing this balance and when they're next due
-- to follow up) and payment_override_at/by/reason (Finance proceeding a
-- non-credit order into production despite acknowledged payments falling
-- short of total_amount -- see payment_service.override_payment_gate).
--
-- payments: acknowledged_at/acknowledged_by -- Finance confirming the
-- money actually landed, distinct from created_by who merely logged the
-- claim. Only acknowledged payments count toward unblocking production
-- or completing a payment plan.
--
-- payment_plans: status/completed_at/completed_by -- a plan can only be
-- marked 'completed' via payment_plan_service.complete_payment_plan,
-- which refuses while the order still has an outstanding balance.
--
-- Safe to re-run: every ALTER is guarded via information_schema.
--
-- A fresh install via schema.sql already has these columns -- this file
-- is only for upgrading an existing database.
--
-- Usage:
--   mysql -u <user> -p <database> < backend/migrations/2026-10-08_add_payment_hardening_fields.sql

SET @has_col = (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'orders' AND column_name = 'payment_followup_owner_id');
SET @sql = IF(@has_col = 0, 'ALTER TABLE orders ADD COLUMN payment_followup_owner_id BIGINT UNSIGNED NULL AFTER parent_order_id, ADD CONSTRAINT fk_orders_payment_followup_owner FOREIGN KEY (payment_followup_owner_id) REFERENCES users(id)', 'SELECT ''orders.payment_followup_owner_id already exists, skipping'' AS status');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_col = (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'orders' AND column_name = 'payment_followup_date');
SET @sql = IF(@has_col = 0, 'ALTER TABLE orders ADD COLUMN payment_followup_date DATE NULL AFTER payment_followup_owner_id, ADD INDEX idx_orders_payment_followup_date (payment_followup_date)', 'SELECT ''orders.payment_followup_date already exists, skipping'' AS status');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_col = (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'orders' AND column_name = 'payment_override_at');
SET @sql = IF(@has_col = 0, 'ALTER TABLE orders ADD COLUMN payment_override_at DATETIME NULL AFTER payment_followup_date', 'SELECT ''orders.payment_override_at already exists, skipping'' AS status');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_col = (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'orders' AND column_name = 'payment_override_by');
SET @sql = IF(@has_col = 0, 'ALTER TABLE orders ADD COLUMN payment_override_by BIGINT UNSIGNED NULL AFTER payment_override_at, ADD CONSTRAINT fk_orders_payment_override_by FOREIGN KEY (payment_override_by) REFERENCES users(id)', 'SELECT ''orders.payment_override_by already exists, skipping'' AS status');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_col = (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'orders' AND column_name = 'payment_override_reason');
SET @sql = IF(@has_col = 0, 'ALTER TABLE orders ADD COLUMN payment_override_reason TEXT NULL AFTER payment_override_by', 'SELECT ''orders.payment_override_reason already exists, skipping'' AS status');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_col = (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'payments' AND column_name = 'acknowledged_at');
SET @sql = IF(@has_col = 0, 'ALTER TABLE payments ADD COLUMN acknowledged_at DATETIME NULL AFTER notes', 'SELECT ''payments.acknowledged_at already exists, skipping'' AS status');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_col = (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'payments' AND column_name = 'acknowledged_by');
SET @sql = IF(@has_col = 0, 'ALTER TABLE payments ADD COLUMN acknowledged_by BIGINT UNSIGNED NULL AFTER acknowledged_at, ADD CONSTRAINT fk_payments_acknowledged_by FOREIGN KEY (acknowledged_by) REFERENCES users(id)', 'SELECT ''payments.acknowledged_by already exists, skipping'' AS status');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_col = (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'payment_plans' AND column_name = 'status');
SET @sql = IF(@has_col = 0, 'ALTER TABLE payment_plans ADD COLUMN status ENUM(''open'',''completed'') NOT NULL DEFAULT ''open'' AFTER notes', 'SELECT ''payment_plans.status already exists, skipping'' AS status');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_col = (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'payment_plans' AND column_name = 'completed_at');
SET @sql = IF(@has_col = 0, 'ALTER TABLE payment_plans ADD COLUMN completed_at DATETIME NULL AFTER status', 'SELECT ''payment_plans.completed_at already exists, skipping'' AS status');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_col = (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'payment_plans' AND column_name = 'completed_by');
SET @sql = IF(@has_col = 0, 'ALTER TABLE payment_plans ADD COLUMN completed_by BIGINT UNSIGNED NULL AFTER completed_at, ADD CONSTRAINT fk_payment_plans_completed_by FOREIGN KEY (completed_by) REFERENCES users(id)', 'SELECT ''payment_plans.completed_by already exists, skipping'' AS status');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
