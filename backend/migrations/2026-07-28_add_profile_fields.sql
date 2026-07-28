-- Adds the phone and avatar_filename columns the profile feature needs
-- (full_name/phone/photo on /api/auth/me) to a database created before
-- they existed. A fresh install via schema.sql already has these --
-- this is only for upgrading an existing database.
--
-- Safe to re-run: each column is added only if it isn't already there
-- (checked via information_schema, since plain "ADD COLUMN IF NOT
-- EXISTS" is a MariaDB extension -- it is NOT valid syntax on real
-- MySQL 8.x, which is what this project targets; verified directly
-- against MySQL 8.0.46 before writing it this way).
--
-- Usage:
--   mysql -u <user> -p <database> < backend/migrations/2026-07-28_add_profile_fields.sql

SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'users' AND column_name = 'phone'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE users ADD COLUMN phone VARCHAR(30) NULL AFTER full_name',
  'SELECT ''phone column already exists, skipping'' AS status'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'users' AND column_name = 'avatar_filename'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE users ADD COLUMN avatar_filename VARCHAR(255) NULL AFTER phone',
  'SELECT ''avatar_filename column already exists, skipping'' AS status'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
