// HUB service worker: guscio offline + aggiornamento con toast. Non tocca i dati (localStorage).
const VERSION = 'hub-0.1.1';
const GUSCIO = ['./', './index.html', './manifest.webmanifest', './icona.svg', './icona-180.png', './icona-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(GUSCIO)).catch(() => {}));
});
self.addEventListener('message', (e) => {
  if (e.data === 'attiva') self.skipWaiting();
});
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((k) => Promise.all(k.filter((x) => x !== VERSION).map((x) => caches.delete(x)))).then(() => self.clients.claim()),
  );
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return; // il ponte non passa mai di qui
  if (e.request.mode === 'navigate') {
    e.respondWith(fetch(e.request).then((r) => { const copia = r.clone(); caches.open(VERSION).then((c) => c.put('./index.html', copia)); return r; }).catch(() => caches.match('./index.html')));
    return;
  }
  e.respondWith(
    caches.match(e.request).then((hit) => hit || fetch(e.request).then((r) => {
      if (r.ok) { const copia = r.clone(); caches.open(VERSION).then((c) => c.put(e.request, copia)); }
      return r;
    })),
  );
});
