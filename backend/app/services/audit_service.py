from datetime import date

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.exceptions import ValidationAppError

IGNORED_FIELDS = {"updated_at", "created_at"}


def log_create(db: Session, table_name: str, record_id: int, user_id: int | None) -> None:
    db.execute(
        text(
            """INSERT INTO audit_log (table_name, record_id, action, changed_by)
               VALUES (:t, :r, 'CREATE', :u)"""
        ),
        {"t": table_name, "r": record_id, "u": user_id},
    )


def log_update(
    db: Session,
    table_name: str,
    record_id: int,
    changes: dict[str, tuple],
    user_id: int | None,
) -> None:
    """changes: {field_name: (old_value, new_value)} — only fields that actually changed."""
    rows = [
        {
            "t": table_name,
            "r": record_id,
            "f": field,
            "old": str(old) if old is not None else None,
            "new": str(new) if new is not None else None,
            "u": user_id,
        }
        for field, (old, new) in changes.items()
        if field not in IGNORED_FIELDS and old != new
    ]
    if not rows:
        return
    db.execute(
        text(
            """INSERT INTO audit_log (table_name, record_id, action, field_name, old_value, new_value, changed_by)
               VALUES (:t, :r, 'UPDATE', :f, :old, :new, :u)"""
        ),
        rows,
    )


def log_delete(db: Session, table_name: str, record_id: int, user_id: int | None) -> None:
    db.execute(
        text(
            """INSERT INTO audit_log (table_name, record_id, action, changed_by)
               VALUES (:t, :r, 'DELETE', :u)"""
        ),
        {"t": table_name, "r": record_id, "u": user_id},
    )


def log_restore(db: Session, table_name: str, record_id: int, user_id: int | None) -> None:
    db.execute(
        text(
            """INSERT INTO audit_log (table_name, record_id, action, changed_by)
               VALUES (:t, :r, 'RESTORE', :u)"""
        ),
        {"t": table_name, "r": record_id, "u": user_id},
    )


def get_history(db: Session, table_name: str, record_id: int) -> list[dict]:
    """Every module's history endpoint (12 of them -- see api/common.py's
    generic CRUD router, plus orders/quotations/feasibility/production/
    delivery-notes/purchase-orders/users' own) calls this one function,
    so resolving changed_by to a real name here is a single change that
    benefits all of them at once, rather than editing each endpoint.
    """
    result = db.execute(
        text(
            """SELECT action, field_name, old_value, new_value, changed_by, changed_at
               FROM audit_log WHERE table_name = :t AND record_id = :r
               ORDER BY changed_at DESC, id DESC"""
        ),
        {"t": table_name, "r": record_id},
    )
    rows = [dict(row._mapping) for row in result]

    user_ids = {row["changed_by"] for row in rows if row["changed_by"] is not None}
    names: dict[int, str] = {}
    if user_ids:
        # Local import: audit_service is imported by nearly every other
        # service, so importing the User model at module level here would
        # risk a circular import depending on load order.
        from app.models.user import User

        for user_id, full_name in (
            db.query(User.id, User.full_name).filter(User.id.in_(user_ids)).all()
        ):
            names[user_id] = full_name

    for row in rows:
        row["changed_by_name"] = names.get(row["changed_by"])

    return rows


def get_my_history(db: Session, user_id: int, month: str | None = None) -> list[dict]:
    """Every action this user has personally made (audit_log.changed_by),
    across every table, restricted to one calendar month -- unlike
    get_history above (one record's full trail, any actor), this is one
    actor's full trail, scoped to a month so it can't grow unbounded.
    `month` is "YYYY-MM"; omitted defaults to the current calendar
    month. Backs GET /api/auth/me/history, the mobile app's own
    "History" drawer link -- each user can only ever see their own."""
    if month is not None:
        try:
            year_str, month_str = month.split("-")
            year, mon = int(year_str), int(month_str)
            if not (1 <= mon <= 12):
                raise ValueError
        except ValueError:
            raise ValidationAppError("month must be in YYYY-MM format.")
    else:
        today = date.today()
        year, mon = today.year, today.month

    start = date(year, mon, 1)
    end = date(year + 1, 1, 1) if mon == 12 else date(year, mon + 1, 1)

    result = db.execute(
        text(
            """SELECT table_name, record_id, action, field_name, old_value, new_value, changed_at
               FROM audit_log
               WHERE changed_by = :u AND changed_at >= :start AND changed_at < :end
               ORDER BY changed_at DESC, id DESC
               LIMIT 500"""
        ),
        {"u": user_id, "start": start, "end": end},
    )
    return [dict(row._mapping) for row in result]
