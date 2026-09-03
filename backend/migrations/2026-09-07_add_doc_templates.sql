-- Adds doc_templates (Admin -> Documents -- an admin-uploaded .docx
-- template overriding the bundled default for one (doc_type, language)
-- pair; see doc_template_service.py). A row only exists once someone
-- has uploaded a replacement -- no seed data needed here, the bundled
-- defaults ship as files under backend/app/assets/doc_templates/.
--
-- A fresh install via schema.sql already has this table -- this file is
-- only for upgrading an existing database. Safe to re-run: the table
-- create is idempotent.
--
-- Usage:
--   mysql -u <user> -p <database> < backend/migrations/2026-09-07_add_doc_templates.sql

CREATE TABLE IF NOT EXISTS doc_templates (
    id                  BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    doc_type            VARCHAR(20) NOT NULL,
    language            VARCHAR(5) NOT NULL,
    filename            VARCHAR(255) NOT NULL,
    original_filename   VARCHAR(255) NOT NULL,
    created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by          BIGINT UNSIGNED NULL,
    updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    updated_by          BIGINT UNSIGNED NULL,
    UNIQUE KEY uq_doc_templates_type_lang (doc_type, language)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
