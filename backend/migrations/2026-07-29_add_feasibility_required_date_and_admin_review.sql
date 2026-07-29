-- Adds to feasibility_checks:
--   * required_by_date  -- when the customer needs the quantity, captured
--     on the feasibility request itself (alongside product + quantity).
--   * admin_review_required / admin_review_reason / admin_reviewed_at /
--     admin_reviewed_by / admin_review_notes -- the same admin-escalation
--     pattern already used on `orders` (see admin_review_required there),
--     covering two triggers here:
--       - 'override': Sales approved a shortfall exception (overrode an
--         infeasible result) with a comment -> admin is notified.
--       - 'stale_open': the check has sat open (not closed/converted) for
--         more than 5 days -> admin is notified. Populated by hitting
--         POST /api/feasibility/scan-stale periodically (e.g. daily cron),
--         mirroring POST /api/orders/scan-overdue.
--
-- A fresh install via schema.sql already has all of this -- this file is
-- only for upgrading an existing database. Safe to re-run: guarded via
-- information_schema, same pattern as the earlier migrations.
--
-- Usage:
--   mysql -u <user> -p <database> < backend/migrations/2026-07-29_add_feasibility_required_date_and_admin_review.sql

SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'feasibility_checks' AND column_name = 'required_by_date'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE feasibility_checks ADD COLUMN required_by_date DATE NULL AFTER status',
  'SELECT ''required_by_date column already exists, skipping'' AS status'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'feasibility_checks' AND column_name = 'admin_review_required'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE feasibility_checks ADD COLUMN admin_review_required TINYINT(1) NOT NULL DEFAULT 0 AFTER notes',
  'SELECT ''admin_review_required column already exists, skipping'' AS status'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'feasibility_checks' AND column_name = 'admin_review_reason'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE feasibility_checks ADD COLUMN admin_review_reason ENUM(''override'',''stale_open'') NULL AFTER admin_review_required',
  'SELECT ''admin_review_reason column already exists, skipping'' AS status'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'feasibility_checks' AND column_name = 'admin_reviewed_at'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE feasibility_checks ADD COLUMN admin_reviewed_at DATETIME NULL AFTER admin_review_reason',
  'SELECT ''admin_reviewed_at column already exists, skipping'' AS status'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'feasibility_checks' AND column_name = 'admin_reviewed_by'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE feasibility_checks ADD COLUMN admin_reviewed_by BIGINT UNSIGNED NULL AFTER admin_reviewed_at, ADD CONSTRAINT fk_feasibility_admin_reviewed_by FOREIGN KEY (admin_reviewed_by) REFERENCES users(id)',
  'SELECT ''admin_reviewed_by column already exists, skipping'' AS status'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'feasibility_checks' AND column_name = 'admin_review_notes'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE feasibility_checks ADD COLUMN admin_review_notes TEXT NULL AFTER admin_reviewed_by',
  'SELECT ''admin_review_notes column already exists, skipping'' AS status'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @idx_exists = (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'feasibility_checks' AND index_name = 'idx_feasibility_admin_review'
);
SET @sql = IF(@idx_exists = 0,
  'ALTER TABLE feasibility_checks ADD INDEX idx_feasibility_admin_review (admin_review_required)',
  'SELECT ''idx_feasibility_admin_review already exists, skipping'' AS status'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
