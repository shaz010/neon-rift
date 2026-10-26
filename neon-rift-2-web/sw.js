/** Network-first for this folder only. Old copies are dropped on activate. */
const VERSION = '20261026c';
const CACHE = `nr2-web-${VERSION}`;

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith('nr2-web-') && key !== CACHE).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (!url.pathname.includes('/neon-rift-2-web/')) return;
  event.respondWith((async () => {
    try {
      return await fetch(event.request, { cache: 'no-store' });
    } catch (error) {
      const cached = await caches.match(event.request);
      if (cached) return cached;
      throw error;
    }
  })());
});
