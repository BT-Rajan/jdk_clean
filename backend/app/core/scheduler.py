"""The scan-stale/scan-overdue/scan-expired endpoints (feasibility,
orders, purchase orders, quotations) were built assuming an external
cron would hit them periodically. In practice that cron was never
guaranteed to be set up, which meant the admin-review/notification
signals those checks feed were quietly inert. This runs the same checks
from inside the app itself instead, so they work out of the box with no
external scheduling infrastructure required.

Deliberately not a new dependency (no APScheduler etc.) -- just an
asyncio task started at app startup that loops forever, sleeping between
runs. Simple, dependency-free, and sufficient for a single always-on
backend process. If this ever runs as multiple replicas behind a load
balancer, each replica would run its own loop -- harmless here since
every escalation function is idempotent (re-running only (re)flags
records that still qualify), just redundant work, not a correctness
issue.
"""

import asyncio
import logging

from app.core.database import SessionLocal

logger = logging.getLogger(__name__)

# Every 6 hours is frequent enough that nothing sits unflagged for long,
# without hammering the database on a schedule this coarse-grained.
INTERVAL_SECONDS = 6 * 60 * 60


def _run_all_scans() -> None:
    """One pass of every escalation check, each isolated so one failing
    doesn't stop the others. Imports are local to avoid this module
    being part of any service's own import chain."""
    from app.services import feasibility_service, order_service, purchase_order_service, quotation_service

    db = SessionLocal()
    try:
        checks = (
            ("stale feasibility checks", feasibility_service.escalate_stale_feasibility_checks),
            ("overdue orders", order_service.escalate_overdue_orders),
            ("overdue purchase orders", purchase_order_service.escalate_overdue_purchase_orders),
            ("expired quotations", quotation_service.escalate_expired_quotations),
        )
        for label, fn in checks:
            try:
                flagged = fn(db)
                if flagged:
                    logger.info("Scheduled scan: %d %s flagged.", len(flagged), label)
            except Exception:
                logger.exception("Scheduled scan for %s failed.", label)
    finally:
        db.close()


async def _loop() -> None:
    while True:
        try:
            await asyncio.to_thread(_run_all_scans)
        except Exception:
            logger.exception("Scheduled scan loop iteration failed.")
        await asyncio.sleep(INTERVAL_SECONDS)


def start() -> asyncio.Task:
    """Called once from main.py's lifespan handler. Runs immediately (not
    after waiting a full interval) so the checks are useful even on a
    freshly (re)started backend, then repeats every INTERVAL_SECONDS."""
    return asyncio.create_task(_loop())
