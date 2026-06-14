// Kill-switch service worker.
// This app does not use a service worker. A stale SW registered on
// localhost:3000 by a previous project keeps requesting /sw.js (404).
// Serving this file unregisters that worker and clears its caches.
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
      await self.registration.unregister();
      const clients = await self.clients.matchAll({ type: 'window' });
      clients.forEach((client) => client.navigate(client.url));
    })()
  );
});
