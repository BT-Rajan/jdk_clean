-- Adds the `production_orders` table -- the internal manufacturing
-- instruction created from a confirmed customer order line (P2 of the
-- Production pass; see docs/production-lifecycle.md and
-- docs/production-audit.md for the full architecture reasoning).
--
-- A Production Order answers WHAT needs to be produced, how much, for
-- which order line, and by when. It deliberately does NOT touch
-- scheduling (machine/dates -- see production_schedules) or execution
-- (actual output) -- those remain ProductionSchedule's job, built in a
-- later pass. Traceable to exactly one order line (order_detail_id), so
-- "how much of this line is already committed to production" is a sum
-- over sibling Production Orders rather than a separate running total.
--
-- A fresh install via schema.sql already has this table -- this file is
-- only for upgrading an existing database. Safe to re-run: CREATE TABLE
-- IF NOT EXISTS and INSERT IGNORE, same pattern as every other
-- new-table migration (e.g. 2026-07-30_add_deals.sql).
--
-- Usage:
--   mysql -u <user> -p <database> < backend/migrations/2026-09-16_add_production_orders.sql

CREATE TABLE IF NOT EXISTS production_orders (
    id                          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    production_order_number    VARCHAR(30) NOT NULL UNIQUE,      -- generated via number_series (prefix e.g. PRO-00001)
    order_id                    BIGINT UNSIGNED NOT NULL,
    order_detail_id             BIGINT UNSIGNED NOT NULL,          -- the specific customer order line this fulfils
    product_id                  BIGINT UNSIGNED NOT NULL,          -- mirrors order_details.product_id at creation
    planned_quantity            DECIMAL(14,4) NOT NULL,
    due_date                    DATE NOT NULL,
    priority                    ENUM('low','normal','high','urgent') NOT NULL DEFAULT 'normal',
    status                      ENUM('planned','cancelled') NOT NULL DEFAULT 'planned',
    cancel_reason                TEXT NULL,                        -- mandatory when status becomes 'cancelled'
    notes                        TEXT NULL,
    created_at                  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by                  BIGINT UNSIGNED NULL,
    updated_at                  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    updated_by                  BIGINT UNSIGNED NULL,
    CONSTRAINT fk_po_order FOREIGN KEY (order_id) REFERENCES orders(id),
    CONSTRAINT fk_po_order_detail FOREIGN KEY (order_detail_id) REFERENCES order_details(id),
    CONSTRAINT fk_po_product FOREIGN KEY (product_id) REFERENCES products(id),
    INDEX idx_po_order (order_id),
    INDEX idx_po_order_detail (order_detail_id),
    INDEX idx_po_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO number_series (doc_type, prefix, next_number, padding) VALUES
    ('PRODUCTION_ORDER', 'PRO', 1, 5);
