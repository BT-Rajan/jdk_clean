# P11 — Production Readiness: Backup/Recovery & Known Limitations

This is the P11 final-hardening pass's documentation deliverable (spec
section 22 and 27). It does not restate what's already covered in
`docs/production-lifecycle.md` (target architecture, status models),
`docs/production-inventory-integration.md` (BOM/MRP/inventory rules), or
`docs/production-audit.md` (the P2-era capability audit) — see those for
business rules and lifecycle detail. This file covers the two things P11
specifically asks for that weren't written down anywhere yet: backup/
recovery readiness, and an honest list of what P11 found but deliberately
did not fix.

## 1. Database Backup & Recovery

JDK's only stateful store is the MySQL/MariaDB database configured via
`DB_HOST`/`DB_PORT`/`DB_USER`/`DB_PASSWORD`/`DB_NAME` (see
`backend/app/core/config.py` and `backend/.env.example`). Everything else
(uploaded files under `UPLOAD_DIR`, the `.env` itself) is covered below.
JDK does not implement its own backup mechanism by design (spec: "do not
build a backup platform inside JDK") — use the database server's own
standard tooling.

**If the deployment already runs on managed infrastructure** (a managed
MySQL/MariaDB instance, a cloud database service, an existing ops/backup
policy) — use that platform's built-in automated backups and point-in-time
restore instead of the manual procedure below, and just confirm: backup
frequency meets the business's acceptable data-loss window, and someone
has actually performed a test restore at least once.

**Manual procedure** (self-hosted MySQL/MariaDB, no managed backup layer):

- **Backup**: a nightly `mysqldump --single-transaction --routines
  --triggers <DB_NAME>` (the `--single-transaction` flag gives a
  consistent snapshot under InnoDB without locking tables, which this
  app relies on for its own row-locking during business hours) to a file
  named with the date, retained on a rolling window (e.g. 14 daily + 8
  weekly). For a factory that can't tolerate losing a day's transactions,
  additionally enable MySQL/MariaDB binary logging (`log_bin`) for
  point-in-time recovery between dumps.
- **Frequency**: nightly full dump at minimum, matching this app's actual
  transaction volume (a manufacturing ERP, not a high-frequency system) --
  increase to hourly binlog flushing if the factory decides a day of lost
  transactions is unacceptable.
- **Where**: backups must land somewhere that survives the loss of the
  database server itself (a separate disk, off-host storage, or object
  storage) — a backup sitting next to the live database is not a backup.
- **Configuration/secrets recovery**: `backend/.env` (DB credentials,
  `JWT_SECRET_KEY`, CORS origins) and any TLS/reverse-proxy config are not
  in the database and are not covered by a DB backup — keep a copy in
  whatever secrets store the deployment already uses (a password manager,
  a secrets manager, or at minimum an encrypted offline copy), separate
  from the application server.
- **Uploaded files**: `UPLOAD_DIR` (avatars, attachments) is on local
  disk, not in the database — back it up on the same schedule as the
  database, or move it to object storage if the deployment already uses
  one.
- **Restore procedure**:
  1. Provision a fresh MySQL/MariaDB instance (or stop writes to the
     existing one).
  2. `mysql <DB_NAME> < backup.sql` to restore the dump (plus binlog
     replay, if used, for point-in-time recovery beyond the dump).
  3. Restore `UPLOAD_DIR` from its own backup.
  4. Restore `.env`/secrets from the secrets store.
  5. Point the backend at the restored database and start it.
- **Verifying a restored database**: after restoring, confirm the
  application is actually usable against it, not just that the restore
  command exited successfully:
  - `GET /api/health` returns `{"status": "ok"}`.
  - Log in as an existing user and open a recent Order, Production Order,
    and Delivery Note — confirm their line items and status are present
    and match what's expected as of the backup's timestamp.
  - Run `GET /api/reconciliation/exceptions` (the P10 reconciliation
    view) against the restored database — a healthy restore should show
    the same (ideally empty) exception list it showed before the backup
    was taken, not a sudden pile of new discrepancies (which would
    indicate a partial or corrupted restore).

## 2. Known Limitations (P2/P3 — deliberately not fixed in P11)

Per the P11 spec's own instruction ("fix if straightforward, otherwise
document" for P2, "do not implement merely because it was discovered"
for P3), these were found during the P11 audit and are intentionally left
as-is:

- **`payment_service.delete_payment` / `payment_plan_service.
  delete_payment_plan`** soft-delete a payment/payment-plan row with no
  precondition check on whether it's already been used in reconciliation
  — consistent with this module's own documented "delete-and-recreate
  instead of edit" ledger stance, and the row/audit history is never
  actually destroyed (soft-delete only), so this is a P2 convention gap,
  not a data-integrity risk.
- **Packaging stock is never auto-deducted** at production completion or
  at delivery (documented since the P2-era `docs/production-audit.md`
  capability audit, and still true) — packaging composition is defined
  and CRUD-able, but consuming it against stock was out of scope for
  every pass through P11. A future pass should decide where in the
  chain (completion, delivery, or both) this belongs before wiring it.
- **A duplicate `create_production_order` call** against the same demand
  (same `order_detail_id`/`planned_quantity`, submitted twice) can create
  two separate Production Order records if both fit under the order
  line's remaining committable quantity — each one is independently and
  correctly guarded from there (allocation/execution/consumption cannot
  double-count), so the net effect of a double-click here is an extra
  Production Order to manually cancel, not silent data corruption. A
  frontend double-submit guard is the appropriate fix if this proves to
  be a real nuisance in practice, not a new server-side idempotency
  mechanism.
- **`POST /api/inventory/adjust`** (the free-form manual stock adjustment
  endpoint) has no duplicate-submission protection — this is an
  intentional, undocumented-reference, journal-style manual entry (per
  its own service docstring), analogous to a manual stock-count
  correction a warehouse admin performs deliberately, not a document-
  driven workflow where retry-safety is expected.

Nothing above blocks day-to-day factory operation; each is either a
convention inconsistency with no real-world corruption path, or an
explicitly out-of-scope capability already known before this pass.

## 3. Kuwait Time

Restated here only as a pointer, since P11 section 16 explicitly asks
for it to be documented: the business timezone is `Asia/Kuwait`
(`backend/app/core/timezone.py`'s `KUWAIT_TZ`), and every business-
authoritative date/time (order dates, due dates, schedule/QC/delivery
dates, audit timestamps) is computed server-side via `today_kuwait()`/
`now_kuwait_naive()` — never trusted from the browser or a client-
supplied value. Verified with no violations during the P11 audit (one
unrelated, non-business-authoritative model field was corrected for
consistency — `DepartmentPermission.updated_at`).
