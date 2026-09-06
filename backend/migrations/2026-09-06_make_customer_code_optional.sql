-- Relaxes customers.code (the Civil ID / Registration number, asked as
-- the onboarding wizard's first question -- see models/customer.py) from
-- required to optional, so a customer record can exist for a prospect
-- who hasn't provided that ID yet -- e.g. a feasibility check or
-- quotation raised for someone new, not yet formally onboarded. The
-- UNIQUE constraint stays: MySQL/InnoDB allows any number of NULLs in a
-- UNIQUE column (NULL is never equal to NULL), so this only stops
-- actual duplicate real IDs, never blocks two prospects both lacking one
-- yet. code remains locked once set (see schemas/customer.py
-- CustomerUpdate) -- this only ever moves it from NULL to a real value,
-- never changes an existing one.
--
-- A fresh install via schema.sql already has this -- this file is only
-- for upgrading an existing database. Safe to re-run.
--
-- Usage:
--   mysql -u <user> -p <database> < backend/migrations/2026-09-06_make_customer_code_optional.sql

ALTER TABLE customers MODIFY COLUMN code VARCHAR(30) NULL;
