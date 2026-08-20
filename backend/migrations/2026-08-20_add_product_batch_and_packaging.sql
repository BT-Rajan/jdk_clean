-- Adds products.batch_size / products.batch_production_hours (how
-- production time is actually entered -- see Product model docstring
-- and crud.master_data.ProductCRUD, which keeps production_hours_per_
-- unit in sync from these), and the product_packaging_lines table
-- (packaging materials -- box, label, wrap -- a product needs when it
-- ships, distinct from bom_lines: see app/models/product_packaging.py).
--
-- A fresh install via schema.sql already has both -- this file is only
-- for upgrading an existing database. Safe to re-run.
--
-- Usage:
--   mysql -u <user> -p <database> < backend/migrations/2026-08-20_add_product_batch_and_packaging.sql

SET @has_batch_size = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'products' AND column_name = 'batch_size'
);
SET @sql = IF(@has_batch_size = 0,
  'ALTER TABLE products ADD COLUMN batch_size DECIMAL(14,4) NULL AFTER selling_price, ADD COLUMN batch_production_hours DECIMAL(10,4) NULL AFTER batch_size',
  'SELECT ''batch_size already exists on products, skipping'' AS status'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

CREATE TABLE IF NOT EXISTS product_packaging_lines (
    id                      BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    product_id              BIGINT UNSIGNED NOT NULL,
    packaging_material_id   BIGINT UNSIGNED NOT NULL,
    quantity_per_unit       DECIMAL(14,4) NOT NULL,
    unit                    VARCHAR(20) NOT NULL,
    deleted_at              DATETIME NULL,
    created_at              DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by              BIGINT UNSIGNED NULL,
    updated_at              DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    updated_by              BIGINT UNSIGNED NULL,
    CONSTRAINT fk_packaging_product FOREIGN KEY (product_id) REFERENCES products(id),
    CONSTRAINT fk_packaging_material FOREIGN KEY (packaging_material_id) REFERENCES raw_materials(id),
    INDEX idx_packaging_product (product_id),
    INDEX idx_packaging_deleted_at (deleted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
