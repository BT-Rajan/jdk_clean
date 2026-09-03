# jdk_clean — Manufacturing ERP

A FastAPI/SQLAlchemy/MySQL backend and a React/TypeScript frontend for a
small manufacturing ERP: customers, suppliers, raw materials, products,
multi-level BOMs, inventory, quotations, and orders — with role-based
auth, soft deletes, and a field-level audit log.

- `backend/` — FastAPI API. See [backend/README.md](backend/README.md).
- `frontend/` — React app (currently: authentication end to end — login,
  session handling, protected routes, password change). See
  [frontend/README.md](frontend/README.md).

## Quick start

```bash
git clone https://github.com/BT-Rajan/jdk_clean.git
cd jdk_clean
./install.sh
```

On Windows, use `install.bat` instead (same prompts, same result):

```bat
git clone https://github.com/BT-Rajan/jdk_clean.git
cd jdk_clean
install.bat
```

`install.sh`/`install.bat` are interactive: they ask for your database
connection, generate a JWT secret (or take your own), set up the backend
venv and frontend `node_modules`, load the schema, seed a bootstrap admin
account, build the frontend, and (if you say yes) start both under
[pm2](https://pm2.keymetrics.io/). They're safe to re-run — anything that
already exists (a `.env` file, an admin user, the schema) is left alone
unless you explicitly ask to overwrite it.

Requirements: Python 3.11+, Node.js 20+, MySQL 8.x, and the MySQL client
(`mysql`) if you want the script to create the database/load the schema
for you. On Windows, `install.bat` also uses PowerShell (present by
default on Windows 10/11) to mask password input.

At the end it prints the admin username/password (if generated) and the
URLs for both apps. **Log in and change that password immediately** —
there's a "Change password" page built into the frontend for exactly
this.

## Manual setup

If you'd rather do it by hand or understand each step, see:

- [backend/README.md](backend/README.md) — venv, schema, `.env`, seeding, running
- [frontend/README.md](frontend/README.md) — `.env`, dev server, production build/serving

## Running with pm2

`install.sh` generates `ecosystem.config.js` at the repo root (not
committed — it's environment-specific: ports, URLs). It defines a
single pm2 service, **jdk**, running `scripts/run-all.mjs` — a small
launcher that starts both the backend and frontend as its own direct
child processes and forwards their output (prefixed `[backend]`/
`[frontend]`) and shutdown signals, so the pair is managed, restarted,
and logged as one unit rather than two separate pm2 apps:

- **backend** — `uvicorn app.main:app` from the backend venv
- **frontend** — `frontend/scripts/serve-static.mjs`, a small
  dependency-free static file server (gzip, immutable caching on
  hashed assets, SPA fallback, security headers including a CSP) —
  see [frontend/README.md](frontend/README.md#deploying) for why this
  exists instead of a third-party static-server package.

If either child process dies unexpectedly, the launcher stops the
other one too and exits non-zero, so pm2's autorestart brings the pair
back up together instead of leaving one half running alone.

```bash
pm2 status              # check the service
pm2 logs jdk            # tail logs (both backend and frontend, prefixed)
pm2 restart jdk         # restart
pm2 stop jdk            # stop
pm2 save                # persist the current process list
pm2 startup             # (optional, Linux/macOS) print the command to auto-start pm2 on boot
```

`install.sh` re-run on an existing install asks once, up front, whether
to reuse the existing `backend/.env`, `frontend/.env`, and
`ecosystem.config.js` as-is — if so, every database/port/secret
question is skipped and the existing ports are read straight out of
`ecosystem.config.js`. Database migrations always run on every
install/re-run (idempotent), and once pm2 starts the service the
script waits for and health-checks both the backend and frontend
before declaring success.

> `install.bat` (Windows) hasn't been updated to this single-service
> model yet — it still generates two separate pm2 apps, **jdk-backend**
> and **jdk-frontend**, with `pm2 logs jdk-backend`/`pm2 logs
> jdk-frontend` and `pm2 restart all`/`pm2 stop all` to manage them.
> `./relaunch.sh` (below) only understands the single-service layout.

If you didn't generate `ecosystem.config.js` via `install.sh`, you can
start each app manually — see the "Run the server" sections in each
app's README — and skip pm2 entirely.

### Relaunching cleanly

`pm2 restart all` is fine day to day, but a full stop/start after
config changes (a new server IP, a rebuilt frontend, a fresh
`.env`) is where things tend to go wrong -- a stray process from an
earlier run still squatting on the port, the frontend's backend URL
having drifted out of sync between `.env` and the build, that kind of
thing. `./relaunch.sh` (repo root) checks for exactly that class of
problem before and after restarting, and prints a plain pass/fail
report instead of leaving you to read pm2 logs:

```bash
./relaunch.sh
```

It checks: `frontend/.env`'s `VITE_API_BASE_URL` against
`ecosystem.config.js`'s own copy of it (the static server prefers the
latter at runtime -- see `frontend/scripts/serve-static.mjs`), whether
`frontend/dist/` is older than `.env` (a sign it needs rebuilding),
whether `backend/.env`'s `CORS_ORIGINS` actually covers the frontend's
real origin, whether anything other than the real `jdk` pm2 service's
own backend/frontend child processes is holding either port, and
finally does a live health check against both once restarted -- not
just trusting that pm2 says "online."

## Testing the login

See [backend/README.md](backend/README.md#testing-the-login) for a full
Swagger UI / curl walkthrough of the auth flow (login, `/me`, refresh
rotation, password change), or just open the frontend and sign in.

## Project layout

```
install.sh               # interactive installer, Linux/macOS (backend + frontend + pm2)
install.bat               # interactive installer, Windows (same, via cmd.exe)
ecosystem.config.js       # generated by install.sh/install.bat, not committed

backend/
  app/
    api/        # FastAPI routers (one per resource)
    core/       # config, database session, security, exception handlers
    crud/       # generic CRUD engine + concrete master-data CRUD classes
    models/     # SQLAlchemy models
    schemas/    # Pydantic request/response schemas
    services/   # business logic (auth, orders, quotations, BOM, inventory, PDF)
  scripts/
    seed_admin.py   # idempotent bootstrap admin + number-series seeding
  migrations/   # one-off schema changes for existing databases, applied by hand
  schema.sql    # MySQL schema + number_series seed rows (no admin user, see seed_admin.py)
  requirements.txt

frontend/
  src/
    api/          # axios client + token store + typed endpoint functions
    components/   # ui/ (Button, TextField, GlassCard, ...) + layout/
    context/      # AuthContext + AuthProvider
    hooks/        # useAuth
    lib/          # validation, api error mapping, storage
    pages/        # LoginPage, ChangePasswordPage, DashboardPage, NotFoundPage
    routes/       # ProtectedRoute, PublicOnlyRoute
    types/        # types mirroring the backend's Pydantic schemas
  scripts/
    serve-static.mjs   # zero-dependency production static server
```
