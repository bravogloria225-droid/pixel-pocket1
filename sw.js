/* Offline support: app files are cached so the arcade and chess work with no internet. */
const CACHE = 'pixelpocket-v1';
const FILES = [
  './', 'index.html', 'style.css', 'app.js', 'play.html', 'chess.html', 'manifest.webmanifest',
  'game-snake.js', 'game-dodge.js',
  'chess-engine.js', 'chess-worker.js', 'chess-ui.js', 'chess.css',
  'icon-180.png', 'icon-192.png', 'icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
// same-origin: network first (so updates show up), fall back to cache when offline
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy));
      return res;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
