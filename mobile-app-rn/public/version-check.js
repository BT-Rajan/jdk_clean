// Detects a newer build going live while this PWA is already open, and
// reloads to it automatically. An installed/standalone PWA can sit in
// memory for a whole shift without ever re-navigating -- the service
// worker's network-first-on-navigate handling (see sw.js) only ever
// gets a chance to run on an actual navigation, so a long-lived session
// can otherwise keep running yesterday's JS indefinitely even though
// sw.js itself is already correctly configured to serve today's on the
// next real navigation.
//
// The signal: does '/', fetched fresh right now, reference the same
// hashed JS bundle this page was actually loaded with? Expo already
// content-hashes that filename per build
// (/_expo/static/js/web/AppEntry-<hash>.js), so the bundle's own name
// *is* the version -- no separate version file to keep in sync.
(function () {
  if (!('serviceWorker' in navigator) || !location.protocol.startsWith('http')) return;

  function currentBundleSrc() {
    var script = document.querySelector('script[src*="/_expo/static/js/web/"]');
    return script ? script.getAttribute('src') : null;
  }

  var runningBundle = currentBundleSrc();
  if (!runningBundle) return; // unexpected markup (e.g. dev server) -- don't guess

  var checking = false;

  function checkForUpdate() {
    if (checking) return;
    checking = true;
    fetch('/', { cache: 'no-store' })
      .then(function (res) {
        return res.text();
      })
      .then(function (html) {
        var match = html.match(/\/_expo\/static\/js\/web\/AppEntry-[^"']+\.js/);
        var latestBundle = match ? match[0] : null;
        if (latestBundle && latestBundle !== runningBundle) {
          // A new build is live -- clear every service-worker-managed
          // cache (so nothing keeps serving the old bundle/assets from
          // the stale-while-revalidate path) and reload straight into
          // it, rather than showing a "please refresh" prompt on an
          // internal sales tool where nobody should have to think
          // about that.
          return caches
            .keys()
            .then(function (keys) {
              return Promise.all(keys.map(function (key) { return caches.delete(key); }));
            })
            .then(function () {
              window.location.reload();
            });
        }
      })
      .catch(function () {
        // Offline or a transient error -- try again next interval,
        // don't disrupt the current session over it.
      })
      .finally(function () {
        checking = false;
      });
  }

  // Check right away (covers reopening an already-installed PWA from
  // before this script even existed), whenever the tab/PWA comes back
  // to the foreground, and periodically while it stays open.
  checkForUpdate();
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') checkForUpdate();
  });
  setInterval(checkForUpdate, 5 * 60 * 1000);
})();
