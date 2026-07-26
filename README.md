# jdk_clean — Manufacturing ERP Backend

A FastAPI/SQLAlchemy/MySQL backend for a small manufacturing ERP: customers,
suppliers, raw materials, products, multi-level BOMs, inventory, quotations,
and orders — with role-based auth, soft deletes, and a field-level audit log.

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
   to create the first account through the API. Insert one directly:

   ```sql
   INSERT INTO users (username, email, password_hash, full_name, role, is_active)
   VALUES (
     'admin',
     'admin@example.com',
     '$2b$12$PyazmJDMEIf2xG5P0fAVv.yQD4oFcCpkC5v4EU/Z.LhHWOWgNATim', -- bcrypt hash of: ChangeMe123!
     'Administrator',
     'admin',
     1
   );
   ```

   This logs in with username `admin` / password `ChangeMe123!`. **Log in
   once and immediately change the password** (step 3 below covers this).

7. **Seed number series (required before creating orders/quotations)**

   Order and quotation numbers are generated from the `number_series`
   table, which also ships empty:

   ```sql
   INSERT INTO number_series (doc_type, prefix, next_number, padding) VALUES
     ('ORDER', 'ORD', 1, 5),
     ('QUOTATION', 'QTN', 1, 5);
   ```

8. **Run the server**

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
   { "username": "admin", "password": "ChangeMe123!" }
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
     -d '{"username": "admin", "password": "ChangeMe123!"}'
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
     -d '{"current_password": "ChangeMe123!", "new_password": "a-new-strong-password"}'

   curl -s -X POST http://localhost:8000/api/auth/logout \
     -H "Content-Type: application/json" \
     -d "{\"refresh_token\": \"$REFRESH\"}"
   ```

   Changing the password revokes all outstanding refresh tokens for that
   user, so log in again afterward to get a fresh token pair.

## Project layout

```
backend/
  app/
    api/        # FastAPI routers (one per resource)
    core/       # config, database session, security, exception handlers
    crud/       # generic CRUD engine + concrete master-data CRUD classes
    models/     # SQLAlchemy models
    schemas/    # Pydantic request/response schemas
    services/   # business logic (auth, orders, quotations, BOM, inventory, PDF)
  schema.sql    # MySQL schema (tables only — no seed data, see Installation)
  requirements.txt
```
