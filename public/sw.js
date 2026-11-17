// Offline support. Each build gets its own cache, filled at install with every
// file of that build. The big data files are served cache-first; everything
// else tries the network first so a new deploy shows up at once, and falls
// back to the cache when offline.
const BUILD = '__BUILD__';
const FILES = __FILES__;
// The faint Tycho-2 bands (11 MB in all) are not precached: each is kept once it
// has been seen, in a cache that outlives builds. Bump the name if the data changes.
const TYCHO = 'firmament-tycho-1';

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(BUILD).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== BUILD && k !== TYCHO).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  const cached = () => caches.open(BUILD).then((c) => c.match(e.request, { ignoreSearch: true }));
  if (url.pathname.includes('/data/tycho/')) {
    e.respondWith(caches.open(TYCHO).then((c) => c.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
      if (res.ok) c.put(e.request, res.clone());
      return res;
    }))));
    return;
  }
  if (url.pathname.includes('/data/') || url.pathname.includes('/fonts/')) {
    e.respondWith(cached().then((hit) => hit || fetch(e.request)));
    return;
  }
  e.respondWith(
    fetch(e.request).catch(() => cached().then((hit) => hit || Response.error())),
  );
});
