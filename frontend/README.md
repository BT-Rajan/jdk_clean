# JDK ERP — Frontend

A React 19 + TypeScript + Vite frontend for the [`jdk_clean`](../backend)
manufacturing ERP backend. This first slice covers authentication end to
end: login, session persistence, protected routing, and password change.
The rest of the ERP (customers, orders, quotations, inventory, BOM) is
built on top of the same design system and API layer next.

> Prefer the one-command path? See [`../install.sh`](../install.sh) and the
> [repo root README](../README.md) — it sets up the backend, this frontend,
> and pm2 together, interactively. What follows is the manual version.

## Design

**"Obsidian & Champagne"** — a dark, glassmorphic theme: deep ink
backgrounds with ambient gold/violet glow, frosted `backdrop-blur` panels,
Playfair Display for headings, Inter for everything else. All of it lives
in reusable primitives (`src/components/ui`) so later pages (orders,
inventory, etc.) get the same look for free instead of restyling from
scratch.

## Stack

- **React 19 + TypeScript**, Vite 8 (Rolldown-based bundler)
- **Tailwind CSS v4** (CSS-first config, see `src/index.css`)
- **React Router 7** for routing/guards
- **react-hook-form + zod** for validated forms
- **axios** for the API client, with token-refresh handled transparently
- **framer-motion** for the subtle motion/luxury feel
- Self-hosted fonts via `@fontsource` (no third-party font requests)

## Requirements

- Node.js 20+
- The `jdk_clean` backend running and reachable (see `../backend/README.md`)

## Installation

```bash
cd frontend
npm install
cp .env.example .env
```

Edit `.env` to point at your backend:

```env
VITE_API_BASE_URL=http://localhost:8000
```

Make sure the backend's `CORS_ORIGINS` includes this app's dev origin
(`http://localhost:5173` by default) — see `../backend/.env.example`.

```bash
npm run dev
```

Open `http://localhost:5173`. You'll land on `/login`; use the bootstrap
admin credentials you set up on the backend (see
`../backend/README.md#installation`, step 6 — `scripts/seed_admin.py`),
then change the password — the app has a "Change password" flow built in
for exactly this.

## Scripts

| Command           | What it does                                  |
| ------------------ | ---------------------------------------------- |
| `npm run dev`      | Start the Vite dev server with HMR             |
| `npm run build`    | Type-check (`tsc -b`) then production build    |
| `npm run preview`  | Preview the production build locally (dev use only, see "Deploying") |
| `npm run serve`    | Serve the production build the way pm2/production does |
| `npm run lint`     | Run oxlint                                     |

## How auth is wired

- **Access token**: kept **only in memory** (a plain module variable in
  `src/api/tokenStore.ts`), never written to `localStorage`/`sessionStorage`.
  It vanishes on reload, which is intentional — it's short-lived by design.
- **Refresh token**: the backend returns it in the JSON response body
  (not an httpOnly cookie), so pure client-side JS has no fully-secure
  place to put it. We use `sessionStorage` (cleared when the tab closes)
  rather than `localStorage`, to bound the exposure window. This tradeoff
  is documented in `src/lib/storage.ts` — if the backend later moves to an
  httpOnly/Secure/SameSite cookie for the refresh token, that one file
  becomes a no-op and nothing else needs to change.
- **Silent refresh on load**: if a refresh token survives in
  `sessionStorage`, the app exchanges it for a new access token on
  startup (`AuthProvider`) instead of forcing a re-login every reload.
- **Refresh-and-retry on 401**: `src/api/client.ts`'s response interceptor
  catches a `401`, refreshes once (single-flight — concurrent 401s share
  one refresh call), retries the original request, and only drops the
  session if the refresh itself fails. The `/login` and `/refresh`
  endpoints are explicitly excluded from this to avoid recursion.
- **Route guards**: `ProtectedRoute` redirects unauthenticated users to
  `/login` (remembering where they were headed); `PublicOnlyRoute` bounces
  an already-logged-in user away from `/login` straight to `/dashboard`.
- **Password change** logs the session out locally right after success,
  matching the backend's behavior of revoking all outstanding refresh
  tokens for that user on a password change.

## Security notes

- No secrets live in this codebase or its build output — only the public
  API base URL, inlined at build time via `VITE_...` env vars.
- CSRF is a non-issue here: auth is a bearer token sent explicitly in the
  `Authorization` header, not an ambient cookie the browser attaches
  automatically to cross-site requests.
- Errors shown to the user come only from the backend's own safe,
  pre-written `{"error": "..."}` messages (see `src/lib/apiError.ts`) —
  raw exception details are never surfaced in the UI.
- `index.html` sends `noindex, nofollow` — this is an internal app, not
  meant to be crawled.
- The dev server sets baseline hardening headers
  (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`).
  In production, `scripts/serve-static.mjs` sets those plus a real
  `Content-Security-Policy` — see "Deploying" below.
- Run `npm audit` periodically. As of this writing there's one open
  advisory on `react-router` (GHSA-qwww-vcr4-c8h2) affecting its RSC
  (React Server Components) mode — not applicable here, since this is a
  plain client-side SPA that never uses RSC/server actions.

## Deploying

`npm run build` produces `dist/` — static files, no server-side rendering.
Two ways to serve them:

**`npm run serve`** (what pm2 uses) runs `scripts/serve-static.mjs`, a
~150-line static file server built on nothing but Node's own
`http`/`fs`/`zlib`. It exists instead of a third-party package
(e.g. `serve`) because at the time this was built, `serve`'s dependency
tree pulled in a `minimatch`/`brace-expansion` version with an open DoS
advisory and no fixed release available — not something to ship for a
production server component over a few dozen lines of stdlib code we can
fully read. It handles:

- gzip compression for text assets (when the client supports it)
- `Cache-Control: public, max-age=31536000, immutable` on Vite's
  content-hashed `assets/*` files; `no-cache` on `index.html` (which
  always needs to point at the current hash)
- SPA fallback (any non-file route serves `index.html`, so a hard
  refresh on `/dashboard` works)
- Path-traversal protection (requests can't escape `dist/`)
- Security headers, including a real `Content-Security-Policy` built
  from `API_BASE_URL` (env var, falls back to `VITE_API_BASE_URL` in
  `.env`) so `connect-src` matches wherever the app actually calls

```bash
npm run build
API_BASE_URL=http://localhost:8000 PORT=4173 npm run serve
```

**`npm run preview`** (`vite preview`) is what the Installation section
above uses to sanity-check a build locally. Vite's own docs say it isn't
meant for production use (no real caching/compression control) — that's
why pm2 is wired to `npm run serve` instead, via
`../ecosystem.config.js` (generated by `../install.sh`).

If you're fronting this with a reverse proxy/CDN anyway (recommended for
TLS termination), it's fine to let that layer handle compression/caching
and simplify `serve-static.mjs` down to path-safe file serving — the
important parts to keep either way are the CSP's `connect-src` matching
your real API origin and the SPA fallback.

## Performance notes

- Routes are code-split with `React.lazy` — `/login` (the most common
  first screen) ships in the main bundle; `/dashboard`,
  `/change-password`, and the 404 page load on demand.
- Vendor code is split into cacheable chunks (`vendor-react`,
  `vendor-motion`, `vendor-forms`) so a deploy that only touches app code
  doesn't invalidate the browser's cache of React/framer-motion/etc.
- Fonts are self-hosted and trimmed to the Latin subset only (no
  cyrillic/greek/vietnamese glyphs shipped for an English-only app).
- Possible follow-up if the bundle needs to shrink further:
  framer-motion's `LazyMotion` + `domAnimation` feature bundle trims its
  ~125kB chunk down substantially for apps that only use basic
  hover/tap/fade animations (which is all this app currently does).

## Project layout

```
scripts/
  serve-static.mjs   # zero-dependency production static server (see Deploying)
src/
  api/          # axios client + token store + typed endpoint functions
  components/
    layout/      # AuthLayout, AppLayout, AmbientBackground, FullScreenLoader
    ui/          # Button, TextField, PasswordField, GlassCard, Alert, Spinner, Logo
  context/       # AuthContext + AuthProvider
  hooks/         # useAuth
  lib/           # validation (zod), api error mapping, storage, classnames
  pages/         # LoginPage, ChangePasswordPage, DashboardPage, NotFoundPage
  routes/        # ProtectedRoute, PublicOnlyRoute
  types/         # types mirroring the backend's Pydantic schemas
```
