const BUILD = '__BUILD__';
const FILES = __FILES__;
self.addEventListener('install', (e) => { e.waitUntil(caches.open(BUILD).then((c) => c.addAll(FILES))); });
