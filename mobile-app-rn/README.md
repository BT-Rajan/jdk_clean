# JDK Quick Quote — React Native app

A native (Expo) rewrite of the mobile microsite: same sales-user login,
same Quick Quote (feasibility → auto-quote / admin-notify) flow, plus
full **Client CRUD** — list, search, create, edit, delete/restore —
wired to the real `jdk_clean` backend. No mock data anywhere.

Styled to match the web app's design system exactly, not approximated
from scratch — every token and component below is a direct port:

| Web app source | Ported to |
|---|---|
| `frontend/src/index.css` `@theme` block (ink/gold palette, fonts, glow shadow) | `src/theme.ts` |
| `components/ui/Button.tsx` | `src/components/Button.tsx` |
| `components/ui/TextField.tsx` | `src/components/TextField.tsx` |
| `components/ui/SelectField.tsx` | `src/components/SelectField.tsx` (modal picker — RN has no `<select>`) |
| `components/ui/Alert.tsx` | `src/components/Alert.tsx` |
| `components/layout/AuthLayout.tsx` glass panel | `src/components/GlassCard.tsx` |
| `components/ui/Logo.tsx` (dynamic org logo + fallback wordmark) | `src/components/Logo.tsx` |
| `pages/LoginPage.tsx` copy/layout | `src/screens/LoginScreen.tsx` |

## Date field — usability-first

`src/components/DateField.tsx` replaces the old plain-text date input:

- **Android** opens the OS's own native calendar dialog — the picker
  Android users already know, rather than a custom sheet fighting the
  platform.
- **iOS** opens a themed bottom sheet with an inline calendar (dark,
  gold accent to match the app) plus a **Done** button, since iOS's
  inline picker updates live and needs an explicit confirm step.
- **Quick-pick chips** — Today / Tomorrow / In 3 days / In 1 week / In
  2 weeks — sit above the calendar on both platforms' sheets where
  applicable, so the lead times a sales rep hears most ("they need it
  by next week") are one tap instead of a full date-picker round trip.
- **Can't select a past date** — `minimumDate` is wired to today,
  matching the backend's `not_in_past` validator on
  `required_by_date`, so the error surfaces before submit instead of
  as a rejected API call.
- Display format is localized and human-readable ("Fri, 20 Sep 2026"),
  not a raw ISO string; the ISO conversion for the API call happens
  from local date parts (not `toISOString()`, which converts to UTC
  first and can silently roll the date back a day in the evening for
  anyone west of UTC).

Run `npx expo install @react-native-community/datetimepicker` after
`npm install` if Expo flags a version mismatch for your SDK — the
version pinned in `package.json` matches Expo SDK 51 at time of
writing, but Expo's installer always resolves the exact match for
whatever SDK you're actually on.

**Two things are intentionally *not* pixel-exact**, both flagged in
code comments where they occur, because they rely on web-only CSS with
no direct RN equivalent:
- `backdrop-filter` (glassmorphism blur) → approximated as translucent
  fill + border. Real blur is possible via `expo-blur` if you want it
  closer; not added here to keep the dependency list lean.
- Gradient-clipped "text-gradient-gold" text (used in the web Logo's
  text fallback and marketing copy) → approximated as flat gold text.
  A true gradient-text needs `@react-native-masked-view` wrapping a
  `LinearGradient`; easy to add if you want it.

## What's in it

```
App.tsx                        font loading, splash screen, providers
src/theme.ts                   colors/fonts/radii ported from index.css
src/api/client.ts              fetch wrapper: bearer auth, 401→refresh→logout; uploadFile/downloadAndOpenFile/viewFile for binary endpoints
src/api/auth.ts                POST /api/auth/login, GET /api/auth/me, GET /api/auth/me/history
src/api/customers.ts           full Customer onboarding (create/edit/delete/restore/activate, credit status, id document, onboarding-status transitions)
src/api/catalog.ts             products, feasibility, quotations
src/context/AuthContext.tsx    session state, persisted via AsyncStorage
src/i18n/translations.ts       EN/AR string dictionaries (typed -- ar must match en's exact shape)
src/i18n/LocaleContext.tsx     t(), locale persistence, RTL (see "Bilingual (EN/AR)" below)
src/components/                Button, TextField, SelectField, Alert, GlassCard, Logo, SplashView, IdDocumentPanel, StatusBadge, StatusTransitionButtons
src/screens/LoginScreen.tsx           EN/AR toggle lives here
src/screens/HomeScreen.tsx            product image scroller + feature tile grid (Quick Quote/Clients/Product Catalog wired or mocked "coming soon"; 2 generic placeholder tiles for what's left)
src/screens/QuickQuoteScreen.tsx      client+product+qty+date → yes/no → quote (+ PDF download) or admin-notify
src/screens/ClientsListScreen.tsx     searchable client list, edit/disable row icons
src/screens/ClientFormScreen.tsx      new-client wizard + edit/onboarding-status/id-document/credit-status/delete (see "Wiring" below)
src/screens/ClientHistoryScreen.tsx   a client's quotation ("order") history
src/screens/MyHistoryScreen.tsx       the signed-in user's own action history, current calendar month only
src/navigation/RootNavigator.tsx      auth gate → drawer (Home/Enquiry/Clients/History); `linking` config maps screens to URLs so the phone's back button navigates in-app
src/navigation/DrawerContent.tsx      custom drawer list (Enquiry, Clients, History) + pinned Logout footer
src/navigation/HeaderTitle.tsx        company logo + name, shown in the drawer's header
```

## Wiring — how each screen maps to the backend

**Login** — `POST /api/auth/login` (same credentials as the web app;
same role/department permission matrix applies).

**Quick Quote** (unchanged logic from the HTML version, just native UI):
1. `GET /api/customers`, `GET /api/products` to populate the pickers.
2. `POST /api/feasibility` → `POST /api/feasibility/{id}/run`.
3. `status === "feasible"` → **Yes** → `POST /api/quotations` (unit
   price pulled from the product's master `selling_price`, 0%
   discount) → shows the quotation number/total, with a **Download
   PDF** button (`GET /api/quotations/{id}/pdf` — the same
   admin-templated, LibreOffice-rendered PDF as the web app's Print
   button and the emailed quotation attachment). Downloading is
   platform-split in `api/client.ts`'s `downloadAndOpenFile`: on
   web/PWA it's a normal browser "Save As" via a Blob + temporary
   `<a download>`; on native there's no browser download tray, so it
   saves to the app's cache dir (`expo-file-system`) and opens the OS
   share sheet (`expo-sharing`) instead, which covers "save"/"open
   in..." the same way.
4. Otherwise → **No** → `POST /api/feasibility/{id}/exception` with
   `approve: true`, which sets `admin_review_required` on that
   feasibility check — the same flag that already drives the admin's
   live Notifications feed (`notification_service.get_notifications`).
   Nothing new to build on the notification side.

**Clients** — full CRUD against `/api/customers`, matching the web app's
customer onboarding feature-for-feature (`ClientFormScreen.tsx` plays
both CustomerOnboardingWizardPage's and CustomerFormPage's roles,
picking one by whether `route.params.customerId` is set):
- List: `GET /api/customers?search=&page_size=100`
- **Create** → a 5-step wizard (Type → Company Details → Contact &
  Address → Financial Terms → Review), mirroring
  `CustomerOnboardingWizardPage` step-for-step: `code` (Civil ID /
  registration number) is required here (unlike the plain `POST
  /api/customers` schema, which allows a null `code` for a prospective
  customer created some other way), and the Company Details step
  includes an id document picker (`expo-document-picker`) — the file
  is only uploaded via `POST /api/customers/{id}/id-document` *after*
  `POST /api/customers` returns an id, same two-step sequence as the
  web wizard. Every field is validated client-side against the same
  max-lengths as `backend/app/schemas/customer.py` /
  `frontend/src/lib/validation/customer.ts`. On success, lands on that
  same client's edit screen (mirrors the web wizard navigating to
  `/customers/:id`) rather than just going back to the list.
- **Edit** → `GET /api/customers/{id}` then `PUT /api/customers/{id}`.
  `name` is locked (backend's `CustomerUpdate` omits it); `code` is
  locked *once set*, but if it's still null (a prospective customer)
  there's an inline "complete it now" mini-form that calls `PUT` with
  just `{code}}`, same one-directional rule and same UX as
  `CustomerFormPage`'s `handleCompleteCode`. `customer_type` **is**
  sent on every other edit — it's editable at any time per the
  backend schema, unlike name/code.
  Below the form (only once a customer id exists): a **credit status**
  card (`GET /api/customers/{id}/credit`, with the same "id isn't
  verified yet" warning the web detail page shows once a credit limit
  is set); an **id document** panel to view/replace/remove the
  document and mark it verified/unverified
  (`POST|DELETE /api/customers/{id}/id-document`,
  `POST /api/customers/{id}/verify-id` / `.../unverify-id` — viewing
  opens the file inline on web, saves-and-shares on native, same
  platform split as the Quick Quote PDF download); and an
  **onboarding** section with the same reason-gated status transition
  buttons as the web detail page
  (`POST /api/customers/{id}/onboarding-status`,
  transitions mirrored from `ONBOARDING_ALLOWED_TRANSITIONS` in
  `backend/app/models/customer.py`).
- Delete: `DELETE /api/customers/{id}` (soft delete — `restoreCustomer`
  in `api/customers.ts` is there if you want to add an "undo"/trash
  view later; not wired into a screen yet)

**History** (drawer item, `MyHistoryScreen.tsx`) — `GET
/api/auth/me/history`, a new endpoint (there's no web equivalent):
every audit-log row this signed-in user has personally generated
(`changed_by` = them), across every table, restricted server-side to
the current calendar month (`audit_service.get_my_history` — pass
`?month=YYYY-MM` to look at a different one, though this screen
doesn't build a month picker, it just shows "now"). Deliberately
scoped this way rather than reusing `GET /{resource}/{id}/history`
(one record's trail, any actor) — this is the opposite shape, one
actor's trail across every record they've touched.

## Progressive Web App (mobile Chrome)

This app also runs as an installable PWA — same login/Quick Quote/Clients
code, no separate build, served over the web and installable from
Chrome's "Add to Home screen" / install prompt on Android and desktop
(iOS Safari/Chrome use the manual "Add to Home Screen" share-sheet
action instead, since iOS doesn't support the install prompt API).

**If you're running the whole repo under pm2** (see the root
[README.md](../README.md#running-with-pm2)), `install.sh`/`relaunch.sh`
already build and serve this automatically — the pm2 service's
**mobile** child (`scripts/serve-static.mjs`) serves this app's `dist/`
export alongside the backend and frontend, no separate steps needed.
The rest of this section is for running/testing it standalone.

What makes it installable, all under `public/` (served as-is by Expo's
Metro web bundler, which looks for a custom `index.html` there):
- `public/manifest.json` — name, icons, `display: "standalone"`,
  theme/background color
- `public/sw.js` — app-shell service worker (cache-first for the JS
  bundle/fonts/icons, network-first for navigations); it deliberately
  does **not** cache API calls (`src/api/client.ts`'s `API_BASE_URL`)
  since there's no offline-write/sync story yet, so quote/customer data
  is always fetched live
- `public/index.html` — viewport/theme-color/apple-touch-icon meta tags
  and the manifest link; loads `register-sw.js` via a real `<script
  src>` rather than inline, so it works under `scripts/serve-static.mjs`'s
  `script-src 'self'` CSP (no `'unsafe-inline'`)
- `public/register-sw.js` — registers the service worker
- `assets/pwa/` — the source icons (192/512/512-maskable/apple-touch/favicon)
  copied into `public/`, in case you want to regenerate them

Try it locally:

```bash
npm run web                    # dev server (expo start --web) — desktop browser
npm run build:web               # production export to dist/ (expo export --platform web)
node scripts/serve-static.mjs   # serve the export (zero-dependency); visit from your phone at http://<your-LAN-IP>:PORT
```

To open it on a phone, your phone and computer need to be on the same
network, using your computer's LAN IP (not `localhost`) — `npm run web`
prints one, or pass `--tunnel` to `expo start --web` to get a public URL
instead. **Service workers only run over HTTPS** (`localhost` is
exempted for local dev, but a LAN IP is not) — installability and
offline caching only kick in once this is deployed behind HTTPS; over
plain HTTP on a LAN IP the app still loads and works, it just won't
register the service worker or be installable.

Once loaded in mobile Chrome over HTTPS, either wait for the automatic
"Install app" banner or open the **⋮** menu → **Add to Home screen** /
**Install app**.

## Bilingual (EN/AR)

A language toggle on the login screen switches the whole app, RTL
layout included, and persists the choice (`AsyncStorage`, key
`qq_locale`).

- `src/i18n/translations.ts` — flat, typed EN/AR dictionaries grouped
  by screen (`login`, `home`, `quickQuote`, `clients`, ...). `ar` is
  typed as `typeof en`, so a missing/extra key in either is a **build
  error**, not a silently-blank string at runtime.
- `src/i18n/LocaleContext.tsx` — `useLocale()` gives you `{ locale, t,
  setLocale, isRTL }`. `t('section', 'key', { param: value })` looks up
  the string and does `{{param}}` interpolation.

**RTL is genuinely two different mechanisms depending on platform** --
worth knowing before touching this code:

- **Web** (this app's main target): `react-native-web`'s `I18nManager`
  is a hardcoded no-op stub (`allowRTL()`/`forceRTL()` both just
  `return;`, `isRTL` is always `false` — check
  `node_modules/react-native-web/src/exports/I18nManager` yourself).
  Calling it does nothing. What actually mirrors the layout on web is
  setting `document.documentElement.dir = 'rtl'` directly — CSS defines
  `flexDirection: 'row'` as direction-relative ("main-start is on the
  left in LTR, on the right in RTL"), so that one line correctly
  mirrors every row layout in the app, instantly, no reload needed.
- **Native** (iOS/Android): the real `I18nManager.forceRTL()` applies,
  but native only reads the writing-direction flag once at bridge
  init — an already-running app can't re-flow in place, so a language
  switch that also flips RTL shows a "restart the app" prompt there.

`src/i18n/LocaleContext.tsx`'s `applyRTL()` is the one place that picks
between these two, so screens themselves never need to know which
platform they're on.

**Known gap:** a handful of hardcoded `marginLeft`/`marginRight` values
(e.g. `ClientsListScreen`'s row action icons) don't flip under RTL --
only `flexDirection`-driven mirroring is covered. Real logical
properties (`marginStart`/`marginEnd`) would close this, not done here
to keep this pass scoped to what was asked.

## Setup

```bash
npm install
cp .env.example .env   # then edit EXPO_PUBLIC_API_BASE_URL to point at your backend
```

`src/api/client.ts` reads `API_BASE_URL` from `EXPO_PUBLIC_API_BASE_URL`
(Expo/Metro's build-time env convention, same idea as the web app's
`VITE_API_BASE_URL`) — inlined into the bundle for web *and* native
builds alike, falling back to an obviously-fake placeholder if `.env`
is missing so a forgotten setup step fails loudly instead of silently.

If your backend's CORS/allowed-origins list is enforced at the network
layer for native apps too (some setups also check `Origin` on mobile
webviews), make sure this app's usage is covered — usually a non-issue
for pure native `fetch`, since native apps don't send a browser
`Origin` header the way a hosted microsite does.

Run it:

```bash
npx expo start        # then press i / a / w, or scan the QR code in Expo Go
```

## Permissions

Same as the HTML microsite: a sales user needs their existing
Feasibilities (read+write) and Quotations (read+write) access, plus
Customers (read+write, for the new CRUD screens) and Products (read).
No new roles or accounts.

## Known simplifications (flagged for follow-up, not hidden)

- **Client delete** uses RN's built-in `Alert.alert` confirm dialog
  (system-styled, not themed) rather than a themed in-app modal — kept
  it simple since it's a native confirm dialog, not a full screen.
