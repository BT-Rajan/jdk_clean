-- Adds `allocated_quantity` to production_order_material_requirements --
-- P4 of the Production pass (see docs/production-lifecycle.md and the
-- P4 implementation report). Tracks how much of each requirement row's
-- raw material has actually been committed (reserved) to this specific
-- Production Order, as opposed to sitting merely "required."
--
-- Deliberately an additive column on the existing P3 table rather than
-- a new table -- that table's own docstring anticipated exactly this
-- extension. available/shortage stay computed live from inventory, not
-- persisted, same as P3; only the allocation *decision* itself (which
-- the app made, not a live fact about the world) is stored.
--
-- A fresh install via schema.sql already has this column -- this file
-- is only for upgrading an existing database. Safe to re-run: guarded
-- by information_schema, same pattern as every other ALTER migration
-- (e.g. 2026-09-23_add_production_admin_review.sql).
--
-- Usage:
--   mysql -u <user> -p <database> < backend/migrations/2026-09-27_add_production_order_material_allocation.sql

SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'production_order_material_requirements' AND column_name = 'allocated_quantity'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE production_order_material_requirements ADD COLUMN allocated_quantity DECIMAL(14,4) NOT NULL DEFAULT 0 AFTER required_quantity',
  'SELECT ''production_order_material_requirements.allocated_quantity already exists, skipping'' AS status'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
