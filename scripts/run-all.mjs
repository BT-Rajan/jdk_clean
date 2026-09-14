#!/usr/bin/env node
/**
 * Single-process launcher for pm2: runs the backend (uvicorn), the
 * frontend static server (frontend/scripts/serve-static.mjs), and the
 * mobile PWA static server (mobile-app-rn/scripts/serve-static.mjs) as
 * child processes under one parent, so pm2 manages jdk_clean as ONE
 * service ('jdk' in ecosystem.config.js) instead of three separate apps.
 *
 * All three children's stdout/stderr are forwarded to this process's
 * own (prefixed with [backend]/[frontend]/[mobile]), so `pm2 logs jdk`
 * still shows all of them. If any child exits unexpectedly, this
 * process tears the others down and exits non-zero too -- pm2's
 * autorestart then brings the whole group back up together rather than
 * leaving some running without the others.
 *
 * Usage: node scripts/run-all.mjs   (run from the repo root; see
 *        ecosystem.config.js, which sets cwd there)
 * Env:   BACKEND_PORT   -- port uvicorn listens on (default 8000)
 *        FRONTEND_PORT  -- port the frontend static file server listens on (default 4173)
 *        MOBILE_PORT    -- port the mobile PWA static file server listens on (default 4174)
 *        API_BASE_URL   -- backend origin, passed through to both static
 *                           servers for their CSP connect-src
 */
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const ROOT = resolve(__dirname, '..')
const BACKEND_DIR = resolve(ROOT, 'backend')
const FRONTEND_DIR = resolve(ROOT, 'frontend')
const MOBILE_DIR = resolve(ROOT, 'mobile-app-rn')

const BACKEND_PORT = process.env.BACKEND_PORT || '8000'
const FRONTEND_PORT = process.env.FRONTEND_PORT || '4173'
const MOBILE_PORT = process.env.MOBILE_PORT || '4174'

const children = []
let shuttingDown = false

function logPrefixed(name, stream, data) {
  const target = stream === 'stderr' ? process.stderr : process.stdout
  for (const line of data.toString().split('\n')) {
    if (line.length > 0) target.write(`[${name}] ${line}\n`)
  }
}

function spawnChild(name, command, args, opts) {
  const child = spawn(command, args, { ...opts, stdio: ['ignore', 'pipe', 'pipe'] })
  child.stdout.on('data', (data) => logPrefixed(name, 'stdout', data))
  child.stderr.on('data', (data) => logPrefixed(name, 'stderr', data))
  child.on('error', (err) => {
    console.error(`[${name}] failed to start: ${err.message}`)
    shutdown(1)
  })
  child.on('exit', (code, signal) => {
    if (shuttingDown) return
    console.error(`[${name}] exited unexpectedly (code=${code}, signal=${signal}) -- stopping the other process too.`)
    shutdown(1)
  })
  children.push(child)
  return child
}

function shutdown(exitCode) {
  if (shuttingDown) return
  shuttingDown = true
  for (const child of children) {
    if (child.exitCode === null && !child.killed) child.kill('SIGTERM')
  }
  // Give children a moment to exit cleanly before this process itself
  // exits (pm2 sends SIGKILL to anything still alive after its own
  // kill_timeout if we don't).
  setTimeout(() => process.exit(exitCode ?? 0), 2000)
}

process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))

spawnChild(
  'backend',
  resolve(BACKEND_DIR, 'venv', 'bin', 'uvicorn'),
  ['app.main:app', '--host', '0.0.0.0', '--port', BACKEND_PORT],
  { cwd: BACKEND_DIR, env: { ...process.env, PYTHONUNBUFFERED: '1' } },
)

spawnChild(
  'frontend',
  process.execPath,
  ['scripts/serve-static.mjs'],
  { cwd: FRONTEND_DIR, env: { ...process.env, PORT: FRONTEND_PORT } },
)

spawnChild(
  'mobile',
  process.execPath,
  ['scripts/serve-static.mjs'],
  { cwd: MOBILE_DIR, env: { ...process.env, PORT: MOBILE_PORT } },
)
