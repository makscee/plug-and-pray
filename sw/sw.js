// thaw's offline cache. vite.config.ts emits this as dist/sw.js with FILES (every built file, relative
// to the page) and VERSION (a hash of their names) filled in. Install caches them all, so the game loads
// offline after the first visit. The page itself is network-first, so a new deploy shows on the next
// reload; the hashed assets are cache-first.
const FILES = __FILES__;
const CACHE = 'thaw-' + __VERSION__;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['./', ...FILES])).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('thaw-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  if (req.mode === 'navigate') {
    // ?new, ?fast and the like still get the cached page
    e.respondWith(fetch(req).catch(() => caches.match('./', { cacheName: CACHE })));
    return;
  }
  // ignoreVary: vite's crossorigin module requests carry an Origin the cached ones lack
  e.respondWith(caches.match(req, { cacheName: CACHE, ignoreVary: true }).then((hit) => hit || fetch(req)));
});
