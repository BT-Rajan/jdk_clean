-- Mandatory reason when a Production-Order-driven schedule is allowed to
-- exceed its order's remaining unscheduled quantity (overproduction) --
-- see production_order_schedule_service.create_schedule/reschedule's
-- allow_overproduction path. Always NULL for a schedule that stayed
-- within the requirement, and for the legacy (non-Production-Order)
-- scheduling flow, which has no such cap to override.
--
-- Safe to re-run: the ALTER is guarded via information_schema.
--
-- A fresh install via schema.sql already has this column -- this file
-- is only for upgrading an existing database.
--
-- Usage:
--   mysql -u <user> -p <database> < backend/migrations/2026-10-06_add_production_schedule_overproduction_reason.sql

SET @has_col = (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'production_schedules' AND column_name = 'overproduction_reason');
SET @sql = IF(@has_col = 0, 'ALTER TABLE production_schedules ADD COLUMN overproduction_reason TEXT NULL AFTER quantity_discrepancy_reason', 'SELECT ''production_schedules.overproduction_reason already exists, skipping'' AS status');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
