-- Quotation follow-up tracking: last_followup_at (stamped every time
-- Sales logs a customer follow-up -- see quotation_service.
-- record_followup) and next_followup_date (when the next one is due --
-- drives get_followup_status's Not Due/Due/Overdue/Completed verdict).
-- Distinct from the existing last_emailed_at, which only reflects this
-- app's own "Send email" action, not a call or an outside conversation.
--
-- Safe to re-run: both ALTERs are guarded via information_schema.
--
-- A fresh install via schema.sql already has these columns -- this file
-- is only for upgrading an existing database.
--
-- Usage:
--   mysql -u <user> -p <database> < backend/migrations/2026-10-03_add_quotation_followup_fields.sql

SET @has_col = (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'quotations' AND column_name = 'last_followup_at');
SET @sql = IF(@has_col = 0, 'ALTER TABLE quotations ADD COLUMN last_followup_at DATETIME NULL AFTER last_emailed_at', 'SELECT ''quotations.last_followup_at already exists, skipping'' AS status');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_col = (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'quotations' AND column_name = 'next_followup_date');
SET @sql = IF(@has_col = 0, 'ALTER TABLE quotations ADD COLUMN next_followup_date DATE NULL AFTER last_followup_at', 'SELECT ''quotations.next_followup_date already exists, skipping'' AS status');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
