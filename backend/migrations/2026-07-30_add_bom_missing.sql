-- Adds feasibility_lines.bom_missing -- true when the product genuinely
-- has no BOM/formula configured at all (distinct from a BOM that
-- resolves to zero raw-material requirements). Previously a BOM-less
-- product silently reported "feasible" for any quantity, since
-- explode_requirements() returns an empty requirements dict either way
-- -- masking a real data-setup mistake as a passing check. Now the
-- line is forced infeasible with a clear reason instead.
--
-- A fresh install via schema.sql already has this -- this file is only
-- for upgrading an existing database. Safe to re-run: guarded via
-- information_schema, same pattern as the earlier migrations.
--
-- Usage:
--   mysql -u <user> -p <database> < backend/migrations/2026-07-30_add_bom_missing.sql

SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'feasibility_lines' AND column_name = 'bom_missing'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE feasibility_lines ADD COLUMN bom_missing TINYINT(1) NULL AFTER covered_by_stock',
  'SELECT ''bom_missing column already exists, skipping'' AS status'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
