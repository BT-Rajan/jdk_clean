"""Shared logic for applying backend/migrations/*.sql files, in filename
order, against the app's database.

Used by two callers:
- scripts/run_migrations.py, for applying migrations by hand.
- app.main's startup lifespan, so a fresh deploy's new columns/tables
  exist before the app starts serving requests. Without this, deploying
  code that references a new column ahead of running its migration by
  hand shows up as a confusing 500 on the first request that touches it
  (e.g. "Unknown column 'products.tags'") instead of failing loudly at
  start-up, where it's obvious what's wrong and the process never comes
  up serving broken queries in the first place.

Every migration file here is written to be idempotent (guarded via
information_schema checks before altering anything, or INSERT IGNORE
for seed data), so calling apply_all repeatedly -- once per process
start, on every deploy -- is always safe: changes already applied are
skipped, not reapplied or duplicated.
"""

from __future__ import annotations

from collections.abc import Callable
from pathlib import Path

from sqlalchemy import text
from sqlalchemy.engine import Engine

MIGRATIONS_DIR = Path(__file__).resolve().parent.parent.parent / "migrations"


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


def apply_all(
    engine: Engine,
    *,
    on_file: Callable[[str], None] | None = None,
    on_notice: Callable[[str], None] | None = None,
) -> int:
    """Applies every migration file in MIGRATIONS_DIR, in filename order.

    Stops and re-raises on the first failure -- files applied before that
    point are committed and won't be reapplied on a later call, since each
    is independently idempotent. `on_file` and `on_notice`, if given, are
    called with each file name before it runs and with each informational
    'status' row a guarded migration emits when it skips an already-applied
    change -- callers use these for progress output/logging; the exception
    itself (not a return value) is how a failure is signaled.

    Returns the number of files applied.
    """
    files = sorted(MIGRATIONS_DIR.glob("*.sql"))
    applied = 0
    with engine.connect() as conn:
        for path in files:
            if on_file:
                on_file(path.name)
            statements = split_statements(path.read_text())
            trans = conn.begin()
            try:
                for stmt in statements:
                    result = conn.execute(text(stmt))
                    if stmt.strip().upper().startswith("SELECT"):
                        try:
                            row = result.fetchone()
                            if row and on_notice:
                                on_notice(str(row[0]))
                        except Exception:
                            pass
                trans.commit()
                applied += 1
            except Exception:
                trans.rollback()
                raise
    return applied
