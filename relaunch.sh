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
(
  cd backend
  # Skip the reinstall once requirements.txt hasn't changed since the
  # last time it was actually installed into this venv -- same sha256-
  # next-to-the-venv check install.sh uses, so a plain restart doesn't
  # pay pip's full resolve-and-check cost every single time.
  REQUIREMENTS_HASH_FILE="venv/.requirements.sha256"
  REQUIREMENTS_HASH="$(sha256sum requirements.txt | awk '{print $1}')"
  if [[ -f "$REQUIREMENTS_HASH_FILE" && "$(cat "$REQUIREMENTS_HASH_FILE")" == "$REQUIREMENTS_HASH" ]]; then
    echo "requirements.txt unchanged -- skipping pip install."
  else
    source venv/bin/activate
    pip install -r requirements.txt
    echo "$REQUIREMENTS_HASH" > "$REQUIREMENTS_HASH_FILE"
  fi
)

step "3/6: Frontend dependencies (frontend/node_modules)"
(
  cd frontend
  # Same sha256-next-to-the-install-dir skip check as the backend's
  # requirements.txt in step 2 -- npm install is the slowest step in
  # this whole script, so skip it outright once package-lock.json
  # (the actual source of truth for what gets installed) hasn't
  # changed since the last time it succeeded.
  PACKAGE_LOCK_HASH_FILE="node_modules/.package-lock.sha256"
  PACKAGE_LOCK_HASH="$(sha256sum package-lock.json | awk '{print $1}')"
  if [[ -d node_modules && -f "$PACKAGE_LOCK_HASH_FILE" && "$(cat "$PACKAGE_LOCK_HASH_FILE")" == "$PACKAGE_LOCK_HASH" ]]; then
    echo "package-lock.json unchanged -- skipping npm install."
  else
    npm install
    echo "$PACKAGE_LOCK_HASH" > "$PACKAGE_LOCK_HASH_FILE"
  fi
)

step "4/6: Frontend build (frontend/dist)"
# tsc -b's incremental build cache (node_modules/.tmp/*.tsbuildinfo) can
# reference file states from before this pull landed, producing
# confusing type errors on an otherwise-clean checkout -- cheap to
# clear, no downside, and has fixed real "build suddenly fails" reports.
(cd frontend && rm -rf node_modules/.tmp && npm run build)

step "5/6: pm2 restart jdk --update-env"
pm2 restart jdk --update-env

step "6/6: Recent logs"
pm2 logs jdk --lines 50 --nostream

printf '\n%s\n' "${BOLD}Done.${RESET} Confirm it's actually serving, not just \"online\":"
printf '  curl -i http://localhost:8000/api/health\n'
printf '  curl -i http://localhost:4173/\n'
printf '(swap in your real ports from ecosystem.config.js if different)\n'
