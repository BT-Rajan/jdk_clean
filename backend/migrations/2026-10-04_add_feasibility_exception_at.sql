-- Records *when* Sales made its reject/override-request decision on a
-- feasibility check (feasibility_service.decide_exception) --
-- exception_by/exception_reason previously had no timestamp of their
-- own (only updated_at, which any other field change could also bump).
--
-- Safe to re-run: the ALTER is guarded via information_schema.
--
-- A fresh install via schema.sql already has this column -- this file
-- is only for upgrading an existing database.
--
-- Usage:
--   mysql -u <user> -p <database> < backend/migrations/2026-10-04_add_feasibility_exception_at.sql

SET @has_col = (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'feasibility_checks' AND column_name = 'exception_at');
SET @sql = IF(@has_col = 0, 'ALTER TABLE feasibility_checks ADD COLUMN exception_at DATETIME NULL AFTER exception_by', 'SELECT ''feasibility_checks.exception_at already exists, skipping'' AS status');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
