-- Mandatory reason when a production batch is completed with
-- produced_quantity different from planned_quantity (either direction)
-- -- see production_service.change_status's 'completed' branch.
-- Distinct from material_discrepancy_notes, which is about raw-material
-- *consumption* vs. the BOM, not finished-goods output vs. plan.
--
-- Safe to re-run: the ALTER is guarded via information_schema.
--
-- A fresh install via schema.sql already has this column -- this file
-- is only for upgrading an existing database.
--
-- Usage:
--   mysql -u <user> -p <database> < backend/migrations/2026-10-05_add_production_quantity_discrepancy_reason.sql

SET @has_col = (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'production_schedules' AND column_name = 'quantity_discrepancy_reason');
SET @sql = IF(@has_col = 0, 'ALTER TABLE production_schedules ADD COLUMN quantity_discrepancy_reason TEXT NULL AFTER pause_reason', 'SELECT ''production_schedules.quantity_discrepancy_reason already exists, skipping'' AS status');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
