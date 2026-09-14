#!/usr/bin/env node
/**
 * Minimal, dependency-free production static file server for dist/ (the
 * output of `npm run build:web`, i.e. `expo export --platform web`).
 *
 * A near-exact port of frontend/scripts/serve-static.mjs -- same
 * rationale for hand-rolling this instead of a third-party static-server
 * package (see that file's header). The one structural difference is
 * which directories are safe to cache forever: Expo's web export
 * content-hashes filenames under `_expo/` (the JS bundle) and `assets/`
 * (fonts/images), rather than Vite's single hashed `assets/` dir.
 *
 * Usage: node scripts/serve-static.mjs [port]
 * Env:   PORT          -- listen port (default 4174)
 *        API_BASE_URL  -- backend origin, for the CSP connect-src.
 *                         Falls back to reading EXPO_PUBLIC_API_BASE_URL
 *                         out of .env if not set explicitly.
 */
import { createServer } from 'node:http'
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs'
import { extname, join, normalize, resolve, sep } from 'node:path'
import { createGzip } from 'node:zlib'
import { fileURLToPath } from 'node:url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const DIST_DIR = resolve(__dirname, '..', 'dist')
const HASHED_DIRS = [join(DIST_DIR, '_expo') + sep, join(DIST_DIR, 'assets') + sep]
const PORT = Number(process.env.PORT || process.argv[2] || 4174)

if (!existsSync(DIST_DIR)) {
  console.error(`dist/ not found at ${DIST_DIR} -- run "npm run build:web" first.`)
  process.exit(1)
}

function readApiBaseUrl() {
  if (process.env.API_BASE_URL) return process.env.API_BASE_URL
  try {
    const envFile = readFileSync(resolve(__dirname, '..', '.env'), 'utf8')
    const match = envFile.match(/^EXPO_PUBLIC_API_BASE_URL=(.+)$/m)
    return match ? match[1].trim() : ''
  } catch {
    return ''
  }
}

const API_BASE_URL = readApiBaseUrl()

const CSP = [
  "default-src 'self'",
  `connect-src 'self'${API_BASE_URL ? ` ${API_BASE_URL}` : ''}`,
  // src/components/Logo.tsx fetches the org logo straight from the
  // backend (an unauthenticated <img>, not a fetch() call) -- needs the
  // backend origin here too, not just in connect-src.
  `img-src 'self' data: blob:${API_BASE_URL ? ` ${API_BASE_URL}` : ''}`,
  // react-native-web renders most styling as inline `style="..."`
  // attributes rather than stylesheet rules -- 'unsafe-inline' here is
  // the standard tradeoff for that (same rationale as frontend's
  // framer-motion note in its own serve-static.mjs).
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self'",
  "font-src 'self'",
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
].join('; ')

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Content-Security-Policy': CSP,
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
}

const COMPRESSIBLE = new Set(['.html', '.js', '.mjs', '.css', '.json', '.svg', '.txt'])

/** Resolves a request path against DIST_DIR and refuses to serve
 * anything that escapes it (e.g. via `..` segments). */
function safeJoin(root, requestPath) {
  let decoded
  try {
    decoded = decodeURIComponent(requestPath.split('?')[0])
  } catch {
    return null
  }
  const normalized = normalize(join(root, decoded))
  if (normalized !== root && !normalized.startsWith(root + sep)) return null
  return normalized
}

const server = createServer((req, res) => {
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    res.setHeader(key, value)
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' }).end('Method not allowed')
    return
  }

  let filePath = safeJoin(DIST_DIR, req.url || '/')
  if (!filePath) {
    res.writeHead(400).end('Bad request')
    return
  }

  let stat = existsSync(filePath) ? statSync(filePath) : null
  if (!stat || stat.isDirectory()) {
    // SPA fallback: any path that isn't a real file serves index.html so
    // client-side routing (and a hard refresh mid-navigation) still works.
    filePath = join(DIST_DIR, 'index.html')
    stat = statSync(filePath)
  }

  const ext = extname(filePath)
  res.setHeader('Content-Type', MIME_TYPES[ext] || 'application/octet-stream')

  // _expo/ and assets/ are content-hashed by Expo's exporter, so they're
  // safe to cache forever; everything else at dist's root (index.html,
  // manifest.json, sw.js, icons) isn't hashed and must always revalidate
  // -- sw.js especially, since a stale cached copy would keep an old
  // service worker in control indefinitely.
  const isHashed = HASHED_DIRS.some((dir) => filePath.startsWith(dir))
  res.setHeader('Cache-Control', isHashed ? 'public, max-age=31536000, immutable' : 'no-cache')

  const acceptsGzip = (req.headers['accept-encoding'] || '').includes('gzip')
  if (req.method === 'HEAD') {
    res.writeHead(200)
    res.end()
    return
  }

  if (acceptsGzip && COMPRESSIBLE.has(ext)) {
    res.setHeader('Content-Encoding', 'gzip')
    res.writeHead(200)
    createReadStream(filePath).pipe(createGzip()).pipe(res)
  } else {
    res.setHeader('Content-Length', stat.size)
    res.writeHead(200)
    createReadStream(filePath).pipe(res)
  }
})

server.listen(PORT, () => {
  // No host given to listen() -- Node defaults to all interfaces (0.0.0.0
  // / ::), so this is reachable from wherever the machine's real IP/
  // domain resolves, not just from this machine itself.
  console.log(`Serving dist/ on http://0.0.0.0:${PORT} (reachable at this machine's real IP/domain too, not just localhost)`)
})
