#!/usr/bin/env node
/**
 * Single-process launcher for pm2: runs the backend (uvicorn) and the
 * frontend static server (frontend/scripts/serve-static.mjs) as child
 * processes under one parent, so pm2 manages jdk_clean as ONE service
 * ('jdk' in ecosystem.config.js) instead of two separate apps.
 *
 * Both children's stdout/stderr are forwarded to this process's own
 * (prefixed with [backend]/[frontend]), so `pm2 logs jdk` still shows
 * both. If either child exits unexpectedly, this process tears the
 * other one down and exits non-zero too -- pm2's autorestart then
 * brings the whole pair back up together rather than leaving one half
 * running without the other.
 *
 * Usage: node scripts/run-all.mjs   (run from the repo root; see
 *        ecosystem.config.js, which sets cwd there)
 * Env:   BACKEND_PORT   -- port uvicorn listens on (default 8000)
 *        FRONTEND_PORT  -- port the static file server listens on (default 4173)
 *        API_BASE_URL   -- backend origin, passed through to serve-static.mjs
 *                           for its CSP connect-src
 */
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const ROOT = resolve(__dirname, '..')
const BACKEND_DIR = resolve(ROOT, 'backend')
const FRONTEND_DIR = resolve(ROOT, 'frontend')

const BACKEND_PORT = process.env.BACKEND_PORT || '8000'
const FRONTEND_PORT = process.env.FRONTEND_PORT || '4173'

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
