-- P7 of the Production pass (see docs/production-lifecycle.md and the
-- P7 implementation report): external QC workflow -- JDK never performs
-- the actual testing itself, this only tracks the external
-- lab/agent request, sample dispatch, report receipt, and the
-- accept/reject conclusion, plus gates when a Production Execution's
-- produced quantity becomes real, releasable FinishedGoodsInventory
-- stock.
--
-- Adds `released_quantity` to production_executions (the column
-- distinguishing "produced" from "QC-released" -- see
-- app/models/production_execution.py), and two new tables: qc_agents
-- (the external labs) and qc_requests (the workflow itself).
--
-- A fresh install via schema.sql already has all of this -- this file
-- is only for upgrading an existing database. Safe to re-run: guarded
-- by information_schema, same pattern as every other ALTER migration.
--
-- Usage:
--   mysql -u <user> -p <database> < backend/migrations/2026-09-30_add_external_qc.sql

SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'production_executions' AND column_name = 'released_quantity'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE production_executions ADD COLUMN released_quantity DECIMAL(14,4) NOT NULL DEFAULT 0 AFTER produced_quantity',
  'SELECT ''production_executions.released_quantity already exists, skipping'' AS status'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

CREATE TABLE IF NOT EXISTS qc_agents (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    code            VARCHAR(30) NOT NULL UNIQUE,
    name            VARCHAR(150) NOT NULL,
    contact_person  VARCHAR(120) NULL,
    email           VARCHAR(120) NULL,
    phone           VARCHAR(30) NULL,
    address         VARCHAR(255) NULL,
    status          ENUM('active','inactive') NOT NULL DEFAULT 'active',
    deleted_at      DATETIME NULL,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by      BIGINT UNSIGNED NULL,
    updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    updated_by      BIGINT UNSIGNED NULL,
    INDEX idx_qc_agents_status (status),
    INDEX idx_qc_agents_deleted_at (deleted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS qc_requests (
    id                      BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    qc_request_number      VARCHAR(30) NOT NULL UNIQUE,
    production_order_id    BIGINT UNSIGNED NOT NULL,
    production_execution_id BIGINT UNSIGNED NOT NULL,
    product_id              BIGINT UNSIGNED NOT NULL,
    qc_agent_id             BIGINT UNSIGNED NOT NULL,
    sample_reference        VARCHAR(30) NOT NULL UNIQUE,
    sample_quantity         DECIMAL(14,4) NULL,
    request_date            DATE NOT NULL,
    expected_report_date    DATE NULL,
    status                  ENUM('requested','sample_sent','report_received','accepted','rejected') NOT NULL DEFAULT 'requested',
    dispatch_date           DATE NULL,
    dispatch_method         VARCHAR(120) NULL,
    external_reference      VARCHAR(80) NULL,
    dispatched_by           BIGINT UNSIGNED NULL,
    report_number           VARCHAR(60) NULL,
    report_date             DATE NULL,
    received_date           DATE NULL,
    decided_date            DATE NULL,
    decided_by              BIGINT UNSIGNED NULL,
    notes                   TEXT NULL,
    id_document_filename    VARCHAR(255) NULL,
    id_verified             TINYINT(1) NOT NULL DEFAULT 0,
    id_verified_at          DATETIME NULL,
    id_verified_by          BIGINT UNSIGNED NULL,
    admin_review_required   TINYINT(1) NOT NULL DEFAULT 0,
    admin_reviewed_at       DATETIME NULL,
    admin_reviewed_by       BIGINT UNSIGNED NULL,
    admin_review_notes      TEXT NULL,
    created_at              DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by              BIGINT UNSIGNED NULL,
    updated_at              DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    updated_by              BIGINT UNSIGNED NULL,
    CONSTRAINT fk_qcr_production_order FOREIGN KEY (production_order_id) REFERENCES production_orders(id),
    CONSTRAINT fk_qcr_production_execution FOREIGN KEY (production_execution_id) REFERENCES production_executions(id),
    CONSTRAINT fk_qcr_product FOREIGN KEY (product_id) REFERENCES products(id),
    CONSTRAINT fk_qcr_qc_agent FOREIGN KEY (qc_agent_id) REFERENCES qc_agents(id),
    CONSTRAINT fk_qcr_dispatched_by FOREIGN KEY (dispatched_by) REFERENCES users(id),
    CONSTRAINT fk_qcr_decided_by FOREIGN KEY (decided_by) REFERENCES users(id),
    CONSTRAINT fk_qcr_id_verified_by FOREIGN KEY (id_verified_by) REFERENCES users(id),
    CONSTRAINT fk_qcr_admin_reviewed_by FOREIGN KEY (admin_reviewed_by) REFERENCES users(id),
    INDEX idx_qcr_production_order (production_order_id),
    INDEX idx_qcr_production_execution (production_execution_id),
    INDEX idx_qcr_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO number_series (doc_type, prefix, next_number, padding) VALUES
    ('QC_REQUEST', 'QCR', 1, 5),
    ('QC_SAMPLE', 'SMP', 1, 5);
