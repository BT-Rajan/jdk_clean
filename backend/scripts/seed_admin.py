#!/usr/bin/env python3
"""Idempotent bootstrap script.

Creates the first admin user and seeds the `number_series` rows that
orders/quotations need before either can be created -- `schema.sql`
intentionally ships with no data, and every user-management endpoint
requires an existing admin, so there's no way to create the first
account through the API itself.

Safe to re-run: skips anything that already exists rather than
overwriting it (an existing admin user or number series is left alone).

Usage:
    cd backend
    source venv/bin/activate
    python scripts/seed_admin.py --username admin --email admin@example.com \\
        --full-name "Administrator" --password "a-strong-password"

Reads DB connection settings the same way the app does (backend/.env),
via app.core.config.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

# Allow running as `python scripts/seed_admin.py` from the backend/ dir
# without needing the package installed.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import text  # noqa: E402

from app.core.database import SessionLocal  # noqa: E402
from app.core.security import hash_password  # noqa: E402

# Unused directly, but required: User.department is declared as a string
# relationship("Department") and only type-imports Department under
# TYPE_CHECKING (see app/models/user.py) to avoid a circular import.
# Querying User here without this import raises "expression 'Department'
# failed to locate a name" from SQLAlchemy's mapper configuration --
# the full app never hits this because some other router along the way
# always imports app.models.department first, but a standalone script
# that only touches User doesn't.
from app.models.department import Department  # noqa: E402, F401
from app.models.user import User  # noqa: E402

NUMBER_SERIES = [
    ("ORDER", "ORD", 1, 5),
    ("QUOTATION", "QTN", 1, 5),
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--username", default="admin", help="Admin username (default: admin)")
    parser.add_argument("--email", default="admin@example.com", help="Admin email")
    parser.add_argument("--full-name", default="Administrator", help="Admin full name")
    parser.add_argument("--password", required=True, help="Admin password (min 8 characters)")
    args = parser.parse_args()

    if len(args.password) < 8:
        parser.error("--password must be at least 8 characters")

    return args


def seed_admin_user(db, username: str, email: str, full_name: str, password: str) -> None:
    """Idempotent by *either* username or email -- not just username.
    A wrapper/installer that generates a fresh random username on every
    run (while pointing at the same fixed email, e.g. admin@jdk.com)
    would otherwise never match an existing row here, and the INSERT
    would fail on the database's own email-uniqueness constraint instead
    of being skipped cleanly. Checking both means re-running this script
    is safe regardless of which of the two callers happen to hold
    steady across runs.
    """
    existing = db.query(User).filter((User.username == username) | (User.email == email)).first()
    if existing:
        print(
            f"[skip] User already exists (username='{existing.username}', "
            f"email='{existing.email}') -- leaving it untouched."
        )
        return

    db.add(
        User(
            username=username,
            email=email,
            password_hash=hash_password(password),
            full_name=full_name,
            role="admin",
            is_active=True,
        )
    )
    print(f"[ok]   Created admin user '{username}'.")


def seed_number_series(db) -> None:
    for doc_type, prefix, next_number, padding in NUMBER_SERIES:
        existing = db.execute(
            text("SELECT id FROM number_series WHERE doc_type = :doc_type"),
            {"doc_type": doc_type},
        ).first()
        if existing:
            print(f"[skip] Number series '{doc_type}' already exists -- leaving it untouched.")
            continue

        db.execute(
            text(
                "INSERT INTO number_series (doc_type, prefix, next_number, padding) "
                "VALUES (:doc_type, :prefix, :next_number, :padding)"
            ),
            {"doc_type": doc_type, "prefix": prefix, "next_number": next_number, "padding": padding},
        )
        print(f"[ok]   Seeded number series '{doc_type}' (prefix {prefix}).")


def main() -> None:
    args = parse_args()

    db = SessionLocal()
    try:
        seed_admin_user(db, args.username, args.email, args.full_name, args.password)
        seed_number_series(db)
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
