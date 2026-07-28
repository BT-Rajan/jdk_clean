#!/usr/bin/env python3
"""Interactive creation of a new user account.

Prompts for a username, email, full name, role, and a password (masked,
with confirmation), validates each the same way the API does
(backend/app/schemas/user.py:UserCreate), hashes the password
(passlib/bcrypt via app.core.security.hash_password), and writes the
new user straight to the database -- no running backend required.

Usage:
    cd backend
    source venv/bin/activate      (or venv\\Scripts\\activate on Windows)
    python scripts/create_user.py

Reads DB connection settings the same way the app does (backend/.env),
via app.core.config. For the very first admin account, use
seed_admin.py instead -- it also seeds the number series every
order/quotation needs.
"""

from __future__ import annotations

import sys
from getpass import getpass
from pathlib import Path

# Allow running as `python scripts/create_user.py` from the backend/ dir
# without needing the package installed.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from email_validator import EmailNotValidError, validate_email  # noqa: E402

from app.core.database import SessionLocal  # noqa: E402
from app.core.security import hash_password  # noqa: E402
from app.models.user import User  # noqa: E402

MIN_PASSWORD_LENGTH = 8
VALID_ROLES = ("admin", "manager", "staff", "viewer")
DEFAULT_ROLE = "staff"


def prompt_username(db) -> str:
    while True:
        username = input("Username (3-50 characters): ").strip()
        if not (3 <= len(username) <= 50):
            print("[fail] Username must be 3-50 characters.")
            continue

        existing = db.query(User).filter(User.username == username).first()
        if existing:
            print(f"[fail] Username '{username}' is already taken.")
            continue

        return username


def prompt_email(db) -> str:
    while True:
        email = input("Email: ").strip()
        try:
            # check_deliverability=False matches pydantic's EmailStr, which
            # validates format only (no MX lookup) -- see
            # backend/app/schemas/user.py:UserCreate. Keeping this script's
            # rules identical to the API's avoids rejecting something the
            # API would accept, or vice versa.
            validate_email(email, check_deliverability=False)
        except EmailNotValidError as exc:
            print(f"[fail] {exc}")
            continue

        existing = db.query(User).filter(User.email == email).first()
        if existing:
            print(f"[fail] Email '{email}' is already in use.")
            continue

        return email


def prompt_full_name() -> str:
    while True:
        full_name = input("Full name: ").strip()
        if not (1 <= len(full_name) <= 120):
            print("[fail] Full name must be 1-120 characters.")
            continue
        return full_name


def prompt_role() -> str:
    while True:
        raw = input(f"Role {VALID_ROLES} [{DEFAULT_ROLE}]: ").strip().lower()
        role = raw or DEFAULT_ROLE
        if role not in VALID_ROLES:
            print(f"[fail] Role must be one of {VALID_ROLES}.")
            continue
        return role


def prompt_new_password() -> str:
    while True:
        password = getpass("Password: ")
        if len(password) < MIN_PASSWORD_LENGTH:
            print(f"[fail] Password must be at least {MIN_PASSWORD_LENGTH} characters.")
            continue

        confirm = getpass("Confirm password: ")
        if password != confirm:
            print("[fail] Passwords did not match. Try again.")
            continue

        return password


def main() -> None:
    db = SessionLocal()
    try:
        username = prompt_username(db)
        email = prompt_email(db)
        full_name = prompt_full_name()
        role = prompt_role()
        password = prompt_new_password()

        db.add(
            User(
                username=username,
                email=email,
                password_hash=hash_password(password),
                full_name=full_name,
                role=role,
                is_active=True,
            )
        )
        db.commit()
        print(f"[ok]   Created user '{username}' ({role}).")
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
