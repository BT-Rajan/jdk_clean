-- Personal + shared calendar. Every entry is always visible to its
-- creator; also visible to anyone @mentioned by username when it was
-- created/edited, or to every user when @all was used (all_users = 1).
-- See backend/app/services/calendar_service.py for the @-tag parsing,
-- visibility resolution, and ICS export.
--
-- A fresh install via schema.sql already has this -- this file is only
-- for upgrading an existing database.
--
-- Usage:
--   mysql -u <user> -p <database> < backend/migrations/2026-08-02_add_calendar_events.sql

CREATE TABLE IF NOT EXISTS calendar_events (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    event_date      DATE NOT NULL,
    title           VARCHAR(200) NOT NULL,
    notes           TEXT NULL,
    all_users       TINYINT(1) NOT NULL DEFAULT 0,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by      BIGINT UNSIGNED NOT NULL,
    updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    updated_by      BIGINT UNSIGNED NULL,
    deleted_at      DATETIME NULL,
    CONSTRAINT fk_cal_event_created_by FOREIGN KEY (created_by) REFERENCES users(id),
    CONSTRAINT fk_cal_event_updated_by FOREIGN KEY (updated_by) REFERENCES users(id),
    INDEX idx_cal_event_date (event_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS calendar_event_mentions (
    id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    event_id    BIGINT UNSIGNED NOT NULL,
    user_id     BIGINT UNSIGNED NOT NULL,
    CONSTRAINT fk_cal_mention_event FOREIGN KEY (event_id) REFERENCES calendar_events(id) ON DELETE CASCADE,
    CONSTRAINT fk_cal_mention_user FOREIGN KEY (user_id) REFERENCES users(id),
    UNIQUE KEY uq_cal_mention (event_id, user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
