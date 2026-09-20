-- Removes the quotation 'sent' status. A quotation now stays 'draft' (open)
-- until the customer's answer is recorded -- accepted or rejected -- and
-- 'expired' is reached only by the scheduled scan of open quotations past
-- their valid_until. Emailing a quotation is unchanged and no longer has
-- any bearing on its status (see quotations.last_emailed_at).
--
-- Every quotation currently 'sent' is still awaiting the customer's
-- answer, so it becomes 'draft'; the enum is then narrowed.
--
-- Safe to re-run: the UPDATE matches nothing once no 'sent' rows remain,
-- and re-applying the same ENUM definition is a no-op.
--
-- A fresh install via schema.sql already has this change -- this file is
-- only for upgrading an existing database.
--
-- Usage:
--   mysql -u <user> -p <database> < backend/migrations/2026-10-09_remove_quotation_sent_status.sql

UPDATE quotations SET status = 'draft' WHERE status = 'sent';

ALTER TABLE quotations
    MODIFY COLUMN status ENUM('draft','accepted','rejected','expired','converted') NOT NULL DEFAULT 'draft';
