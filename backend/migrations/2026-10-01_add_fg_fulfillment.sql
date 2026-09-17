-- P8 of the Production pass (see docs/production-lifecycle.md and the
-- P8 implementation report): finished-goods inventory & order
-- fulfilment, correcting an architecture flaw from P2's original
-- Production Order design.
--
-- JDK actually runs on a stock-driven model: production happens
-- continuously against expected demand, and a Customer Order simply
-- consumes whatever released FG stock is available rather than owning a
-- dedicated Production Order of its own. P2 made order_id/order_detail_id
-- on production_orders mandatory, forcing every Production Order to be
-- make-to-order; this migration makes both nullable so a Production
-- Order can also exist purely to build/replenish general FG stock.
--
-- Also adds:
--   - qc_requests.quantity -- how much of an execution's produced_quantity
--     one QC request's accept/reject decision applies to, distinct from
--     the pre-existing sample_quantity (the physical sample sent to the
--     lab). Needed to support multiple/partial QC requests splitting a
--     single execution's output (see app/models/qc_request.py).
--   - production_executions.rejected_quantity -- the released_quantity
--     column's sibling: how much of produced_quantity QC has instead
--     rejected (see app/models/production_execution.py).
--
-- A fresh install via schema.sql already has all of this -- this file is
-- only for upgrading an existing database. Safe to re-run: guarded by
-- information_schema, same pattern as every other ALTER migration.
--
-- Usage:
--   mysql -u <user> -p <database> < backend/migrations/2026-10-01_add_fg_fulfillment.sql

-- production_orders.order_id / order_detail_id: NOT NULL -> NULL.
SET @col_nullable = (
  SELECT IS_NULLABLE FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'production_orders' AND column_name = 'order_id'
);
SET @sql = IF(@col_nullable = 'NO',
  'ALTER TABLE production_orders MODIFY COLUMN order_id BIGINT UNSIGNED NULL',
  'SELECT ''production_orders.order_id already nullable, skipping'' AS status'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_nullable = (
  SELECT IS_NULLABLE FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'production_orders' AND column_name = 'order_detail_id'
);
SET @sql = IF(@col_nullable = 'NO',
  'ALTER TABLE production_orders MODIFY COLUMN order_detail_id BIGINT UNSIGNED NULL',
  'SELECT ''production_orders.order_detail_id already nullable, skipping'' AS status'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- qc_requests.quantity -- backfilled from produced_quantity of the
-- request's own execution for any pre-existing row (a P7-era request
-- always decided an execution's entire output at once, so its execution's
-- full produced_quantity is exactly what it was deciding).
SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'qc_requests' AND column_name = 'quantity'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE qc_requests ADD COLUMN quantity DECIMAL(14,4) NOT NULL DEFAULT 0 AFTER sample_reference',
  'SELECT ''qc_requests.quantity already exists, skipping'' AS status'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

UPDATE qc_requests qcr
JOIN production_executions pe ON pe.id = qcr.production_execution_id
SET qcr.quantity = pe.produced_quantity
WHERE qcr.quantity = 0;

-- production_executions.rejected_quantity.
SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'production_executions' AND column_name = 'rejected_quantity'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE production_executions ADD COLUMN rejected_quantity DECIMAL(14,4) NOT NULL DEFAULT 0 AFTER released_quantity',
  'SELECT ''production_executions.rejected_quantity already exists, skipping'' AS status'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Backfill: a pre-existing rejected QC request rejected its whole
-- execution's produced_quantity (same P7-era all-or-nothing semantics as
-- the quantity backfill above).
UPDATE production_executions pe
JOIN qc_requests qcr ON qcr.production_execution_id = pe.id AND qcr.status = 'rejected'
SET pe.rejected_quantity = pe.produced_quantity
WHERE pe.rejected_quantity = 0;
