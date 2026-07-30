-- Adds feasibility_lines.covered_by_stock -- how much of a requested
-- quantity was already sitting in unreserved finished-goods inventory at
-- check time, netted off before computing raw-material/machine-time
-- requirements for the remainder. Makes leftover product from a
-- cancelled order (see order_service.py's cascade-cancel hook) genuinely
-- reusable by a later feasibility check instead of every new request
-- re-deriving requirements for materials that were, in reality, already
-- consumed.
--
-- A fresh install via schema.sql already has this -- this file is only
-- for upgrading an existing database. Safe to re-run: guarded via
-- information_schema, same pattern as the earlier migrations.
--
-- Usage:
--   mysql -u <user> -p <database> < backend/migrations/2026-07-30_add_covered_by_stock.sql

SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'feasibility_lines' AND column_name = 'covered_by_stock'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE feasibility_lines ADD COLUMN covered_by_stock DECIMAL(14,4) NULL AFTER quantity',
  'SELECT ''covered_by_stock column already exists, skipping'' AS status'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
