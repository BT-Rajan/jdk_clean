#!/usr/bin/env python3
"""Interactive password reset for an existing user.

Prompts for a username and a new password (masked, with confirmation),
hashes it the same way the API does (passlib/bcrypt via
app.core.security.hash_password), and writes it straight to the
database -- no running backend required.

Usage:
    cd backend
    source venv/bin/activate      (or venv\\Scripts\\activate on Windows)
    python scripts/reset_password.py

Reads DB connection settings the same way the app does (backend/.env),
via app.core.config.
"""

from __future__ import annotations

import sys
from getpass import getpass
from pathlib import Path

# Allow running as `python scripts/reset_password.py` from the backend/ dir
# without needing the package installed.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.core.database import SessionLocal  # noqa: E402
from app.core.security import hash_password  # noqa: E402

# Unused directly, but required -- see the matching comment in
# scripts/seed_admin.py: User.department is a string relationship() that
# needs app.models.department imported somewhere before mapper
# configuration, and this script (unlike the full app) doesn't otherwise
# import it.
from app.models.department import Department  # noqa: E402, F401
from app.models.user import User  # noqa: E402

MIN_PASSWORD_LENGTH = 8


def prompt_username(db) -> User:
    while True:
        username = input("Username: ").strip()
        if not username:
            continue

        user = db.query(User).filter(User.username == username, User.deleted_at.is_(None)).first()
        if user is None:
            print(f"[fail] No active user named '{username}'. Try again.")
            continue

        return user


def prompt_new_password() -> str:
    while True:
        password = getpass("New password: ")
        if len(password) < MIN_PASSWORD_LENGTH:
            print(f"[fail] Password must be at least {MIN_PASSWORD_LENGTH} characters.")
            continue

        confirm = getpass("Confirm new password: ")
        if password != confirm:
            print("[fail] Passwords did not match. Try again.")
            continue

        return password


def main() -> None:
    db = SessionLocal()
    try:
        user = prompt_username(db)

        if not user.is_active:
            print(f"[warn] '{user.username}' is currently deactivated -- resetting the password won't reactivate it.")

        password = prompt_new_password()

        user.password_hash = hash_password(password)
        db.commit()
        print(f"[ok]   Password updated for '{user.username}'.")
    except (KeyboardInterrupt, EOFError):
        db.rollback()
        print("\n[fail] Cancelled -- no changes made.")
        sys.exit(1)
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
