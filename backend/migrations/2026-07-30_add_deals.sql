-- Adds the `deals` table -- a loose grouping that ties one customer
-- request's feasibility check, quotation(s), and order together, so
-- "where does this stand" is one query instead of chasing foreign keys
-- across five tables. Loose on purpose: a deal can start at feasibility,
-- or at a standalone quotation, or at a standalone order -- whichever
-- stage is created first (with no deal_id explicitly given) creates one.
-- Nothing requires a deal to pass through every stage in order.
--
-- Also adds quotations.auto_created -- true when the system drafted a
-- quotation automatically because a feasibility check just passed,
-- false for a person-created one. See feasibility_service.py's
-- auto-creation hook and Settings -> Sales -> "Auto-create quotation
-- when feasibility passes" for the admin-controlled on/off switch.
--
-- A fresh install via schema.sql already has all of this -- this file is
-- only for upgrading an existing database. Safe to re-run: guarded via
-- information_schema, same pattern as the earlier migrations.
--
-- Usage:
--   mysql -u <user> -p <database> < backend/migrations/2026-07-30_add_deals.sql

CREATE TABLE IF NOT EXISTS deals (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    deal_number     VARCHAR(30) NOT NULL UNIQUE,
    customer_id     BIGINT UNSIGNED NOT NULL,
    furthest_stage  ENUM('feasibility','quotation','order','production','delivery') NOT NULL DEFAULT 'feasibility',
    deleted_at      DATETIME NULL,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by      BIGINT UNSIGNED NULL,
    updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    updated_by      BIGINT UNSIGNED NULL,
    CONSTRAINT fk_deals_customer FOREIGN KEY (customer_id) REFERENCES customers(id),
    INDEX idx_deals_customer (customer_id),
    INDEX idx_deals_deleted_at (deleted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO number_series (doc_type, prefix, next_number, padding) VALUES
    ('DEAL', 'DEAL', 1, 5);

SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'feasibility_checks' AND column_name = 'deal_id'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE feasibility_checks ADD COLUMN deal_id BIGINT UNSIGNED NULL AFTER customer_id, ADD CONSTRAINT fk_feasibility_deal FOREIGN KEY (deal_id) REFERENCES deals(id), ADD INDEX idx_feasibility_deal (deal_id)',
  'SELECT ''deal_id column already exists on feasibility_checks, skipping'' AS status'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'quotations' AND column_name = 'deal_id'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE quotations ADD COLUMN deal_id BIGINT UNSIGNED NULL AFTER customer_id, ADD CONSTRAINT fk_quotations_deal FOREIGN KEY (deal_id) REFERENCES deals(id), ADD INDEX idx_quotations_deal (deal_id)',
  'SELECT ''deal_id column already exists on quotations, skipping'' AS status'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'quotations' AND column_name = 'auto_created'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE quotations ADD COLUMN auto_created TINYINT(1) NOT NULL DEFAULT 0 AFTER feasibility_id',
  'SELECT ''auto_created column already exists on quotations, skipping'' AS status'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'orders' AND column_name = 'deal_id'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE orders ADD COLUMN deal_id BIGINT UNSIGNED NULL AFTER customer_id, ADD CONSTRAINT fk_orders_deal FOREIGN KEY (deal_id) REFERENCES deals(id), ADD INDEX idx_orders_deal (deal_id)',
  'SELECT ''deal_id column already exists on orders, skipping'' AS status'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
