-- Communication module, email channel: a single admin-configured mailbox
-- account (IMAP or POP3 for receiving, SMTP for sending). Password is
-- stored encrypted (Fernet, key derived from JWT_SECRET_KEY -- see
-- app/core/crypto.py), never in plaintext. A fresh install via schema.sql
-- already has this table -- this file is only for upgrading an existing
-- database. Safe to re-run.

CREATE TABLE IF NOT EXISTS email_accounts (
    id                  BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    provider            VARCHAR(20) NOT NULL DEFAULT 'gmail',
    email_address       VARCHAR(255) NOT NULL DEFAULT '',
    display_name        VARCHAR(255) NOT NULL DEFAULT '',
    username            VARCHAR(255) NOT NULL DEFAULT '',
    password_encrypted  TEXT NULL,
    incoming_protocol   VARCHAR(10) NOT NULL DEFAULT 'imap',
    imap_host           VARCHAR(255) NOT NULL DEFAULT 'imap.gmail.com',
    imap_port           INT NOT NULL DEFAULT 993,
    imap_use_ssl        TINYINT(1) NOT NULL DEFAULT 1,
    pop3_host           VARCHAR(255) NOT NULL DEFAULT 'pop.gmail.com',
    pop3_port           INT NOT NULL DEFAULT 995,
    pop3_use_ssl        TINYINT(1) NOT NULL DEFAULT 1,
    smtp_host           VARCHAR(255) NOT NULL DEFAULT 'smtp.gmail.com',
    smtp_port           INT NOT NULL DEFAULT 587,
    smtp_use_tls        TINYINT(1) NOT NULL DEFAULT 1,
    is_active           TINYINT(1) NOT NULL DEFAULT 0,
    last_tested_at      DATETIME NULL,
    last_test_ok        TINYINT(1) NULL,
    last_test_error     VARCHAR(500) NULL,
    created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by          BIGINT UNSIGNED NULL,
    updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    updated_by          BIGINT UNSIGNED NULL,
    CONSTRAINT fk_email_account_created_by FOREIGN KEY (created_by) REFERENCES users(id),
    CONSTRAINT fk_email_account_updated_by FOREIGN KEY (updated_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
