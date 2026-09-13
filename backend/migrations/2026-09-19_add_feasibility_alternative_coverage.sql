-- Adds feasibility_lines.alternative_coverage_json -- records, per raw
-- material that was short on its own stock, whether an approved
-- raw_material_alternatives substitute could cover some or all of that
-- shortfall, and by how much. Purely informational: it never causes a
-- BOM or inventory write, and never changes what raw material the BOM
-- itself requires. A shortfall fully covered here is excluded from
-- shortfall_json (it's no longer an unresolved blocker); a shortfall
-- only partially covered still appears in shortfall_json for the
-- remaining, genuinely-uncovered amount. See feasibility_service.
-- run_check and raw_material_alternative_service.
-- get_approved_alternatives_with_stock / allocate_alternative_coverage.
--
-- A fresh install via schema.sql already has this column -- this file
-- is only for upgrading an existing database. Safe to re-run.
--
-- Usage:
--   mysql -u <user> -p <database> < backend/migrations/2026-09-19_add_feasibility_alternative_coverage.sql

SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'feasibility_lines' AND column_name = 'alternative_coverage_json'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE feasibility_lines ADD COLUMN alternative_coverage_json TEXT NULL AFTER estimated_ready_date',
  'SELECT ''alternative_coverage_json column already exists, skipping'' AS status'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
