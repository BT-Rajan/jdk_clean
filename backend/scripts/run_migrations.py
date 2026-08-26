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

The actual apply logic lives in app.core.migrations, shared with the
app's own startup lifespan (see app/main.py) so a fresh deploy applies
its own new migrations automatically -- this script remains for
running them by hand (e.g. ahead of a deploy, or to inspect output).

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

from app.core.database import engine  # noqa: E402
from app.core.migrations import MIGRATIONS_DIR, apply_all  # noqa: E402


def main() -> None:
    files = sorted(MIGRATIONS_DIR.glob("*.sql"))
    if not files:
        print("[info] No migration files found in", MIGRATIONS_DIR)
        return

    last_file = {"name": None}

    def on_file(name: str) -> None:
        last_file["name"] = name
        print(f"==> {name}")

    def on_notice(message: str) -> None:
        print(f"    {message}")

    try:
        applied = apply_all(engine, on_file=on_file, on_notice=on_notice)
    except Exception as exc:
        print(f"[fail] {last_file['name']}: {exc}")
        print(
            "       Stopping here -- fix the issue above and re-run. "
            "Files applied before this one are unaffected and won't be reapplied."
        )
        sys.exit(1)

    print(f"[ok]   Applied {applied}/{len(files)} migration file(s).")


if __name__ == "__main__":
    main()
