#!/usr/bin/env python3
"""Applies every .sql file in backend/migrations/, in filename order.

Every migration in this project is written to be idempotent (guarded
via information_schema checks before altering anything, or INSERT
IGNORE for seed data), so this is always safe to re-run against a
database at any point in its life -- changes already applied are
skipped, not reapplied or duplicated. This exists so nobody has to
manually track which of the many migration files here have already
been run against a given database, or hunt through chat history for
individual files to run one at a time; if you're not sure what state
your database is in, just run this.

Usage:
    cd backend
    source venv/bin/activate      (or venv\\Scripts\\activate on Windows)
    python scripts/run_migrations.py

Reads DB connection settings the same way the app does (backend/.env),
via app.core.config.
"""

from __future__ import annotations

import sys
from pathlib import Path

# Allow running as `python scripts/run_migrations.py` from the backend/
# dir without needing the package installed.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import text  # noqa: E402

from app.core.database import engine  # noqa: E402

MIGRATIONS_DIR = Path(__file__).resolve().parent.parent / "migrations"


def split_statements(sql: str) -> list[str]:
    """Splits a .sql file into individual statements on top-level
    semicolons. Comments are stripped *before* splitting, not after --
    splitting first would treat a semicolon used as ordinary English
    punctuation inside a '--' comment (e.g. '-- is computed; every
    document...') as a statement separator, corrupting the following
    statement with leftover comment text. Good enough for this
    project's migrations specifically -- every one is written in the
    same plain style with no semicolons embedded inside actual SQL
    string literals -- even though this wouldn't be safe for arbitrary
    SQL in general.
    """
    lines = [ln for ln in sql.splitlines() if not ln.strip().startswith("--")]
    without_comments = "\n".join(lines)
    return [stmt.strip() for stmt in without_comments.split(";") if stmt.strip()]


def main() -> None:
    files = sorted(MIGRATIONS_DIR.glob("*.sql"))
    if not files:
        print("[info] No migration files found in", MIGRATIONS_DIR)
        return

    applied = 0
    with engine.connect() as conn:
        for path in files:
            print(f"==> {path.name}")
            statements = split_statements(path.read_text())
            trans = conn.begin()
            try:
                for stmt in statements:
                    result = conn.execute(text(stmt))
                    # The guarded migrations emit a 'SELECT ... AS status'
                    # informational row when a change is skipped because
                    # it's already applied -- surface that instead of
                    # silently discarding it.
                    if stmt.strip().upper().startswith("SELECT"):
                        try:
                            row = result.fetchone()
                            if row:
                                print(f"    {row[0]}")
                        except Exception:
                            pass
                trans.commit()
                applied += 1
            except Exception as exc:
                trans.rollback()
                print(f"[fail] {path.name}: {exc}")
                print(
                    "       Stopping here -- fix the issue above and re-run. "
                    "Files applied before this one are unaffected and won't be reapplied."
                )
                sys.exit(1)

    print(f"[ok]   Applied {applied}/{len(files)} migration file(s).")


if __name__ == "__main__":
    main()
