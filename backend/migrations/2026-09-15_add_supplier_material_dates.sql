-- Adds two auto-captured dates to each supplier-material line (see
-- app/models/supplier_material.py): onboarded_at (when this supplier
-- was first linked to this material -- backfilled from the row's own
-- created_at for anything that already existed) and last_transaction_at
-- (set by purchase_order_service.receive_lines on the next goods
-- receipt against this supplier+material; left null until then).
--
-- A fresh install via schema.sql already has both columns -- this file
-- is only for upgrading an existing database. Safe to re-run: every
-- step is guarded via information_schema.
--
-- Usage:
--   mysql -u <user> -p <database> < backend/migrations/2026-09-15_add_supplier_material_dates.sql

SET @has_col = (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'supplier_materials' AND column_name = 'onboarded_at');
SET @sql = IF(@has_col = 0, 'ALTER TABLE supplier_materials ADD COLUMN onboarded_at DATE NULL', 'SELECT ''onboarded_at already exists on supplier_materials, skipping'' AS status');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

UPDATE supplier_materials SET onboarded_at = DATE(created_at) WHERE onboarded_at IS NULL;

SET @onboarded_at_nullable = (SELECT IS_NULLABLE FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'supplier_materials' AND column_name = 'onboarded_at');
SET @sql = IF(@onboarded_at_nullable = 'YES', 'ALTER TABLE supplier_materials MODIFY COLUMN onboarded_at DATE NOT NULL', 'SELECT ''supplier_materials.onboarded_at already NOT NULL, skipping'' AS status');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_col = (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'supplier_materials' AND column_name = 'last_transaction_at');
SET @sql = IF(@has_col = 0, 'ALTER TABLE supplier_materials ADD COLUMN last_transaction_at DATE NULL', 'SELECT ''last_transaction_at already exists on supplier_materials, skipping'' AS status');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
