#!/usr/bin/env node
/**
 * Minimal, dependency-free production static file server for dist/.
 *
 * Deliberately doesn't use a third-party static-server package: at the
 * time this was written, the obvious choice (`serve`) pulled in a
 * transitively vulnerable `minimatch`/`brace-expansion` (DoS via
 * unbounded regex expansion, GHSA-mh99-v99m-4gvg) with no fixed release
 * available. A few dozen lines of Node's own `http`/`fs`/`zlib` avoids
 * that supply-chain surface entirely while giving us exact control over
 * caching, compression, and security headers.
 *
 * Usage: node scripts/serve-static.mjs [port]
 * Env:   PORT          -- listen port (default 4173)
 *        API_BASE_URL  -- backend origin, for the CSP connect-src.
 *                         Falls back to reading VITE_API_BASE_URL out of
 *                         .env if not set explicitly.
 */
import { createServer } from 'node:http'
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs'
import { extname, join, normalize, resolve, sep } from 'node:path'
import { createGzip } from 'node:zlib'
import { fileURLToPath } from 'node:url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const DIST_DIR = resolve(__dirname, '..', 'dist')
const ASSETS_DIR = join(DIST_DIR, 'assets') + sep
const PORT = Number(process.env.PORT || process.argv[2] || 4173)

if (!existsSync(DIST_DIR)) {
  console.error(`dist/ not found at ${DIST_DIR} -- run "npm run build" first.`)
  process.exit(1)
}

function readApiBaseUrl() {
  if (process.env.API_BASE_URL) return process.env.API_BASE_URL
  try {
    const envFile = readFileSync(resolve(__dirname, '..', '.env'), 'utf8')
    const match = envFile.match(/^VITE_API_BASE_URL=(.+)$/m)
    return match ? match[1].trim() : ''
  } catch {
    return ''
  }
}

const API_BASE_URL = readApiBaseUrl()

const CSP = [
  "default-src 'self'",
  `connect-src 'self'${API_BASE_URL ? ` ${API_BASE_URL}` : ''}`,
  "img-src 'self' data:",
  // framer-motion animates via inline `style="..."` attributes, which
  // style-src governs -- 'unsafe-inline' here is a much narrower
  // allowance than in script-src and is the standard tradeoff for
  // JS-driven animation libraries.
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self'",
  "font-src 'self'",
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
    // SPA fallback: any path that isn't a real file (e.g. /dashboard on
    // a hard refresh) serves index.html so client-side routing handles it.
    filePath = join(DIST_DIR, 'index.html')
    stat = statSync(filePath)
  }

  const ext = extname(filePath)
  res.setHeader('Content-Type', MIME_TYPES[ext] || 'application/octet-stream')

  // Vite fingerprints asset filenames with a content hash, so they're
  // safe to cache forever; index.html must always revalidate since it's
  // what references the current hash.
  res.setHeader(
    'Cache-Control',
    filePath.startsWith(ASSETS_DIR) ? 'public, max-age=31536000, immutable' : 'no-cache',
  )

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
  console.log(`Serving dist/ on http://localhost:${PORT}`)
})
