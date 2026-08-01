#!/usr/bin/env bash
#
# Interactive installer for jdk_clean: sets up the backend (FastAPI),
# frontend (React), and process management (pm2), asking along the way
# rather than requiring a pile of flags up front.
#
# Safe to re-run: existing .env files, an existing venv/node_modules, an
# existing database/schema, and an existing admin user are all detected
# and left alone (or you're asked before anything is overwritten).
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

# Prompt for a required, non-empty value; re-asks until given one.
ask_required() {
  local prompt="$1" answer
  while true; do
    read -r -p "$prompt: " answer
    [[ -n "$answer" ]] && { echo "$answer"; return; }
    fail "This value is required."
  done
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

PY_VERSION="$(python3 -c 'import sys; print("%d.%d" % sys.version_info[:2])')"
ok "python3 $PY_VERSION"
ok "node $(node -v)"
ok "npm $(npm -v)"

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
# Gather configuration
# ---------------------------------------------------------------------
heading "Database"

DB_HOST=$(ask "MySQL host" "localhost")
DB_PORT=$(ask "MySQL port" "3306")
DB_NAME=$(ask "Database name" "jdk_clean")
DB_USER=$(ask "Database user" "erp_user")
DB_PASSWORD=$(ask_secret "Database password")

CREATE_DB=n
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
ask_yes_no "Start both apps under pm2 when setup finishes?" y || START_PM2=n
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

info "Installing Python dependencies..."
"$PIP" install --quiet --upgrade pip
"$PIP" install --quiet -r requirements.txt
ok "Backend dependencies installed."

WRITE_BACKEND_ENV=y
if [[ -f .env ]]; then
  ask_yes_no ".env already exists in backend/ — overwrite it with these settings?" n && WRITE_BACKEND_ENV=y || WRITE_BACKEND_ENV=n
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
  warn "Left the existing backend/.env untouched."
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

info "Installing Node dependencies..."
npm install --silent
ok "Frontend dependencies installed."

WRITE_FRONTEND_ENV=y
if [[ -f .env ]]; then
  ask_yes_no ".env already exists in frontend/ — overwrite it with these settings?" n && WRITE_FRONTEND_ENV=y || WRITE_FRONTEND_ENV=n
fi

if [[ "$WRITE_FRONTEND_ENV" == "y" ]]; then
  cat > .env <<ENVFILE
VITE_API_BASE_URL=${BACKEND_URL}
ENVFILE
  ok "Wrote frontend/.env"
else
  warn "Left the existing frontend/.env untouched."
fi

info "Building the frontend for production..."
npm run build
ok "Frontend built."

cd "$SCRIPT_DIR"

# ---------------------------------------------------------------------
# pm2 ecosystem file
# ---------------------------------------------------------------------
heading "Process management (pm2)"

ECOSYSTEM_FILE="$SCRIPT_DIR/ecosystem.config.js"
WRITE_ECOSYSTEM=y
if [[ -f "$ECOSYSTEM_FILE" ]]; then
  ask_yes_no "ecosystem.config.js already exists — regenerate it with these settings?" n && WRITE_ECOSYSTEM=y || WRITE_ECOSYSTEM=n
fi

if [[ "$WRITE_ECOSYSTEM" == "y" ]]; then
  cat > "$ECOSYSTEM_FILE" <<JSFILE
// Generated by install.sh on $(date -u +"%Y-%m-%dT%H:%M:%SZ").
// Safe to edit by hand -- re-running install.sh will ask before
// overwriting it.
module.exports = {
  apps: [
    {
      name: 'jdk-backend',
      cwd: './backend',
      script: 'venv/bin/uvicorn',
      args: 'app.main:app --host 0.0.0.0 --port ${BACKEND_PORT}',
      interpreter: 'none',
      autorestart: true,
      max_restarts: 10,
      env: {
        PYTHONUNBUFFERED: '1',
      },
    },
    {
      name: 'jdk-frontend',
      cwd: './frontend',
      script: 'scripts/serve-static.mjs',
      interpreter: 'node',
      autorestart: true,
      max_restarts: 10,
      env: {
        PORT: '${FRONTEND_PORT}',
        API_BASE_URL: '${BACKEND_URL}',
      },
    },
  ],
}
JSFILE
  ok "Wrote ecosystem.config.js"
else
  warn "Left the existing ecosystem.config.js untouched."
fi

if [[ "$START_PM2" == "y" ]]; then
  info "Starting apps under pm2..."
  pm2 start "$ECOSYSTEM_FILE"
  pm2 save
  ok "pm2 apps started and saved."

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
fi

# ---------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------
heading "${GREEN}Setup complete${RESET}"

echo "  Backend:   http://localhost:${BACKEND_PORT}  (docs at /docs)"
echo "  Frontend:  http://localhost:${FRONTEND_PORT}"

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
  echo "  pm2 status         -- check both processes"
  echo "  pm2 logs           -- tail logs for both"
  echo "  pm2 restart all    -- restart both"
  echo "  pm2 stop all       -- stop both"
fi

echo ""
