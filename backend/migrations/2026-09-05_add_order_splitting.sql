-- Adds orders.parent_order_id -- lets a 'ready_to_ship' order be split
-- into a deliverable-now child order when stock can't cover it in full
-- (see order_service.split_order). The child is a completely normal
-- order from there on: its own number, its own delivery note, its own
-- status progression.
--
-- A fresh install via schema.sql already has this -- this file is only
-- for upgrading an existing database. Safe to re-run: the column add is
-- guarded via information_schema, same pattern as earlier migrations.
--
-- Usage:
--   mysql -u <user> -p <database> < backend/migrations/2026-09-05_add_order_splitting.sql

SET @has_col = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'orders' AND column_name = 'parent_order_id'
);
SET @sql = IF(@has_col = 0,
  'ALTER TABLE orders ADD COLUMN parent_order_id BIGINT UNSIGNED NULL AFTER payment_requested_at, '
  'ADD CONSTRAINT fk_orders_parent_order FOREIGN KEY (parent_order_id) REFERENCES orders(id), '
  'ADD INDEX idx_orders_parent (parent_order_id)',
  'SELECT ''parent_order_id already exists on orders, skipping'' AS status'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
