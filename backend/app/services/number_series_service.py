from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.exceptions import AppError


def next_number(db: Session, doc_type: str) -> str:
    """Atomically claim the next number for a document type, e.g. 'ORD-00001'.

    Uses SELECT ... FOR UPDATE inside the caller's transaction so concurrent
    requests never receive the same number.
    """
    row = db.execute(
        text(
            "SELECT prefix, next_number, padding FROM number_series "
            "WHERE doc_type = :doc_type FOR UPDATE"
        ),
        {"doc_type": doc_type},
    ).first()

    if row is None:
        raise AppError(f"No number series configured for '{doc_type}'.")

    prefix, current, padding = row.prefix, row.next_number, row.padding

    db.execute(
        text("UPDATE number_series SET next_number = next_number + 1 WHERE doc_type = :doc_type"),
        {"doc_type": doc_type},
    )

    return f"{prefix}-{str(current).zfill(padding)}"
