"""Shared pytest fixtures for the backend test suite.

See tests/README.md for one-time test-database setup. In short: these
tests run against a real MySQL/MariaDB database via the app's own
app.core.database engine -- the same schema.sql a fresh install uses --
not a mock and not SQLite.
"""

import pytest
from sqlalchemy import event
from sqlalchemy.orm import Session

# Importing app.main (rather than just app.core.database) pulls in
# every API router, and transitively every service and model, before
# any test runs. SQLAlchemy resolves relationship() string references
# (e.g. User -> Department) lazily against whatever's been imported so
# far -- without this, factories.py building a Product or RawMaterial
# in isolation fails to configure its mapper the moment anything
# reachable from it references a model this test file never imported
# directly. The running app gets this for free by importing every
# router at startup; tests need the same guarantee explicitly.
import app.main  # noqa: F401,E402
from app.core.database import engine


@pytest.fixture()
def db() -> Session:
    """A session bound to one connection, wrapped in an outer transaction
    that's rolled back when the test ends -- the standard SQLAlchemy
    "join a session into an external transaction" recipe.

    Application code under test (feasibility_service.run_check,
    inventory_service.adjust_stock, production_service.create_batch, ...)
    calls session.commit() as part of its normal operation. Under a plain
    session that would end our outer transaction early and start leaking
    rows between tests. The fix: whenever the session's own transaction
    ends (including via that internal commit), immediately open a new
    SAVEPOINT nested inside the outer transaction -- so from the
    application code's point of view "commit" just releases a savepoint,
    and the *outer* transaction (and everything done under it) is only
    ever rolled back here, in teardown.
    """
    connection = engine.connect()
    outer_transaction = connection.begin()
    session = Session(bind=connection)

    nested = connection.begin_nested()

    @event.listens_for(session, "after_transaction_end")
    def _restart_savepoint(sess, trans):
        nonlocal nested
        if not nested.is_active:
            nested = connection.begin_nested()

    try:
        yield session
    finally:
        session.close()
        outer_transaction.rollback()
        connection.close()
