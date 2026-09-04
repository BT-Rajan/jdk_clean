#!/usr/bin/env bash
#
# Interactive installer for jdk_clean: sets up the backend (FastAPI),
# frontend (React), and process management (pm2), asking along the way
# rather than requiring a pile of flags up front.
#
# If backend/.env, frontend/.env, and ecosystem.config.js already all
# exist, you're asked ONCE up front whether to reuse them as-is -- if
# so, every database/port/secret question is skipped entirely and the
# existing values (including the backend/frontend ports) are read back
# out of those files. Say no (or if any of the three is missing) and
# you get the full configuration walkthrough, same as a fresh install.
#
# Both apps run as a single pm2 service ('jdk', via scripts/run-all.mjs)
# rather than two separate ones, so `pm2 status`/`pm2 logs`/`pm2 restart`
# only ever have one thing to say. Database migrations always run
# (idempotent -- safe on every install/re-run), and once pm2 starts the
# service this script waits for and checks both the backend and frontend
# to actually answer before declaring success.
#
# Usage: ./install.sh   (run from the repo root)

set -euo pipefail

# ---------------------------------------------------------------------
# Pretty output helpers
# ---------------------------------------------------------------------
if [[ -t 1 ]]; then
  BOLD=$'\033[1m'; DIM=$'\033[2m'; RESET=$'\033[0m'
  RED=$'\033[31m'; GREEN=$'\033[32m'; YELLOW=$'\033[33m'; BLUE=$'\033[34m'
else
  BOLD=""; DIM=""; RESET=""; RED=""; GREEN=""; YELLOW=""; BLUE=""
fi

info()    { printf '%s\n' "${BLUE}==>${RESET} $*"; }
ok()      { printf '%s\n' "${GREEN}OK${RESET}  $*"; }
warn()    { printf '%s\n' "${YELLOW}!!${RESET}  $*"; }
fail()    { printf '%s\n' "${RED}✗${RESET}  $*" >&2; }
heading() { printf '\n%s\n' "${BOLD}$*${RESET}"; }

die() { fail "$*"; exit 1; }

# Prompt with a default value; prints the answer to stdout.
ask() {
  local prompt="$1" default="${2:-}" answer
  if [[ -n "$default" ]]; then
    read -r -p "$prompt [$default]: " answer
    echo "${answer:-$default}"
  else
    read -r -p "$prompt: " answer
    echo "$answer"
  fi
}

# Hidden-input prompt (passwords/secrets). Prints the answer to stdout.
ask_secret() {
  local prompt="$1" answer
  read -r -s -p "$prompt: " answer
  echo "" >&2
  echo "$answer"
}

# Hidden-input prompt requiring a minimum length, re-asking until met.
ask_secret_min_len() {
  local prompt="$1" min_len="$2" answer
  while true; do
    answer=$(ask_secret "$prompt")
    if [[ ${#answer} -ge $min_len ]]; then
      echo "$answer"
      return
    fi
    fail "Must be at least $min_len characters."
  done
}

# y/n prompt with a default. Returns 0 for yes, 1 for no.
ask_yes_no() {
  local prompt="$1" default="${2:-y}" hint answer
  [[ "$default" == "y" ]] && hint="Y/n" || hint="y/N"
  read -r -p "$prompt [$hint]: " answer
  answer="${answer:-$default}"
  [[ "$answer" =~ ^[Yy] ]]
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "'$1' is required but not found. $2"
}

# ---------------------------------------------------------------------
# Locate the repo
# ---------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/backend"
FRONTEND_DIR="$SCRIPT_DIR/frontend"
ECOSYSTEM_FILE="$SCRIPT_DIR/ecosystem.config.js"

[[ -d "$BACKEND_DIR" && -d "$FRONTEND_DIR" ]] \
  || die "Run this from the repo root (expected ./backend and ./frontend here)."

echo ""
echo "${BOLD}jdk_clean — interactive installer${RESET}"
echo "${DIM}Sets up the backend, frontend, and pm2 process management.${RESET}"

# ---------------------------------------------------------------------
# Prerequisites
# ---------------------------------------------------------------------
heading "Checking prerequisites"

require_cmd python3 "Install Python 3.11+."
require_cmd node "Install Node.js 20+."
require_cmd npm "npm ships with Node.js."
require_cmd curl "Install curl (used for the post-install health checks)."

PY_VERSION="$(python3 -c 'import sys; print("%d.%d" % sys.version_info[:2])')"
ok "python3 $PY_VERSION"
ok "node $(node -v)"
ok "npm $(npm -v)"
ok "curl $(curl -V | head -1 | awk '{print $2}')"

if command -v soffice >/dev/null 2>&1; then
  ok "soffice (LibreOffice) found"
else
  warn "soffice (LibreOffice) not found -- quotation Print and Email will fail until it's installed."
  echo "${DIM}      It renders each document's admin-uploaded Word template to PDF for those two actions.${RESET}"
  echo "${DIM}      Install the 'libreoffice-writer' package (Debian/Ubuntu) or your distro's equivalent, then re-run this installer or just restart the backend -- no other setup needed.${RESET}"
fi

if ! command -v pm2 >/dev/null 2>&1; then
  warn "pm2 is not installed globally."
  if ask_yes_no "Install it now (npm install -g pm2)?" y; then
    npm install -g pm2
  else
    die "pm2 is required to continue (or run the backend/frontend manually instead of using this script)."
  fi
fi
ok "pm2 $(pm2 -v)"

# ---------------------------------------------------------------------
# Configuration: reuse what's already there, or set up fresh -- asked
# ONCE, up front, instead of once per file further down.
# ---------------------------------------------------------------------
heading "Configuration"

REUSE_CONFIG=n
if [[ -f "$BACKEND_DIR/.env" && -f "$FRONTEND_DIR/.env" && -f "$ECOSYSTEM_FILE" ]]; then
  ok "Found existing backend/.env, frontend/.env, and ecosystem.config.js."
  if ask_yes_no "Use them as-is (skip database/port/secret questions)?" y; then
    REUSE_CONFIG=y
  fi
else
  info "No complete existing configuration found -- let's set it up."
fi

CREATE_DB=n
LOAD_SCHEMA=n
WRITE_BACKEND_ENV=n
WRITE_FRONTEND_ENV=n
WRITE_ECOSYSTEM=n

if [[ "$REUSE_CONFIG" == "y" ]]; then
  # Everything the rest of this script needs (DB creds, JWT secret,
  # CORS, VITE_API_BASE_URL) is already in the .env files and read by
  # the app itself -- the only values this script's own logic still
  # needs are the ports and backend URL baked into ecosystem.config.js.
  #
  # The `|| true` on each grep matters: under `set -e` + `pipefail`, a
  # `grep ... | head -1` whose grep matches nothing makes the WHOLE
  # pipeline exit non-zero (pipefail sees grep's own failure even
  # though head itself exits 0), which would silently kill this
  # script right here with no message at all -- exactly what an older
  # ecosystem.config.js (from before this became a single-service
  # layout, e.g. one with no BACKEND_PORT key at all) does. `|| true`
  # lets that fall through to the explicit, informative check below.
  BACKEND_PORT=$(grep -oP "(?<=BACKEND_PORT: ')\d+" "$ECOSYSTEM_FILE" | head -1 || true)
  FRONTEND_PORT=$(grep -oP "(?<=FRONTEND_PORT: ')\d+" "$ECOSYSTEM_FILE" | head -1 || true)
  BACKEND_URL=$(grep -oP "(?<=API_BASE_URL: ')[^']+" "$ECOSYSTEM_FILE" | head -1 || true)

  if [[ -z "$BACKEND_PORT" || -z "$FRONTEND_PORT" ]]; then
    warn "ecosystem.config.js doesn't look like the current single-service format (no BACKEND_PORT/FRONTEND_PORT found in it) -- looks like it's from an older two-app install."
    info "backend/.env and frontend/.env are still being reused as-is; just need the ports again to regenerate ecosystem.config.js in the current format."
    DEFAULT_BACKEND_URL_FROM_ENV=$(grep -oP '(?<=^VITE_API_BASE_URL=).+' "$FRONTEND_DIR/.env" | head -1 || true)
    BACKEND_PORT=$(ask "Backend port" "8000")
    FRONTEND_PORT=$(ask "Frontend port" "4173")
    BACKEND_URL=$(ask "Backend base URL (used for the frontend's VITE_API_BASE_URL / CSP)" "${DEFAULT_BACKEND_URL_FROM_ENV:-http://localhost:${BACKEND_PORT}}")
    WRITE_ECOSYSTEM=y
  else
    ok "Using existing ports: backend ${BACKEND_PORT}, frontend ${FRONTEND_PORT}, API base URL ${BACKEND_URL:-<not set>}."
  fi
else
  heading "Database"

  DB_HOST=$(ask "MySQL host" "localhost")
  DB_PORT=$(ask "MySQL port" "3306")
  DB_NAME=$(ask "Database name" "jdk_clean")
  DB_USER=$(ask "Database user" "erp_user")
  DB_PASSWORD=$(ask_secret "Database password")

  ADMIN_DB_USER=""
  ADMIN_DB_PASSWORD=""
  if ask_yes_no "Create the database/user now with a MySQL admin login (skip if you've already created them)?" y; then
    CREATE_DB=y
    ADMIN_DB_USER=$(ask "MySQL admin user (for CREATE DATABASE/USER)" "root")
    ADMIN_DB_PASSWORD=$(ask_secret "MySQL admin password")
  fi

  LOAD_SCHEMA=y
  ask_yes_no "Load backend/schema.sql into the database now (safe to re-run)?" y || LOAD_SCHEMA=n

  heading "Backend"

  BACKEND_PORT=$(ask "Backend port" "8000")

  if ask_yes_no "Auto-generate a secure JWT secret?" y; then
    JWT_SECRET=$(python3 -c 'import secrets; print(secrets.token_urlsafe(48))')
    ok "Generated a JWT secret."
  else
    JWT_SECRET=$(ask_secret_min_len "Paste your JWT secret" 32)
  fi

  ACCESS_TOKEN_EXPIRE_MINUTES=$(ask "Access token lifetime (minutes)" "60")
  REFRESH_TOKEN_EXPIRE_DAYS=$(ask "Refresh token lifetime (days)" "7")

  heading "Frontend"

  FRONTEND_PORT=$(ask "Frontend port" "4173")

  echo
  echo "  If this server will only ever be opened from this same machine"
  echo "  (http://localhost:${FRONTEND_PORT}), leave the next answer blank."
  echo "  If people will open it from elsewhere -- another machine on your"
  echo "  network, or the internet -- enter the address they'll actually"
  echo "  type into their browser: a bare IP (203.0.113.10), or a domain"
  echo "  (erp.example.com) if you have DNS/HTTPS set up already. Don't"
  echo "  include http(s):// or a port -- those are added for you below."
  echo
  SERVER_HOST=$(ask "Server IP or domain (blank = localhost only)" "")

  if [[ -z "$SERVER_HOST" ]]; then
    DEFAULT_FRONTEND_ORIGIN="http://localhost:${FRONTEND_PORT}"
    DEFAULT_BACKEND_URL="http://localhost:${BACKEND_PORT}"
  else
    # Both localhost AND the given host are allowed to call the backend --
    # this is a comma-separated list (see core/config.py's cors_origin_list),
    # so local testing on the machine itself keeps working alongside real
    # access from wherever SERVER_HOST actually resolves.
    DEFAULT_FRONTEND_ORIGIN="http://localhost:${FRONTEND_PORT},http://${SERVER_HOST}:${FRONTEND_PORT}"
    # The frontend build can only point at one backend address, and it has
    # to be one a real browser elsewhere can actually reach -- localhost
    # would resolve to the *visitor's own machine*, not this server.
    DEFAULT_BACKEND_URL="http://${SERVER_HOST}:${BACKEND_PORT}"
  fi

  FRONTEND_ORIGIN=$(ask "Frontend origin(s) (used for the backend's CORS_ORIGINS -- comma-separated is fine)" "$DEFAULT_FRONTEND_ORIGIN")
  BACKEND_URL=$(ask "Backend base URL (used for the frontend's VITE_API_BASE_URL)" "$DEFAULT_BACKEND_URL")

  WRITE_BACKEND_ENV=y
  WRITE_FRONTEND_ENV=y
  WRITE_ECOSYSTEM=y
fi

heading "Bootstrap admin account"

SEED_ADMIN=y
ask_yes_no "Create a bootstrap admin user now?" y || SEED_ADMIN=n
ADMIN_USERNAME="" ADMIN_EMAIL="" ADMIN_FULL_NAME="" ADMIN_PASSWORD="" ADMIN_PASSWORD_GENERATED=n
if [[ "$SEED_ADMIN" == "y" ]]; then
  ADMIN_USERNAME=$(ask "Admin username" "admin")
  ADMIN_EMAIL=$(ask "Admin email" "admin@example.com")
  ADMIN_FULL_NAME=$(ask "Admin full name" "Administrator")
  if ask_yes_no "Auto-generate a strong admin password (recommended)?" y; then
    ADMIN_PASSWORD=$(python3 -c 'import secrets, string; a = string.ascii_letters + string.digits + "!@#%^&*"; print("".join(secrets.choice(a) for _ in range(18)))')
    ADMIN_PASSWORD_GENERATED=y
  else
    ADMIN_PASSWORD=$(ask_secret_min_len "Admin password" 8)
  fi
fi

heading "Process management"

START_PM2=y
ask_yes_no "Start the app under pm2 when setup finishes?" y || START_PM2=n
PM2_STARTUP=n
if [[ "$START_PM2" == "y" ]]; then
  ask_yes_no "Enable pm2 to auto-start on system boot (runs 'pm2 startup', may prompt for sudo)?" n && PM2_STARTUP=y
fi

# ---------------------------------------------------------------------
# Database setup
# ---------------------------------------------------------------------
if [[ "$CREATE_DB" == "y" || "$LOAD_SCHEMA" == "y" ]]; then
  heading "Setting up the database"
  require_cmd mysql "Install the MySQL client, or answer 'n' to the database questions above and set it up yourself."
fi

if [[ "$CREATE_DB" == "y" ]]; then
  info "Creating database and user..."
  MYSQL_PWD="$ADMIN_DB_PASSWORD" mysql -h "$DB_HOST" -P "$DB_PORT" -u "$ADMIN_DB_USER" <<SQL
CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4;
CREATE USER IF NOT EXISTS '${DB_USER}'@'%' IDENTIFIED BY '${DB_PASSWORD}';
GRANT ALL PRIVILEGES ON \`${DB_NAME}\`.* TO '${DB_USER}'@'%';
FLUSH PRIVILEGES;
SQL
  ok "Database and user ready."
fi

if [[ "$LOAD_SCHEMA" == "y" ]]; then
  info "Loading schema..."
  MYSQL_PWD="$DB_PASSWORD" mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" "$DB_NAME" < "$BACKEND_DIR/schema.sql" \
    || die "Could not load schema.sql. Check the database credentials above and that '${DB_USER}' has privileges on '${DB_NAME}'."
  ok "Schema loaded."
fi

# ---------------------------------------------------------------------
# Backend setup
# ---------------------------------------------------------------------
heading "Setting up the backend"
cd "$BACKEND_DIR"

if [[ ! -d venv ]]; then
  info "Creating virtual environment..."
  python3 -m venv venv
fi
PY="$BACKEND_DIR/venv/bin/python3"
PIP="$BACKEND_DIR/venv/bin/pip"

# Skip the reinstall entirely once requirements.txt has already been
# installed into this venv and hasn't changed since -- a plain sha256
# of the file, stashed alongside the venv it was installed into, so a
# fresh venv (or an edited requirements.txt) still triggers a real
# install while an unchanged repeat run doesn't pay for one.
REQUIREMENTS_HASH_FILE="venv/.requirements.sha256"
REQUIREMENTS_HASH="$(sha256sum requirements.txt | awk '{print $1}')"
if [[ -f "$REQUIREMENTS_HASH_FILE" && "$(cat "$REQUIREMENTS_HASH_FILE")" == "$REQUIREMENTS_HASH" ]]; then
  ok "Backend dependencies already up to date (requirements.txt unchanged) -- skipping install."
else
  info "Installing Python dependencies..."
  "$PIP" install --quiet --upgrade pip
  "$PIP" install --quiet -r requirements.txt
  echo "$REQUIREMENTS_HASH" > "$REQUIREMENTS_HASH_FILE"
  ok "Backend dependencies installed."
fi

if [[ "$WRITE_BACKEND_ENV" == "y" ]]; then
  cat > .env <<ENVFILE
DB_HOST=${DB_HOST}
DB_PORT=${DB_PORT}
DB_USER=${DB_USER}
DB_PASSWORD=${DB_PASSWORD}
DB_NAME=${DB_NAME}

JWT_SECRET_KEY=${JWT_SECRET}
ACCESS_TOKEN_EXPIRE_MINUTES=${ACCESS_TOKEN_EXPIRE_MINUTES}
REFRESH_TOKEN_EXPIRE_DAYS=${REFRESH_TOKEN_EXPIRE_DAYS}

CORS_ORIGINS=${FRONTEND_ORIGIN}
ENVFILE
  chmod 600 .env
  ok "Wrote backend/.env"
else
  ok "Using existing backend/.env."
fi

info "Applying database migrations (safe to re-run; already-applied changes are skipped)..."
"$PY" scripts/run_migrations.py
ok "Migrations applied."

if [[ "$SEED_ADMIN" == "y" ]]; then
  info "Seeding bootstrap admin + number series..."
  "$PY" scripts/seed_admin.py \
    --username "$ADMIN_USERNAME" \
    --email "$ADMIN_EMAIL" \
    --full-name "$ADMIN_FULL_NAME" \
    --password "$ADMIN_PASSWORD"
  ok "Admin account ready."
fi

cd "$SCRIPT_DIR"

# ---------------------------------------------------------------------
# Frontend setup
# ---------------------------------------------------------------------
heading "Setting up the frontend"
cd "$FRONTEND_DIR"

# Same skip-if-unchanged check as the backend's requirements.txt above:
# npm install is the slowest step in this whole script, and re-resolving
# an already-satisfied tree from scratch every run isn't cheap. A sha256
# of package-lock.json (the actual source of truth for what gets
# installed, not package.json) stashed next to node_modules covers a
# fresh checkout, an edited lockfile, and a first-ever install alike.
PACKAGE_LOCK_HASH_FILE="node_modules/.package-lock.sha256"
PACKAGE_LOCK_HASH="$(sha256sum package-lock.json | awk '{print $1}')"
if [[ -d node_modules && -f "$PACKAGE_LOCK_HASH_FILE" && "$(cat "$PACKAGE_LOCK_HASH_FILE")" == "$PACKAGE_LOCK_HASH" ]]; then
  ok "Node dependencies already up to date (package-lock.json unchanged) -- skipping install."
else
  info "Installing Node dependencies..."
  npm install --silent
  echo "$PACKAGE_LOCK_HASH" > "$PACKAGE_LOCK_HASH_FILE"
  ok "Frontend dependencies installed."
fi

if [[ "$WRITE_FRONTEND_ENV" == "y" ]]; then
  cat > .env <<ENVFILE
VITE_API_BASE_URL=${BACKEND_URL}
ENVFILE
  ok "Wrote frontend/.env"
else
  ok "Using existing frontend/.env."
fi

info "Building the frontend for production..."
# tsc -b's incremental build cache (node_modules/.tmp/*.tsbuildinfo) can
# reference file states from before a git pull landed, producing
# confusing type errors on an otherwise-clean checkout -- cheap to
# clear, no downside, and has fixed real "build suddenly fails" reports.
rm -rf node_modules/.tmp
npm run build
ok "Frontend built."

cd "$SCRIPT_DIR"

# ---------------------------------------------------------------------
# pm2 ecosystem file -- ONE service ('jdk') running both the backend
# and frontend as child processes via scripts/run-all.mjs, instead of
# two separate pm2 apps.
# ---------------------------------------------------------------------
heading "Process management (pm2)"

if [[ "$WRITE_ECOSYSTEM" == "y" ]]; then
  cat > "$ECOSYSTEM_FILE" <<JSFILE
// Generated by install.sh on $(date -u +"%Y-%m-%dT%H:%M:%SZ").
// Safe to edit by hand -- re-running install.sh will ask before
// overwriting it (or will reuse it as-is if you say so up front).
//
// One pm2 service runs both the backend and frontend, via
// scripts/run-all.mjs -- see that file's header for why (they
// restart together, and 'pm2 logs jdk' shows both, prefixed).
module.exports = {
  apps: [
    {
      name: 'jdk',
      script: 'scripts/run-all.mjs',
      interpreter: 'node',
      cwd: '${SCRIPT_DIR}',
      autorestart: true,
      max_restarts: 10,
      env: {
        BACKEND_PORT: '${BACKEND_PORT}',
        FRONTEND_PORT: '${FRONTEND_PORT}',
        API_BASE_URL: '${BACKEND_URL}',
      },
    },
  ],
}
JSFILE
  ok "Wrote ecosystem.config.js"
else
  ok "Using existing ecosystem.config.js."
fi

if [[ "$START_PM2" == "y" ]]; then
  info "Starting the app under pm2..."
  # Clean up an older two-app install (jdk-backend/jdk-frontend) if one
  # is still registered under pm2 from before this script moved to a
  # single combined service -- harmless no-op otherwise.
  pm2 delete jdk-backend jdk-frontend >/dev/null 2>&1 || true
  pm2 start "$ECOSYSTEM_FILE"
  pm2 save
  ok "pm2 app started and saved."

  if [[ "$PM2_STARTUP" == "y" ]]; then
    info "Configuring pm2 to start on boot..."
    STARTUP_CMD="$(pm2 startup 2>/dev/null | tail -n 1)"
    if [[ "$STARTUP_CMD" == *"sudo"* ]] && eval "$STARTUP_CMD"; then
      pm2 save
      ok "pm2 will start on boot."
    else
      warn "Couldn't run the pm2 startup command automatically. Run this yourself if you want boot persistence:"
      echo "  $STARTUP_CMD"
    fi
  fi

  # -------------------------------------------------------------
  # Health checks -- wait for both the backend and frontend to
  # actually answer, not just for pm2 to say "online".
  # -------------------------------------------------------------
  heading "Health checks"

  wait_for_http() {
    local name="$1" url="$2" tries=30 i
    for ((i = 1; i <= tries; i++)); do
      if curl -fsS "$url" >/dev/null 2>&1; then
        ok "$name answers on $url"
        return 0
      fi
      sleep 1
    done
    fail "$name did NOT answer on $url after ${tries}s"
    fail "Check: pm2 logs jdk --lines 50"
    return 1
  }

  HEALTH_OK=y
  wait_for_http "Backend" "http://localhost:${BACKEND_PORT}/api/health" || HEALTH_OK=n
  wait_for_http "Frontend" "http://localhost:${FRONTEND_PORT}/" || HEALTH_OK=n

  if [[ "$HEALTH_OK" != "y" ]]; then
    warn "One or more health checks failed -- see 'pm2 logs jdk --lines 50 --nostream' for details (see README.md's \"Relaunching cleanly\" for what to check next)."
  fi
else
  warn "Skipped starting pm2 -- skipping health checks too. Start it yourself with: pm2 start ecosystem.config.js"
fi

# ---------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------
heading "${GREEN}Setup complete${RESET}"

DISPLAY_HOST="${SERVER_HOST:-localhost}"
echo "  Backend:   http://${DISPLAY_HOST}:${BACKEND_PORT}  (docs at /docs)"
echo "  Frontend:  http://${DISPLAY_HOST}:${FRONTEND_PORT}"

if [[ "$SEED_ADMIN" == "y" ]]; then
  echo ""
  echo "  Admin login:"
  echo "    username: ${ADMIN_USERNAME}"
  echo "    password: ${ADMIN_PASSWORD}"
  if [[ "$ADMIN_PASSWORD_GENERATED" == "y" ]]; then
    echo ""
    warn "Save that password now — it will not be shown again. Log in and change it immediately (there's a \"Change password\" link once you're signed in)."
  fi
fi

if [[ "$START_PM2" == "y" ]]; then
  echo ""
  echo "  pm2 status         -- check the service"
  echo "  pm2 logs jdk       -- tail logs (both backend and frontend, prefixed)"
  echo "  pm2 restart jdk    -- restart"
  echo "  pm2 stop jdk       -- stop"
fi

echo ""
