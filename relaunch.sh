#!/usr/bin/env bash
#
# Rebuilds and restarts jdk_clean's backend + frontend (run together as
# a single pm2 service, 'jdk' -- see ecosystem.config.js and
# scripts/run-all.mjs).
#
# Deliberately plain: stop, reinstall/rebuild, start, tail logs -- one
# real command per step, nothing hidden behind custom cross-checking
# logic. If a step fails, `set -e` stops the script right there and you
# see that exact command's own real error, not a wrapper's
# interpretation of it. A previous version of this script tried to
# automatically cross-check .env/ecosystem.config.js consistency and
# find stray processes squatting on the ports (relying on sudo,
# python3, and GNU-only grep -P all being present and behaving the same
# way on whatever box it ran on) and became more fragile than the
# problems it was checking for -- see README.md's "Relaunching cleanly"
# for the manual troubleshooting steps that replaced it, if this script
# itself fails.
#
# Usage: ./relaunch.sh   (run from the repo root)

set -euo pipefail

if [[ -t 1 ]]; then
  BOLD=$'\033[1m'; RESET=$'\033[0m'; BLUE=$'\033[34m'
else
  BOLD=""; RESET=""; BLUE=""
fi

step() { printf '\n%s\n' "${BOLD}${BLUE}==>${RESET} ${BOLD}$*${RESET}"; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

step "1/6: pm2 stop jdk"
pm2 stop jdk

step "2/6: Backend dependencies (backend/venv)"
(cd backend && source venv/bin/activate && pip install -r requirements.txt)

step "3/6: Frontend dependencies (frontend/node_modules)"
(cd frontend && npm install)

step "4/6: Frontend build (frontend/dist)"
(cd frontend && npm run build)

step "5/6: pm2 restart jdk --update-env"
pm2 restart jdk --update-env

step "6/6: Recent logs"
pm2 logs jdk --lines 50 --nostream

printf '\n%s\n' "${BOLD}Done.${RESET} Confirm it's actually serving, not just \"online\":"
printf '  curl -i http://localhost:8000/api/health\n'
printf '  curl -i http://localhost:4173/\n'
printf '(swap in your real ports from ecosystem.config.js if different)\n'
