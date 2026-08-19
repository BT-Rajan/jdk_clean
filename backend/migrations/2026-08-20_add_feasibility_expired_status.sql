-- Adds 'expired' to feasibility_checks.status -- a feasibility check
-- not converted to a quotation by 11:59pm Kuwait time on the day it
-- was generated now expires automatically (see feasibility_service.
-- escalate_expired_feasibility_checks, run by the in-process scheduler
-- every 6 hours -- see core/scheduler.py). Reachable from every open
-- status (draft, feasible, exception_pending, exception_approved,
-- exception_rejected); terminal, same as closed/converted.
--
-- A fresh install via schema.sql already has this -- this file is only
-- for upgrading an existing database. Safe to re-run: only widens the
-- enum if 'expired' isn't already one of its values.
--
-- Usage:
--   mysql -u <user> -p <database> < backend/migrations/2026-08-20_add_feasibility_expired_status.sql

SET @has_expired = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'feasibility_checks' AND column_name = 'status'
    AND COLUMN_TYPE LIKE '%''expired''%'
);
SET @sql = IF(@has_expired = 0,
  'ALTER TABLE feasibility_checks MODIFY COLUMN status ENUM(''draft'',''feasible'',''exception_pending'',''exception_approved'',''exception_rejected'',''closed'',''converted'',''expired'') NOT NULL DEFAULT ''draft''',
  'SELECT ''expired already in feasibility_checks.status, skipping'' AS status'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
