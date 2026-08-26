-- Communication module, WhatsApp channel: a single admin-configured
-- Meta WhatsApp Business Cloud API sender. Deliberately template-only --
-- there is no free-form send anywhere in this channel. Messages can
-- only go out using a template that Meta has already approved for this
-- WhatsApp Business Account (fetched live from Meta, never typed in by
-- hand -- see app/services/whatsapp_account_service.list_templates).
-- Access token stored encrypted (Fernet, see app/core/crypto.py). A
-- fresh install via schema.sql already has this table -- this file is
-- only for upgrading an existing database. Safe to re-run.

CREATE TABLE IF NOT EXISTS whatsapp_accounts (
    id                      BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    phone_number_id         VARCHAR(64) NOT NULL DEFAULT '',
    waba_id                 VARCHAR(64) NOT NULL DEFAULT '',
    display_phone_number    VARCHAR(32) NOT NULL DEFAULT '',
    verified_name           VARCHAR(255) NOT NULL DEFAULT '',
    access_token_encrypted  TEXT NULL,
    api_version             VARCHAR(10) NOT NULL DEFAULT 'v21.0',
    is_active               TINYINT(1) NOT NULL DEFAULT 0,
    last_tested_at          DATETIME NULL,
    last_test_ok            TINYINT(1) NULL,
    last_test_error         VARCHAR(500) NULL,
    created_at              DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by              BIGINT UNSIGNED NULL,
    updated_at              DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    updated_by              BIGINT UNSIGNED NULL,
    CONSTRAINT fk_whatsapp_account_created_by FOREIGN KEY (created_by) REFERENCES users(id),
    CONSTRAINT fk_whatsapp_account_updated_by FOREIGN KEY (updated_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
