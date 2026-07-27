# jdk_clean — Backend

FastAPI/SQLAlchemy/MySQL backend for a small manufacturing ERP: customers,
suppliers, raw materials, products, multi-level BOMs, inventory, quotations,
and orders — with role-based auth, soft deletes, and a field-level audit log.

> Prefer the one-command path? See [`../install.sh`](../install.sh) and the
> [repo root README](../README.md) — it does everything below for you,
> interactively, for both the backend and frontend. What follows is the
> manual, step-by-step version.

## Requirements

- Python 3.11+
- MySQL 8.x
- pip

## Installation

1. **Clone and enter the backend directory**

   ```bash
   git clone https://github.com/BT-Rajan/jdk_clean.git
   cd jdk_clean/backend
   ```

2. **Create a virtual environment and install dependencies**

   ```bash
   python3 -m venv venv
   source venv/bin/activate        # Windows: venv\Scripts\activate
   pip install -r requirements.txt
   ```

3. **Create the database**

   ```sql
   CREATE DATABASE jdk_clean CHARACTER SET utf8mb4;
   CREATE USER 'erp_user'@'localhost' IDENTIFIED BY 'your-password';
   GRANT ALL PRIVILEGES ON jdk_clean.* TO 'erp_user'@'localhost';
   FLUSH PRIVILEGES;
   ```

4. **Load the schema**

   ```bash
   mysql -u erp_user -p jdk_clean < schema.sql
   ```

5. **Configure environment variables**

   Copy `.env.example` to `.env` and fill in your values:

   ```bash
   cp .env.example .env
   ```

   ```env
   DB_HOST=localhost
   DB_PORT=3306
   DB_USER=erp_user
   DB_PASSWORD=your-password
   DB_NAME=jdk_clean

   JWT_SECRET_KEY=replace-with-a-long-random-string
   ACCESS_TOKEN_EXPIRE_MINUTES=60
   REFRESH_TOKEN_EXPIRE_DAYS=7

   CORS_ORIGINS=http://localhost:5173
   ```

   Generate a strong `JWT_SECRET_KEY` with:

   ```bash
   python3 -c "import secrets; print(secrets.token_urlsafe(48))"
   ```

6. **Seed a bootstrap admin user**

   `schema.sql` only creates tables — it doesn't seed any rows, and every
   user-management endpoint requires an existing admin, so there's no way
   to create the first account through the API. Use the seed script
   (idempotent — safe to re-run, skips anything that already exists):

   ```bash
   python scripts/seed_admin.py \
     --username admin \
     --email admin@example.com \
     --full-name "Administrator" \
     --password "a-strong-password-min-8-chars"
   ```

   This also seeds the `number_series` rows (`ORDER`, `QUOTATION`) that
   are required before any order or quotation can be created — those
   ship empty too.

   **Log in once and immediately change the password** (see "Testing the
   login" below, or just use the frontend's "Change password" page).

   <details>
   <summary>Manual alternative (raw SQL, if you'd rather not run the script)</summary>

   ```sql
   INSERT INTO users (username, email, password_hash, full_name, role, is_active)
   VALUES ('admin', 'admin@example.com', '<bcrypt-hash-of-your-password>', 'Administrator', 'admin', 1);

   INSERT INTO number_series (doc_type, prefix, next_number, padding) VALUES
     ('ORDER', 'ORD', 1, 5),
     ('QUOTATION', 'QTN', 1, 5);
   ```

   Generate the bcrypt hash with:

   ```bash
   python3 -c "from app.core.security import hash_password; print(hash_password('your-password'))"
   ```

   </details>

7. **Run the server**

   ```bash
   uvicorn app.main:app --reload --port 8000
   ```

   The API is now at `http://localhost:8000`. Interactive docs (Swagger UI)
   are at `http://localhost:8000/docs`.

## Testing the login

### Option A — Swagger UI

1. Open `http://localhost:8000/docs`.
2. Expand `POST /api/auth/login` → **Try it out**.
3. Use the body:
   ```json
   { "username": "admin", "password": "your-strong-password" }
   ```
4. Execute. A `200` response returns `access_token`, `refresh_token`, and
   `token_type`. Copy `access_token`.
5. Click the **Authorize** button (top right), enter `Bearer <access_token>`,
   and click Authorize.
6. Expand `GET /api/auth/me` → **Try it out** → **Execute**. You should get
   back the admin user's profile (`200`), confirming the token is accepted.

### Option B — curl

1. **Health check** (no auth required):

   ```bash
   curl http://localhost:8000/api/health
   # {"status":"ok"}
   ```

2. **Log in:**

   ```bash
   curl -s -X POST http://localhost:8000/api/auth/login \
     -H "Content-Type: application/json" \
     -d '{"username": "admin", "password": "your-strong-password"}'
   ```

   Expected: `200` with a JSON body containing `access_token`,
   `refresh_token`, and `token_type: "bearer"`.

3. **Call an authenticated endpoint with the token:**

   ```bash
   TOKEN="paste-the-access_token-value-here"

   curl -s http://localhost:8000/api/auth/me \
     -H "Authorization: Bearer $TOKEN"
   ```

   Expected: `200` with the admin user's `id`, `username`, `email`,
   `full_name`, `role`, and `is_active`.

4. **Confirm a bad password is rejected:**

   ```bash
   curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:8000/api/auth/login \
     -H "Content-Type: application/json" \
     -d '{"username": "admin", "password": "wrong-password"}'
   ```

   Expected: `401`.

5. **Refresh the access token:**

   ```bash
   REFRESH="paste-the-refresh_token-value-here"

   curl -s -X POST http://localhost:8000/api/auth/refresh \
     -H "Content-Type: application/json" \
     -d "{\"refresh_token\": \"$REFRESH\"}"
   ```

   Expected: `200` with a **new** `access_token`/`refresh_token` pair. The
   refresh token you sent is now revoked (one-time use — reusing it will
   return `401`).

6. **Change the bootstrap password**, then log out:

   ```bash
   curl -s -X POST http://localhost:8000/api/auth/change-password \
     -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"current_password": "your-strong-password", "new_password": "an-even-stronger-password"}'

   curl -s -X POST http://localhost:8000/api/auth/logout \
     -H "Content-Type: application/json" \
     -d "{\"refresh_token\": \"$REFRESH\"}"
   ```

   Changing the password revokes all outstanding refresh tokens for that
   user, so log in again afterward to get a fresh token pair.

## Running with pm2

See the [repo root README](../README.md#running-with-pm2) — `../install.sh`
generates an `ecosystem.config.js` that runs this app as `uvicorn
app.main:app` from the venv, managed by pm2.

## Project layout

```
app/
  api/        # FastAPI routers (one per resource)
  core/       # config, database session, security, exception handlers
  crud/       # generic CRUD engine + concrete master-data CRUD classes
  models/     # SQLAlchemy models
  schemas/    # Pydantic request/response schemas
  services/   # business logic (auth, orders, quotations, BOM, inventory, PDF)
scripts/
  seed_admin.py   # idempotent bootstrap admin + number-series seeding
schema.sql    # MySQL schema (tables only — no seed data, see seed_admin.py)
requirements.txt
```
