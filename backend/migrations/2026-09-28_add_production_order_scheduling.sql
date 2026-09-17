-- Links production_schedules to the Production Order it fulfils (P2),
-- and adds time-of-day precision for the new Production Order
-- scheduling flow (P5) -- see docs/production-lifecycle.md and the P5
-- implementation report.
--
-- production_order_id is nullable: a legacy batch auto-scheduled
-- straight from order confirmation (order_service.
-- _maybe_auto_schedule_production) predates the Production Order entity
-- entirely and has no such row to point at.
--
-- planned_start/planned_end are new DATETIME columns alongside the
-- existing DATE-only scheduled_start/scheduled_end -- not a replacement.
-- Those two columns are read by capacity_service, dashboard_service,
-- report_service, notification_service, feasibility_service and
-- calendar_service, all at day granularity; changing their type would
-- risk breaking every one of those (e.g. comparing a bare `date` against
-- a `datetime` raises in Python). Instead, a schedule created through
-- the new Production Order flow populates all four columns --
-- scheduled_start/scheduled_end as planned_start/planned_end's own
-- calendar date -- so every existing day-granularity consumer keeps
-- working unchanged, while planned_start/planned_end give the new
-- machine-conflict check and the Production Order schedule UI the exact
-- time a legacy batch never recorded.
--
-- A fresh install via schema.sql already has these -- this file is only
-- for upgrading an existing database. Safe to re-run.
--
-- Usage:
--   mysql -u <user> -p <database> < backend/migrations/2026-09-28_add_production_order_scheduling.sql

SET @has_production_order_id = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'production_schedules' AND column_name = 'production_order_id'
);
SET @sql = IF(@has_production_order_id = 0,
  'ALTER TABLE production_schedules ADD COLUMN production_order_id BIGINT UNSIGNED NULL AFTER order_id',
  'SELECT ''production_schedules.production_order_id already exists, skipping'' AS status'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_planned_start = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'production_schedules' AND column_name = 'planned_start'
);
SET @sql = IF(@has_planned_start = 0,
  'ALTER TABLE production_schedules ADD COLUMN planned_start DATETIME NULL AFTER scheduled_end',
  'SELECT ''production_schedules.planned_start already exists, skipping'' AS status'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_planned_end = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'production_schedules' AND column_name = 'planned_end'
);
SET @sql = IF(@has_planned_end = 0,
  'ALTER TABLE production_schedules ADD COLUMN planned_end DATETIME NULL AFTER planned_start',
  'SELECT ''production_schedules.planned_end already exists, skipping'' AS status'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_fk = (
  SELECT COUNT(*) FROM information_schema.table_constraints
  WHERE table_schema = DATABASE() AND table_name = 'production_schedules' AND constraint_name = 'fk_ps_production_order'
);
SET @sql = IF(@has_fk = 0,
  'ALTER TABLE production_schedules ADD CONSTRAINT fk_ps_production_order FOREIGN KEY (production_order_id) REFERENCES production_orders(id)',
  'SELECT ''fk_ps_production_order already exists, skipping'' AS status'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_index = (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'production_schedules' AND index_name = 'idx_ps_production_order'
);
SET @sql = IF(@has_index = 0,
  'CREATE INDEX idx_ps_production_order ON production_schedules (production_order_id)',
  'SELECT ''idx_ps_production_order already exists, skipping'' AS status'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_machine_index = (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'production_schedules' AND index_name = 'idx_ps_machine_planned'
);
SET @sql = IF(@has_machine_index = 0,
  'CREATE INDEX idx_ps_machine_planned ON production_schedules (machine_id, planned_start, planned_end)',
  'SELECT ''idx_ps_machine_planned already exists, skipping'' AS status'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
