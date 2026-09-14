# jdk_clean — Manufacturing ERP

A FastAPI/SQLAlchemy/MySQL backend and a React/TypeScript frontend for a
small manufacturing ERP: customers, suppliers, raw materials, products,
multi-level BOMs, inventory, quotations, and orders — with role-based
auth, soft deletes, and a field-level audit log.

- `backend/` — FastAPI API. See [backend/README.md](backend/README.md).
- `frontend/` — React app (currently: authentication end to end — login,
  session handling, protected routes, password change). See
  [frontend/README.md](frontend/README.md).
- `mobile-app-rn/` — Expo/React Native app (sales Quick Quote + client
  CRUD), also exportable as an installable PWA for mobile Chrome. See
  [mobile-app-rn/README.md](mobile-app-rn/README.md).

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
- [mobile-app-rn/README.md](mobile-app-rn/README.md) — `.env`, native (Expo) dev, PWA build/serving

## Running with pm2

`install.sh` generates `ecosystem.config.js` at the repo root (not
committed — it's environment-specific: ports, URLs). It defines a
single pm2 service, **jdk**, running `scripts/run-all.mjs` — a small
launcher that starts the backend, frontend, and mobile PWA as its own
direct child processes and forwards their output (prefixed
`[backend]`/`[frontend]`/`[mobile]`) and shutdown signals, so all three
are managed, restarted, and logged as one unit rather than separate
pm2 apps:

- **backend** — `uvicorn app.main:app` from the backend venv
- **frontend** — `frontend/scripts/serve-static.mjs`, a small
  dependency-free static file server (gzip, immutable caching on
  hashed assets, SPA fallback, security headers including a CSP) —
  see [frontend/README.md](frontend/README.md#deploying) for why this
  exists instead of a third-party static-server package.
- **mobile** — `mobile-app-rn/scripts/serve-static.mjs`, the same
  static-server pattern serving `mobile-app-rn`'s `expo export
  --platform web` output as an installable PWA — see
  [mobile-app-rn/README.md](mobile-app-rn/README.md#progressive-web-app-mobile-chrome).

If any child process dies unexpectedly, the launcher stops the others
too and exits non-zero, so pm2's autorestart brings the whole group
back up together instead of leaving some running alone.

```bash
pm2 status              # check the service
pm2 logs jdk            # tail logs (backend, frontend, and mobile, prefixed)
pm2 restart jdk         # restart
pm2 stop jdk            # stop
pm2 save                # persist the current process list
pm2 startup             # (optional, Linux/macOS) print the command to auto-start pm2 on boot
```

`install.sh` re-run on an existing install asks once, up front, whether
to reuse the existing `backend/.env`, `frontend/.env`, and
`ecosystem.config.js` as-is — if so, every database/port/secret
question is skipped and the existing ports (including the mobile PWA's)
are read straight out of `ecosystem.config.js`. Database migrations
always run on every install/re-run (idempotent), and once pm2 starts
the service the script waits for and health-checks the backend,
frontend, and mobile PWA before declaring success.

> `install.bat` (Windows) hasn't been updated to this single-service
> model yet — it still generates two separate pm2 apps, **jdk-backend**
> and **jdk-frontend**, with `pm2 logs jdk-backend`/`pm2 logs
> jdk-frontend` and `pm2 restart all`/`pm2 stop all` to manage them.
> `./relaunch.sh` and the "Relaunching cleanly" commands below only
> apply to the single-service layout.

If you didn't generate `ecosystem.config.js` via `install.sh`, you can
start each app manually — see the "Run the server" sections in each
app's README — and skip pm2 entirely.

### Relaunching cleanly

All three apps run as one pm2 service (`jdk`, via `scripts/run-all.mjs`).
`./relaunch.sh` (repo root) is the one-shot command for "pull new code,
rebuild, restart": `pm2 stop jdk`, backend `pip install`, frontend
`npm install && npm run build`, mobile PWA `npm install && npm run
build:web`, `pm2 restart jdk --update-env`, then tails the logs -- one
real command per step, nothing hidden behind custom cross-checking logic:

```bash
./relaunch.sh
```

It runs with `set -e` and prints a `==> N/8: <step>` header before each
command, so if something fails the script stops right there and what
you're looking at is that exact command's own real error -- not a
wrapper's interpretation of it. (An earlier version of this script
instead tried to automatically cross-check `.env`/`ecosystem.config.js`
consistency and find stray processes squatting on the ports, relying on
`sudo`, `python3`, and GNU-only `grep -P` all being present and working
the same way on whatever box it ran on; it became more fragile than the
problems it was checking for, and was replaced with this plainer
version.)

If you'd rather run the same steps by hand -- e.g. to skip the frontend
and mobile rebuilds when only backend code changed -- they're exactly:

```bash
pm2 stop jdk
(cd backend && source venv/bin/activate && pip install -r requirements.txt)
(cd frontend && npm install && npm run build)
(cd mobile-app-rn && npm install && npm run build:web)
pm2 restart jdk --update-env
pm2 logs jdk --lines 50 --nostream
```

Diagnosing a failure, whether from the script or by hand:

- **Backend didn't come up**: `pm2 logs jdk --lines 50 --nostream` --
  look for a `[backend]` line. A Python traceback there is almost
  always a `backend/.env` problem (bad `DB_PASSWORD`, DB not
  reachable) or a missing dependency (re-run the `pip install` above).
- **Frontend or mobile PWA didn't come up, or the browser can't reach
  the backend**: check `frontend/.env`'s `VITE_API_BASE_URL` (or
  `mobile-app-rn/.env`'s `EXPO_PUBLIC_API_BASE_URL`) against
  `ecosystem.config.js`'s own `API_BASE_URL` -- both static servers
  prefer the latter at runtime for their CSP header (see
  `frontend/scripts/serve-static.mjs` and
  `mobile-app-rn/scripts/serve-static.mjs`), so if only `.env` was
  updated, update `ecosystem.config.js` too and restart again. Also
  confirm `backend/.env`'s `CORS_ORIGINS` actually lists the origin
  the frontend/mobile PWA is really being opened from.
- **Something's already listening on the port**: `lsof -i :8000` /
  `lsof -i :4173` / `lsof -i :4174` (swap in your real ports from
  `ecosystem.config.js`) shows what and its pid; `kill` it if it's a
  stray process from an earlier run, then restart again.
- **pm2 says "online" but nothing answers**: that only means the
  process hasn't crashed *yet* -- confirm it's actually serving
  requests:
  ```bash
  curl -i http://localhost:8000/api/health
  curl -i http://localhost:4173/
  curl -i http://localhost:4174/
  ```

## Testing the login

See [backend/README.md](backend/README.md#testing-the-login) for a full
Swagger UI / curl walkthrough of the auth flow (login, `/me`, refresh
rotation, password change), or just open the frontend and sign in.

## Project layout

```
install.sh               # interactive installer, Linux/macOS (backend + frontend + mobile PWA + pm2)
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

mobile-app-rn/
  src/
    api/          # fetch client + token store + typed endpoint functions
    components/   # Button, TextField, GlassCard, ...
    context/      # AuthContext + AuthProvider
    navigation/   # RootNavigator (auth gate → bottom tabs)
    screens/      # LoginScreen, QuickQuoteScreen, ClientsListScreen, ...
  public/         # PWA manifest, service worker, icons, custom index.html
  scripts/
    serve-static.mjs   # zero-dependency production static server (PWA build)
```
