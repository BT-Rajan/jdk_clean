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
  -- Deliberately no 'AFTER covered_by_stock' here: that column comes
  -- from a different migration file (2026-07-30_add_covered_by_stock.sql)
  -- that happens to sort *after* this one alphabetically, which would
  -- make this ALTER fail on a database that hasn't run that one yet.
  -- Column position is purely cosmetic, so it's not worth the ordering
  -- dependency between two same-day migration files.
  'ALTER TABLE feasibility_lines ADD COLUMN bom_missing TINYINT(1) NULL',
  'SELECT ''bom_missing column already exists, skipping'' AS status'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
