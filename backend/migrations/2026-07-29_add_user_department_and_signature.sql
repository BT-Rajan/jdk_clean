-- Adds department-based write access (Quotations/Orders -> sales,
-- Purchase Orders -> procurement, Delivery Notes -> warehouse, once
-- built) and admin-assigned signature images for outbound documents.
--
-- A fresh install via schema.sql already has both columns -- this is
-- only for upgrading an existing database. Safe to re-run: guarded via
-- information_schema, same pattern as the earlier profile-fields and
-- supplier-capability migrations.
--
-- Usage:
--   mysql -u <user> -p <database> < backend/migrations/2026-07-29_add_user_department_and_signature.sql

SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'users' AND column_name = 'department'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE users ADD COLUMN department ENUM(''sales'',''procurement'',''warehouse'') NULL AFTER avatar_filename',
  'SELECT ''department column already exists, skipping'' AS status'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'users' AND column_name = 'signature_filename'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE users ADD COLUMN signature_filename VARCHAR(255) NULL AFTER department',
  'SELECT ''signature_filename column already exists, skipping'' AS status'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
