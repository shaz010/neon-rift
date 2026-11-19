/* DEEP STRIKE offline worker. Scope is this folder only (strike-17 on GitHub Pages). */
importScripts('precache-list.js');
const CACHE = 'strike-17-17x20';
const BUILD = '17x20';
const HTML_TIMEOUT_MS = 2500;

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const list = self.PRECACHE || [];
    if (!list.length) throw new Error('precache list is empty');
    const cache = await caches.open(CACHE);
    const failed = [];
    for (const path of list) {
      try {
        const res = await fetch(new Request(path, { cache: 'reload' }));
        if (!res || !res.ok) throw new Error('HTTP ' + (res && res.status));
        await cache.put(path, res);
      } catch (err) {
        failed.push(path + ' — ' + (err && err.message ? err.message : err));
      }
    }
    if (failed.length) {
      throw new Error('precache failed (' + failed.length + '):\n' + failed.join('\n'));
    }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith('strike-17-') && k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

function underScope(url) {
  return url.origin === self.location.origin && url.pathname.startsWith(new URL(self.registration.scope).pathname);
}
function isDocument(req, url) {
  if (req.mode === 'navigate') return true;
  return /\.html$/i.test(url.pathname) || url.pathname.endsWith('/');
}

async function cacheFirst(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req, { ignoreSearch: true });
  if (hit) return hit;
  const res = await fetch(req);
  if (res && res.ok) cache.put(req, res.clone());
  return res;
}

async function fromCache(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req, { ignoreSearch: true, ignoreVary: true });
  if (hit) return hit;
  const url = new URL(req.url);
  const scope = new URL(self.registration.scope).pathname;
  let path = url.pathname.startsWith(scope) ? url.pathname.slice(scope.length) : url.pathname;
  if (!path || path.endsWith('/')) path = 'index.html';
  return cache.match(new URL(path, self.registration.scope).href, { ignoreSearch: true });
}

async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), HTML_TIMEOUT_MS);
  try {
    const res = await fetch(req, { cache: 'no-store', signal: ctrl.signal });
    clearTimeout(timer);
    if (res && res.ok) {
      cache.put(req, res.clone());
      return res;
    }
  } catch (e) { clearTimeout(timer); }
  return (await fromCache(req)) || new Response('<!doctype html><title>offline miss</title><p>SW saw the navigation but had no cached page.</p>', {status:503, headers:{'content-type':'text/html;charset=utf-8'}});
}

function foreignBuild(url){
  const v = url.searchParams.get('v');
  return !!(v && v !== BUILD);
}
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (!underScope(url)) return;
  if (url.pathname.endsWith('/sw.js') || url.pathname.endsWith('/precache-list.js')) return;
  if (foreignBuild(url)) {
    event.respondWith((async () => {
      try { return await fetch(req); }
      catch (e) { return cacheFirst(req); }
    })());
    return;
  }
  event.respondWith(isDocument(req, url) ? networkFirst(req) : cacheFirst(req));
});
