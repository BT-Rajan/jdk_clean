// Split out from index.html as an external file (rather than an inline
// <script>) so it works under a strict `script-src 'self'` CSP with no
// 'unsafe-inline' -- see scripts/serve-static.mjs.
//
// Registration failures are non-fatal -- the app still works online, it
// just won't be installable/offline-ready. Only runs on http[s] so it's
// a no-op during local file:// debugging.
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
