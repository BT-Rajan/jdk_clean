-- Adds quotations.last_emailed_at (NULL until the first time this
-- quotation is emailed -- see api/quotations.py's email_quotation_pdf,
-- which uses it to pick the quotation_email vs. quotation_followup_email
-- template) and the quotation_followup_email template definition (see
-- email_template_service.py -- the row itself auto-creates from that
-- code-defined default on first read, so nothing to seed here).
--
-- A fresh install via schema.sql already has the column -- this file is
-- only for upgrading an existing database. Safe to re-run: the column
-- add is guarded via information_schema, same pattern as earlier
-- migrations.
--
-- Usage:
--   mysql -u <user> -p <database> < backend/migrations/2026-09-04_add_quotation_last_emailed_at.sql

SET @has_col = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'quotations' AND column_name = 'last_emailed_at'
);
SET @sql = IF(@has_col = 0,
  'ALTER TABLE quotations ADD COLUMN last_emailed_at DATETIME NULL AFTER material_conflict_notes',
  'SELECT ''last_emailed_at already exists on quotations, skipping'' AS status'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
