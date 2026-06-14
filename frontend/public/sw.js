/* the gainsXchange — minimal PWA service worker.
 * Network-first, only touches SAME-ORIGIN GETs so the backend API and all
 * mutations (bets, posts, deletes) pass through completely untouched. Offline
 * just serves the last-cached app shell. */
const CACHE = 'gx-v1';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (e) => {
  e.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return; // never intercept POST/DELETE/etc.
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // let the API + cross-origin pass through
  e.respondWith(
    (async () => {
      try {
        const res = await fetch(req);
        if (res && res.ok) {
          const cache = await caches.open(CACHE);
          cache.put(req, res.clone());
        }
        return res;
      } catch {
        return (await caches.match(req)) || Response.error();
      }
    })(),
  );
});
