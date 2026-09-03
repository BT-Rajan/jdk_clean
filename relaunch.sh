#!/usr/bin/env bash
#
# Cleanly stops, cross-checks, and restarts jdk_clean's backend +
# frontend (run together as a single pm2 service, 'jdk' -- see
# ecosystem.config.js and scripts/run-all.mjs) -- built specifically to
# catch, automatically where possible, the handful of things that have
# caused "frontend can't reach backend" after almost every relaunch so far:
#
#   1. A stray process (not managed by pm2, or a pm2 process under some
#      other name) already squatting on the configured port, so the
#      real jdk-backend/jdk-frontend process can never actually bind.
#   2. The backend origin drifting out of sync across the THREE places
#      it's independently stored: frontend/.env's VITE_API_BASE_URL
#      (baked into the JS bundle at build time), the built dist/
#      bundle itself (stale if not rebuilt since .env last changed),
#      and ecosystem.config.js's own API_BASE_URL (which the static
#      server actually prefers at runtime for its CSP header, taking
#      precedence over .env -- see frontend/scripts/serve-static.mjs).
#   3. backend/.env's CORS_ORIGINS not actually listing the origin the
#      frontend is really being opened from.
#
# Prints one clear pass/fail report at the end instead of leaving you
# to interpret raw pm2 logs.
#
# Usage: ./relaunch.sh   (run from the repo root)

set -uo pipefail

if [[ -t 1 ]]; then
  BOLD=$'\033[1m'; RESET=$'\033[0m'
  RED=$'\033[31m'; GREEN=$'\033[32m'; YELLOW=$'\033[33m'; BLUE=$'\033[34m'
else
  BOLD=""; RESET=""; RED=""; GREEN=""; YELLOW=""; BLUE=""
fi

info()    { printf '%s\n' "${BLUE}==>${RESET} $*"; }
ok()      { printf '%s\n' "${GREEN}OK${RESET}  $*"; }
warn()    { printf '%s\n' "${YELLOW}!!${RESET}  $*"; }
fail()    { printf '%s\n' "${RED}FAIL${RESET} $*"; }
heading() { printf '\n%s\n' "${BOLD}$*${RESET}"; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

PROBLEMS=0

# -----------------------------------------------------------------
# 1. Read the config that's actually in effect from every place it
#    lives, rather than assuming any one of them is current.
# -----------------------------------------------------------------
heading "Reading current configuration"

if [[ ! -f ecosystem.config.js ]]; then
  fail "No ecosystem.config.js at the repo root -- run ./install.sh first."
  exit 1
fi

BACKEND_PORT=$(grep -oP "(?<=BACKEND_PORT: ')\d+" ecosystem.config.js | head -1)
FRONTEND_PORT=$(grep -oP "(?<=FRONTEND_PORT: ')\d+" ecosystem.config.js | head -1)
ECOSYSTEM_API_BASE_URL=$(grep -oP "(?<=API_BASE_URL: ')[^']+" ecosystem.config.js | head -1)

if [[ -z "$BACKEND_PORT" || -z "$FRONTEND_PORT" ]]; then
  fail "Couldn't parse ports out of ecosystem.config.js -- has its format changed?"
  exit 1
fi
info "ecosystem.config.js: backend port ${BACKEND_PORT}, frontend port ${FRONTEND_PORT}"
info "ecosystem.config.js: API_BASE_URL = ${ECOSYSTEM_API_BASE_URL:-<not set>}"

FRONTEND_ENV_API_BASE_URL=""
if [[ -f frontend/.env ]]; then
  FRONTEND_ENV_API_BASE_URL=$(grep -oP '(?<=^VITE_API_BASE_URL=).+' frontend/.env | head -1)
fi
info "frontend/.env: VITE_API_BASE_URL = ${FRONTEND_ENV_API_BASE_URL:-<not set>}"

BACKEND_CORS_ORIGINS=""
if [[ -f backend/.env ]]; then
  BACKEND_CORS_ORIGINS=$(grep -oP '(?<=^CORS_ORIGINS=).+' backend/.env | head -1)
fi
info "backend/.env: CORS_ORIGINS = ${BACKEND_CORS_ORIGINS:-<not set>}"

# -----------------------------------------------------------------
# 2. Cross-check the three places the backend origin is stored.
# -----------------------------------------------------------------
heading "Checking backend-origin consistency"

if [[ -n "$ECOSYSTEM_API_BASE_URL" && -n "$FRONTEND_ENV_API_BASE_URL" && "$ECOSYSTEM_API_BASE_URL" != "$FRONTEND_ENV_API_BASE_URL" ]]; then
  warn "ecosystem.config.js's API_BASE_URL (${ECOSYSTEM_API_BASE_URL}) doesn't match frontend/.env's VITE_API_BASE_URL (${FRONTEND_ENV_API_BASE_URL})."
  warn "The static server prefers ecosystem.config.js's value at runtime for its CSP header -- if that one's stale, fixing .env alone won't be enough."
  PROBLEMS=$((PROBLEMS+1))
else
  ok "ecosystem.config.js and frontend/.env agree on the backend origin."
fi

if [[ -n "$FRONTEND_ENV_API_BASE_URL" ]]; then
  if [[ -n "$BACKEND_CORS_ORIGINS" ]]; then
    ORIGIN_HOST=$(echo "$FRONTEND_ENV_API_BASE_URL" | grep -oP '(?<=://)[^:/]+')
    if [[ "$BACKEND_CORS_ORIGINS" == *"$ORIGIN_HOST"* ]] || [[ "$ORIGIN_HOST" == "localhost" ]]; then
      : # host appears somewhere in CORS_ORIGINS, or backend is same-host -- good enough for a heuristic check
    else
      warn "backend/.env's CORS_ORIGINS doesn't appear to mention '${ORIGIN_HOST}' -- if that's genuinely where the frontend is opened from, requests will be blocked by CORS."
      PROBLEMS=$((PROBLEMS+1))
    fi
  fi
fi

# -----------------------------------------------------------------
# 3. Check for a stale frontend build (dist/ older than .env).
# -----------------------------------------------------------------
heading "Checking for a stale frontend build"

if [[ -d frontend/dist ]]; then
  DIST_MTIME=$(stat -c %Y frontend/dist 2>/dev/null || stat -f %m frontend/dist)

  STALE_REASON=""

  if [[ -f frontend/.env ]]; then
    ENV_MTIME=$(stat -c %Y frontend/.env 2>/dev/null || stat -f %m frontend/.env)
    if [[ "$ENV_MTIME" -gt "$DIST_MTIME" ]]; then
      STALE_REASON="frontend/.env was modified more recently than frontend/dist/ was built (VITE_API_BASE_URL is baked in at build time)."
    fi
  fi

  # Also catch source changes that pulled in via git but never triggered a
  # rebuild -- e.g. `git pull` updating frontend/src without touching .env.
  if [[ -z "$STALE_REASON" ]]; then
    NEWER_SRC_FILE=$(find frontend/src frontend/public frontend/index.html frontend/package.json frontend/vite.config.* -type f -newer frontend/dist 2>/dev/null | head -1)
    if [[ -n "$NEWER_SRC_FILE" ]]; then
      STALE_REASON="frontend source (e.g. ${NEWER_SRC_FILE}) is newer than frontend/dist/ -- looks like a git pull landed changes that were never built."
    fi
  fi

  if [[ -n "$STALE_REASON" ]]; then
    warn "$STALE_REASON"
    read -r -p "Rebuild the frontend now? [Y/n]: " REBUILD_NOW
    if [[ ! "$REBUILD_NOW" =~ ^[Nn]$ ]]; then
      info "Rebuilding frontend..."
      (cd frontend && npm run build)
      ok "Rebuilt."
    else
      PROBLEMS=$((PROBLEMS+1))
    fi
  else
    ok "frontend/dist/ is newer than both frontend/.env and frontend/src -- build is current."
  fi
else
  warn "frontend/dist/ doesn't exist yet -- run 'cd frontend && npm run build' before relaunching."
  PROBLEMS=$((PROBLEMS+1))
fi

# -----------------------------------------------------------------
# 4. Find anything -- pm2-managed or not -- squatting on either port
#    under a name this project didn't create.
# -----------------------------------------------------------------
heading "Checking for port conflicts"

check_port_owner() {
  local port="$1" expected_pm2_name="$2"
  local pid
  pid=$(sudo lsof -ti :"$port" -sTCP:LISTEN 2>/dev/null | head -1)
  if [[ -z "$pid" ]]; then
    info "Nothing currently listening on port ${port} (expected before a fresh start)."
    return
  fi
  local cmd
  cmd=$(ps -p "$pid" -o comm= 2>/dev/null || echo "unknown")
  # The pm2-tracked process for '$expected_pm2_name' is scripts/run-all.mjs
  # itself (see ecosystem.config.js) -- it doesn't bind either port
  # directly, it spawns the backend (uvicorn) and frontend (serve-
  # static.mjs) as its own direct children, one of which actually holds
  # the port. So "owned by this service" means "this port's listener is
  # a direct child of the pm2-tracked pid", not "the listener pid IS the
  # pm2-tracked pid".
  local expected_pm2_pid
  expected_pm2_pid=$(pm2 jlist 2>/dev/null | python3 -c "
import json, sys
try:
    procs = json.load(sys.stdin)
except Exception:
    sys.exit(0)
for p in procs:
    if p.get('name') == '${expected_pm2_name}':
        print(p.get('pid', ''))
        break
" 2>/dev/null)
  local listener_ppid
  listener_ppid=$(ps -p "$pid" -o ppid= 2>/dev/null | tr -d ' ')
  if [[ -n "$expected_pm2_pid" && "$listener_ppid" == "$expected_pm2_pid" ]]; then
    ok "Port ${port} is held by the correct pm2 service (${expected_pm2_name}, pid ${pid}, child of pm2 pid ${expected_pm2_pid})."
  else
    warn "Port ${port} is held by pid ${pid} (${cmd}) -- not a child of the expected pm2 service '${expected_pm2_name}'${expected_pm2_pid:+ (pm2 pid $expected_pm2_pid)}."
    warn "This is almost always why relaunches fail: the real process can't bind because something else already has the port."
    read -r -p "Kill pid ${pid} now? [y/N]: " KILL_IT
    if [[ "$KILL_IT" =~ ^[Yy]$ ]]; then
      sudo kill -9 "$pid" 2>/dev/null && ok "Killed pid ${pid}." || fail "Could not kill pid ${pid} -- you may need to do this manually."
    else
      PROBLEMS=$((PROBLEMS+1))
    fi
  fi
}

check_port_owner "$BACKEND_PORT" "jdk"
check_port_owner "$FRONTEND_PORT" "jdk"

# -----------------------------------------------------------------
# 5. Restart cleanly.
# -----------------------------------------------------------------
heading "Restarting"

if command -v pm2 >/dev/null 2>&1; then
  # jdk-backend/jdk-frontend is the old two-app name from before this
  # became a single combined service -- harmless no-op if not present.
  pm2 delete jdk-backend jdk-frontend jdk >/dev/null 2>&1 || true
  pm2 start ecosystem.config.js
  pm2 save
  ok "pm2 service (re)started."
else
  fail "pm2 not found -- start the backend/frontend manually."
  exit 1
fi

info "Waiting 5 seconds for both processes to come up..."
sleep 5

# -----------------------------------------------------------------
# 6. Live health checks -- not just "pm2 says online."
# -----------------------------------------------------------------
heading "Health checks"

if curl -fsS "http://localhost:${BACKEND_PORT}/api/health" >/dev/null 2>&1; then
  ok "Backend answers on http://localhost:${BACKEND_PORT}/api/health"
else
  fail "Backend did NOT answer on http://localhost:${BACKEND_PORT}/api/health"
  fail "Check: pm2 logs jdk --lines 30"
  PROBLEMS=$((PROBLEMS+1))
fi

FRONTEND_RESPONSE=$(curl -fsS -o /dev/null -w "%{http_code}" "http://localhost:${FRONTEND_PORT}/" 2>/dev/null || echo "000")
if [[ "$FRONTEND_RESPONSE" == "200" ]]; then
  ok "Frontend answers on http://localhost:${FRONTEND_PORT}/"
else
  fail "Frontend did NOT answer cleanly on http://localhost:${FRONTEND_PORT}/ (got HTTP ${FRONTEND_RESPONSE})"
  fail "Check: pm2 logs jdk --lines 30"
  PROBLEMS=$((PROBLEMS+1))
fi

CSP_HEADER=$(curl -fsS -D - -o /dev/null "http://localhost:${FRONTEND_PORT}/" 2>/dev/null | grep -i "content-security-policy" || true)
if [[ -n "$CSP_HEADER" && -n "$ECOSYSTEM_API_BASE_URL" ]]; then
  if [[ "$CSP_HEADER" == *"$ECOSYSTEM_API_BASE_URL"* ]]; then
    ok "Frontend's CSP header correctly allows connecting to ${ECOSYSTEM_API_BASE_URL}."
  else
    fail "Frontend's CSP header does NOT list ${ECOSYSTEM_API_BASE_URL} -- the browser will block API calls even if everything else is fine."
    PROBLEMS=$((PROBLEMS+1))
  fi
fi

# -----------------------------------------------------------------
# 7. Summary.
# -----------------------------------------------------------------
heading "Summary"

if [[ "$PROBLEMS" -eq 0 ]]; then
  ok "Everything checks out. Backend and frontend should be reachable and able to talk to each other."
else
  fail "${PROBLEMS} issue(s) found above -- see the warnings/failures for exactly what to fix."
fi
