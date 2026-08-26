-- Communication module, SMS channel: a single admin-configured bulk SMS
-- account for one of Kuwait's common gateway operators (kwtSMS, Unifonic,
-- SMSala) or a custom HTTP endpoint. API password/secret stored encrypted
-- (Fernet, see app/core/crypto.py), never plaintext. A fresh install via
-- schema.sql already has this table -- this file is only for upgrading
-- an existing database. Safe to re-run.

CREATE TABLE IF NOT EXISTS sms_accounts (
    id                      BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    provider                VARCHAR(20) NOT NULL DEFAULT 'kwtsms',
    sender_id               VARCHAR(20) NOT NULL DEFAULT '',
    api_url                 VARCHAR(255) NOT NULL DEFAULT 'https://www.kwtsms.com/API/send/',
    api_username            VARCHAR(255) NOT NULL DEFAULT '',
    api_password_encrypted  TEXT NULL,
    test_mode               TINYINT(1) NOT NULL DEFAULT 1,
    is_active               TINYINT(1) NOT NULL DEFAULT 0,
    last_tested_at          DATETIME NULL,
    last_test_ok            TINYINT(1) NULL,
    last_test_error         VARCHAR(500) NULL,
    created_at              DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by              BIGINT UNSIGNED NULL,
    updated_at              DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    updated_by              BIGINT UNSIGNED NULL,
    CONSTRAINT fk_sms_account_created_by FOREIGN KEY (created_by) REFERENCES users(id),
    CONSTRAINT fk_sms_account_updated_by FOREIGN KEY (updated_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
