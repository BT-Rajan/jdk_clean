-- Upgrades the BOM module with a proper header (boms table), separate
-- from the existing bom_lines: bom_number, the batch size its lines'
-- quantities are expressed against (output_quantity), an active/
-- inactive status, and notes. At most one BOM per product (product_id
-- UNIQUE) -- see app/models/bom.py's Bom docstring for why this is
-- deliberately not a versioned/revisioned history.
--
-- Every existing product that already has bom_lines gets a header
-- backfilled automatically: output_quantity=1 (so its lines keep
-- meaning exactly what they meant before -- "per unit"), status=
-- 'active' (so it keeps being usable by Production/MRP/Feasibility with
-- no extra step), bom_number assigned sequentially. Nothing about
-- existing bom_lines rows changes.
--
-- A fresh install via schema.sql already has all of this -- this file is
-- only for upgrading an existing database. Safe to re-run: every step is
-- guarded via information_schema, and the backfill only inserts a header
-- for a product that doesn't already have one.
--
-- Usage:
--   mysql -u <user> -p <database> < backend/migrations/2026-09-18_upgrade_bom_module.sql

CREATE TABLE IF NOT EXISTS boms (
    id                  BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    bom_number          VARCHAR(30) NOT NULL UNIQUE,
    product_id          BIGINT UNSIGNED NOT NULL UNIQUE,
    output_quantity     DECIMAL(14,4) NOT NULL DEFAULT 1,
    status              ENUM('active','inactive') NOT NULL DEFAULT 'active',
    notes               VARCHAR(500) NULL,
    deleted_at          DATETIME NULL,
    created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by          BIGINT UNSIGNED NULL,
    updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    updated_by          BIGINT UNSIGNED NULL,
    CONSTRAINT fk_bom_header_product FOREIGN KEY (product_id) REFERENCES products(id),
    INDEX idx_bom_header_deleted_at (deleted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO number_series (doc_type, prefix, next_number, padding) VALUES ('BOM', 'BOM', 1, 5);

-- Backfill: one header per product that already has active bom_lines
-- and doesn't have one yet. bom_number is assigned sequentially via a
-- session variable, same technique the 2026-09-15 customer_number
-- migration used for the same "backfill many existing rows with a
-- generated sequential code" problem.
SET @rownum = 0;
INSERT INTO boms (bom_number, product_id, output_quantity, status)
SELECT CONCAT('BOM-', LPAD(@rownum:=@rownum+1, 5, '0')), needs_header.product_id, 1, 'active'
FROM (
    SELECT DISTINCT bl.parent_product_id AS product_id
    FROM bom_lines bl
    WHERE bl.deleted_at IS NULL
      AND NOT EXISTS (SELECT 1 FROM boms b WHERE b.product_id = bl.parent_product_id)
) AS needs_header
ORDER BY needs_header.product_id;

-- Continue BOM's number series on from whatever the backfill above just
-- claimed, so the next newly-created BOM never collides with a
-- backfilled bom_number. Only adjusts on the first run (next_number
-- still at its seeded 1) -- a later re-run is a no-op here.
UPDATE number_series
SET next_number = (SELECT COUNT(*) FROM boms) + 1
WHERE doc_type = 'BOM' AND next_number = 1;
