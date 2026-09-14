// Minimal app-shell service worker for the JDK Quick Quote PWA.
//
// Scope is same-origin static assets only (the Metro web bundle, this
// shell, icons). API calls go to a different origin (src/api/client.ts's
// API_BASE_URL) and are deliberately left untouched here -- caching
// quote/customer data would risk serving stale sales data, and the app
// has no offline-write story (no queue/sync) to make that safe yet.
const CACHE_VERSION = 'jdk-quick-quote-v1';
const APP_SHELL = ['/', '/manifest.json'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Only handle same-origin GETs; let everything else (API calls, POSTs,
  // cross-origin requests) pass straight through to the network.
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) {
    return;
  }

  if (request.mode === 'navigate') {
    // Network-first for navigations so a new deploy is picked up
    // immediately when online; cached shell covers being offline.
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put('/', copy));
          return response;
        })
        .catch(() => caches.match('/'))
    );
    return;
  }

  // Cache-first, stale-while-revalidate for everything else (JS bundle,
  // icons, fonts) -- fast repeat loads, with a background refresh so the
  // cache doesn't go permanently stale.
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
