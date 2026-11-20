/* DEEP STRIKE offline worker. Scope is this folder only (strike-17 on GitHub Pages). */
importScripts('precache-list.js');
const CACHE = 'strike-17-17x24';
const BUILD = '17x24';
const CORE = self.CORE || self.PRECACHE || [];
const LAZY = self.LAZY || [];
// The rest of the sound bank stays in LAZY and is not installed up front.
// Playing one of those files stores it later, one put at a time, via cacheFirst.
void LAZY;
let coreCount = 0;

function scopeUrl(path){ return new URL(path, self.registration.scope); }

async function putOne(cache, path){
  const res = await fetch(new Request(path, { cache: 'reload' }));
  if (!res || !res.ok || res.type === 'opaque') throw new Error('HTTP ' + (res && res.status));
  await cache.put(scopeUrl(path), res);
}

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    let n = 0;
    const queue = CORE.slice();
    async function worker(){
      for (;;) {
        const path = queue.shift();
        if (!path) return;
        try { await putOne(cache, path); n++; }
        catch (e) { /* one missed file must not wipe the install */ }
      }
    }
    await Promise.all([worker(), worker(), worker(), worker()]);
    const index = await cache.match(scopeUrl('index.html'));
    const mod = await cache.match(scopeUrl('main.mjs'));
    if (index && mod) coreCount = n;
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith('strike-17-') && k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
    if (coreCount) {
      const clients = await self.clients.matchAll({ includeUncontrolled: true });
      for (const c of clients) c.postMessage({ type: 'offline-ready', n: coreCount });
    }
  })());
});

self.addEventListener('message', event => {
  if (!event.data || event.data.type !== 'offline-status') return;
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const index = await cache.match(scopeUrl('index.html'));
    const mod = await cache.match(scopeUrl('main.mjs'));
    if (index && mod && event.source) event.source.postMessage({ type: 'offline-ready', n: coreCount || 1 });
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
  try {
    const res = await fetch(req);
    if (res && res.ok && res.type !== 'opaque') cache.put(req, res.clone());
    return res;
  } catch (e) {
    return hit || new Response('', { status: 504 });
  }
}

function offlineDoc(){
  return new Response('<!doctype html><title>offline</title><p>This sortie is not stored on the phone yet.</p>', { status: 503, headers: { 'content-type': 'text/html;charset=utf-8' } });
}

/* Any in-scope navigation, including ?v= / ?nc= on the Home Screen start URL,
   is answered from the cached index.html. fetch() of the original navigation
   Request is never used: a failed one fails the page on iOS and Chrome even
   when the rejection is caught, which is the airplane-mode blank page. */
async function serveNav(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req, { ignoreSearch: true });
  const index = hit || await cache.match(scopeUrl('index.html'), { ignoreSearch: true });
  if (index) return index;
  try {
    const res = await fetch(new Request(req.url, { method: 'GET', cache: 'no-store', credentials: 'same-origin', redirect: 'follow' }));
    if (res && res.ok && res.type !== 'opaque') {
      try { await cache.put(scopeUrl('index.html'), res.clone()); } catch (e) {}
      return res;
    }
  } catch (e) {}
  return offlineDoc();
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
  if (isDocument(req, url)) { event.respondWith(serveNav(req)); return; }
  if (foreignBuild(url)) {
    event.respondWith((async () => {
      try { return await fetch(req); }
      catch (e) { return cacheFirst(req); }
    })());
    return;
  }
  event.respondWith(cacheFirst(req));
});
