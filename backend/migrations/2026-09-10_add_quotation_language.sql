-- Adds quotations.language -- which admin-uploaded quotation template
-- (English or Arabic, see doc_templates) this quotation was raised in.
-- Drives the default language Print/Email render from; see
-- app/models/quotation.py QUOTATION_LANGUAGES and app/api/quotations.py.
--
-- A fresh install via schema.sql already has this column -- this file is
-- only for upgrading an existing database. Safe to re-run: the ADD
-- COLUMN is guarded via information_schema.
--
-- Usage:
--   mysql -u <user> -p <database> < backend/migrations/2026-09-10_add_quotation_language.sql

SET @has_language = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'quotations' AND column_name = 'language'
);
SET @sql = IF(@has_language = 0,
  'ALTER TABLE quotations ADD COLUMN language ENUM(''en'',''ar'') NOT NULL DEFAULT ''en'' AFTER status',
  'SELECT ''language already exists on quotations, skipping'' AS status'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
