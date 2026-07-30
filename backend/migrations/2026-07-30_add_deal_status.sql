-- Adds deals.status ('open'/'cancelled') -- a deal whose order was
-- cancelled used to just sit at whatever furthest_stage it last reached,
-- with no indication it didn't actually complete. Set to 'cancelled' by
-- deal_service.reconcile_deal_status once nothing under the deal (no
-- order, quotation, or feasibility check) could still move it forward
-- and it never reached a delivered order; reopened automatically if a
-- feasibility check under it is later revived.
--
-- A fresh install via schema.sql already has this -- this file is only
-- for upgrading an existing database. Safe to re-run: guarded via
-- information_schema, same pattern as the earlier migrations.
--
-- Usage:
--   mysql -u <user> -p <database> < backend/migrations/2026-07-30_add_deal_status.sql

SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'deals' AND column_name = 'status'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE deals ADD COLUMN status ENUM(''open'',''cancelled'') NOT NULL DEFAULT ''open'' AFTER furthest_stage',
  'SELECT ''status column already exists on deals, skipping'' AS status'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
