// Offline support. Each build gets its own cache, filled at install with every
// file of that build. The big data files are served cache-first; everything
// else tries the network first so a new deploy shows up at once, and falls
// back to the cache when offline.
const BUILD = '__BUILD__';
const FILES = __FILES__;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(BUILD).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== BUILD).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  const cached = () => caches.open(BUILD).then((c) => c.match(e.request, { ignoreSearch: true }));
  if (url.pathname.includes('/data/') || url.pathname.includes('/fonts/')) {
    e.respondWith(cached().then((hit) => hit || fetch(e.request)));
    return;
  }
  e.respondWith(
    fetch(e.request).catch(() => cached().then((hit) => hit || Response.error())),
  );
});
