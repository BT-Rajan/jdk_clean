-- Adds email_templates (Admin -> Documents -- the subject/body an
-- automated or one-click document email goes out with; rows are
-- auto-created from their code-defined default on first read, see
-- email_template_service.py, so no seed data needs inserting here) and
-- orders.confirmation_emailed_at (set when the new automatic
-- order-confirmation email successfully sends).
--
-- A fresh install via schema.sql already has both -- this file is only
-- for upgrading an existing database. Safe to re-run: the table create
-- is idempotent and the column add is guarded via information_schema,
-- same pattern as earlier migrations.
--
-- Usage:
--   mysql -u <user> -p <database> < backend/migrations/2026-09-06_add_email_templates.sql

CREATE TABLE IF NOT EXISTS email_templates (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    template_key    VARCHAR(40) NOT NULL UNIQUE,
    name            VARCHAR(120) NOT NULL,
    subject         VARCHAR(255) NOT NULL,
    body            TEXT NOT NULL,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by      BIGINT UNSIGNED NULL,
    updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    updated_by      BIGINT UNSIGNED NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SET @has_col = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'orders' AND column_name = 'confirmation_emailed_at'
);
SET @sql = IF(@has_col = 0,
  'ALTER TABLE orders ADD COLUMN confirmation_emailed_at DATETIME NULL AFTER payment_requested_at',
  'SELECT ''confirmation_emailed_at already exists on orders, skipping'' AS status'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
