from sqlalchemy import text
from sqlalchemy.orm import Session

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
