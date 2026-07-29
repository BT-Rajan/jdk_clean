-- Adds the feasibility-check stage that now gates quotation creation, plus
-- the close-reason / admin-escalation columns enforcing:
--   feasibility -> (feasible or Sales exception-approved) -> quotation
--   quotation -> order, or Sales closes it with a reason
--   order -> delivery note, or Sales cancels it with a reason
--   order overdue on delivery with neither -> flagged for admin review
--
-- A fresh install via schema.sql already has all of this -- this file is
-- only for upgrading an existing database. Safe to re-run: guarded via
-- information_schema, same pattern as the earlier migrations.
--
-- Usage:
--   mysql -u <user> -p <database> < backend/migrations/2026-07-29_add_feasibility_and_workflow_gates.sql

CREATE TABLE IF NOT EXISTS feasibility_checks (
    id                  BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    feasibility_number  VARCHAR(30) NOT NULL UNIQUE,
    customer_id         BIGINT UNSIGNED NOT NULL,
    status              ENUM('draft','feasible','exception_pending','exception_approved','exception_rejected','closed','converted') NOT NULL DEFAULT 'draft',
    checked_at          DATETIME NULL,
    exception_reason    TEXT NULL,
    exception_by        BIGINT UNSIGNED NULL,
    close_reason        TEXT NULL,
    notes               TEXT NULL,
    deleted_at          DATETIME NULL,
    created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by          BIGINT UNSIGNED NULL,
    updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    updated_by          BIGINT UNSIGNED NULL,
    CONSTRAINT fk_feasibility_customer FOREIGN KEY (customer_id) REFERENCES customers(id),
    CONSTRAINT fk_feasibility_exception_by FOREIGN KEY (exception_by) REFERENCES users(id),
    INDEX idx_feasibility_status (status),
    INDEX idx_feasibility_deleted_at (deleted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS feasibility_lines (
    id                  BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    feasibility_id      BIGINT UNSIGNED NOT NULL,
    product_id          BIGINT UNSIGNED NOT NULL,
    quantity            DECIMAL(14,4) NOT NULL,
    is_feasible         TINYINT(1) NULL,
    shortfall_json      TEXT NULL,
    CONSTRAINT fk_fl_feasibility FOREIGN KEY (feasibility_id) REFERENCES feasibility_checks(id) ON DELETE CASCADE,
    CONSTRAINT fk_fl_product FOREIGN KEY (product_id) REFERENCES products(id),
    INDEX idx_fl_feasibility (feasibility_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- quotations: link back to the feasibility check it was raised from, and a
-- close_reason for when Sales closes it without converting to an order.
SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'quotations' AND column_name = 'feasibility_id'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE quotations ADD COLUMN feasibility_id BIGINT UNSIGNED NULL AFTER converted_order_id, ADD CONSTRAINT fk_quotations_feasibility FOREIGN KEY (feasibility_id) REFERENCES feasibility_checks(id)',
  'SELECT ''feasibility_id column already exists, skipping'' AS status'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'quotations' AND column_name = 'close_reason'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE quotations ADD COLUMN close_reason TEXT NULL AFTER feasibility_id',
  'SELECT ''close_reason column already exists, skipping'' AS status'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- orders: close_reason for a cancel-without-delivery-note, plus the
-- overdue-delivery admin escalation fields.
SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'orders' AND column_name = 'close_reason'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE orders ADD COLUMN close_reason TEXT NULL AFTER notes',
  'SELECT ''close_reason column already exists, skipping'' AS status'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'orders' AND column_name = 'admin_review_required'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE orders ADD COLUMN admin_review_required TINYINT(1) NOT NULL DEFAULT 0 AFTER close_reason',
  'SELECT ''admin_review_required column already exists, skipping'' AS status'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'orders' AND column_name = 'admin_reviewed_at'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE orders ADD COLUMN admin_reviewed_at DATETIME NULL AFTER admin_review_required',
  'SELECT ''admin_reviewed_at column already exists, skipping'' AS status'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'orders' AND column_name = 'admin_reviewed_by'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE orders ADD COLUMN admin_reviewed_by BIGINT UNSIGNED NULL AFTER admin_reviewed_at, ADD CONSTRAINT fk_orders_admin_reviewed_by FOREIGN KEY (admin_reviewed_by) REFERENCES users(id)',
  'SELECT ''admin_reviewed_by column already exists, skipping'' AS status'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'orders' AND column_name = 'admin_review_notes'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE orders ADD COLUMN admin_review_notes TEXT NULL AFTER admin_reviewed_by',
  'SELECT ''admin_review_notes column already exists, skipping'' AS status'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

INSERT IGNORE INTO number_series (doc_type, prefix, next_number, padding) VALUES
    ('FEASIBILITY', 'FSB', 1, 5);
