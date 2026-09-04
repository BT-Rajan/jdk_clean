-- Adds an uploadable identity document (image or PDF) plus an
-- admin-set verified flag to both customers and suppliers -- see
-- app/services/id_document_service.py. On the customer side,
-- order_service.change_status refuses to extend credit (credit_limit >
-- 0) to a customer whose id isn't verified yet; nothing currently gates
-- on the supplier side, it's tracked for the same admin-review reasons.
--
-- A fresh install via schema.sql already has all of these -- this file
-- is only for upgrading an existing database. Safe to re-run: each ADD
-- COLUMN is guarded via information_schema.
--
-- Usage:
--   mysql -u <user> -p <database> < backend/migrations/2026-09-15_add_id_verification.sql

SET @has_col = (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'customers' AND column_name = 'id_document_filename');
SET @sql = IF(@has_col = 0, 'ALTER TABLE customers ADD COLUMN id_document_filename VARCHAR(255) NULL', 'SELECT ''id_document_filename already exists on customers, skipping'' AS status');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_col = (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'customers' AND column_name = 'id_verified');
SET @sql = IF(@has_col = 0, 'ALTER TABLE customers ADD COLUMN id_verified TINYINT(1) NOT NULL DEFAULT 0', 'SELECT ''id_verified already exists on customers, skipping'' AS status');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_col = (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'customers' AND column_name = 'id_verified_at');
SET @sql = IF(@has_col = 0, 'ALTER TABLE customers ADD COLUMN id_verified_at DATETIME NULL', 'SELECT ''id_verified_at already exists on customers, skipping'' AS status');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_col = (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'customers' AND column_name = 'id_verified_by');
SET @sql = IF(@has_col = 0, 'ALTER TABLE customers ADD COLUMN id_verified_by BIGINT UNSIGNED NULL', 'SELECT ''id_verified_by already exists on customers, skipping'' AS status');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_col = (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'suppliers' AND column_name = 'id_document_filename');
SET @sql = IF(@has_col = 0, 'ALTER TABLE suppliers ADD COLUMN id_document_filename VARCHAR(255) NULL', 'SELECT ''id_document_filename already exists on suppliers, skipping'' AS status');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_col = (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'suppliers' AND column_name = 'id_verified');
SET @sql = IF(@has_col = 0, 'ALTER TABLE suppliers ADD COLUMN id_verified TINYINT(1) NOT NULL DEFAULT 0', 'SELECT ''id_verified already exists on suppliers, skipping'' AS status');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_col = (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'suppliers' AND column_name = 'id_verified_at');
SET @sql = IF(@has_col = 0, 'ALTER TABLE suppliers ADD COLUMN id_verified_at DATETIME NULL', 'SELECT ''id_verified_at already exists on suppliers, skipping'' AS status');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_col = (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'suppliers' AND column_name = 'id_verified_by');
SET @sql = IF(@has_col = 0, 'ALTER TABLE suppliers ADD COLUMN id_verified_by BIGINT UNSIGNED NULL', 'SELECT ''id_verified_by already exists on suppliers, skipping'' AS status');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
