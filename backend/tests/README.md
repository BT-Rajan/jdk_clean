# Backend test suite

These tests run against a real MySQL/MariaDB database using the app's
own SQLAlchemy session machinery (`app.core.database`) -- not SQLite,
not a mock. The calculations under test (BOM explosion, feasibility,
capacity scanning) rely on real schema (MySQL `ENUM`s, `DECIMAL`
precision, the `number_series` atomic-counter table, `SELECT ... FOR
UPDATE` locking) that a SQLite stand-in wouldn't faithfully reproduce,
and this project has no other database layer to test against.

Pure-calculation logic that doesn't touch the database (date arithmetic,
greedy allocation math) is exercised indirectly through the same
integration tests below rather than duplicated as separate mocked unit
tests -- see each test file's module docstring for what it covers.

## One-time setup

1. Create a dedicated test database and user (never point this at a
   real/production database -- tests create and roll back real rows):

   ```sql
   CREATE DATABASE jdk_clean_test CHARACTER SET utf8mb4;
   CREATE USER 'erp_test'@'127.0.0.1' IDENTIFIED BY '<pick a password>';
   GRANT ALL PRIVILEGES ON jdk_clean_test.* TO 'erp_test'@'127.0.0.1';
   FLUSH PRIVILEGES;
   ```

2. Load the schema (same file used for a fresh app install):

   ```bash
   mysql -u erp_test -p jdk_clean_test < schema.sql
   ```

3. Install test dependencies:

   ```bash
   pip install -r requirements.txt -r requirements-dev.txt
   ```

## Running

Point the app's usual `DB_*` environment variables (see
`app/core/config.py`) at the test database, then run pytest from
`backend/`:

```bash
DB_HOST=127.0.0.1 DB_PORT=3306 DB_USER=erp_test DB_PASSWORD=<your password> DB_NAME=jdk_clean_test \
  python3 -m pytest
```

(Or put the same values in `backend/.env` if you keep a dedicated one
for test runs -- `app/core/config.py` already reads `.env` via
pydantic-settings, nothing test-specific needed there.)

## Isolation

Every test gets its own database transaction (see `conftest.py`'s `db`
fixture) that's rolled back when the test ends -- including whatever
the application code itself commits internally (`run_check`,
`adjust_stock`, etc. all call `db.commit()` as part of normal
operation). This is the standard SQLAlchemy "join a session to an
external transaction" recipe: nothing a test creates is left behind for
the next one, and tests can run in any order.

## Factories

`factories.py` has small helpers (`make_raw_material`, `make_product`,
`make_bom`, ...) that create the minimum valid row for each model, with
a unique code auto-generated per call so tests can create as many as
they need without colliding. They call the ORM models directly, not the
service/CRUD layer, to keep test setup fast and independent of
validation rules that belong to *other* features (e.g. BOM-creation
business rules aren't what `test_bom_service.py` is testing).
