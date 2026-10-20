/* Bimba service worker — lets the site work with no network after a first visit.
   - core app files: network-first (so updates arrive), cached copy when offline
   - vendor/ and models/ (large, versioned by filename): cache-first, stored the first time they are used
   Only same-origin GET requests are handled; the visitor counter is never cached. */
const VERSION = 'bimba-v3';
const CORE = ['./', 'index.html', 'css/styles.css', 'js/proof.js', 'js/helpers.js', 'js/i18n.js', 'js/ethics.js',
  'js/registry.js', 'js/sample.js', 'js/app.js', 'js/hero-demo.js', 'js/visitors.js', 'vendor/fflate.min.js'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(CORE).catch(() => {})).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== 'GET' || u.origin !== location.origin) return;
  const heavy = /\/(vendor|models)\//.test(u.pathname);
  if (heavy) {
    e.respondWith(caches.match(r).then(hit => hit || fetch(r).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(r, copy)); }
      return res;
    })));
  } else {
    e.respondWith(fetch(r).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(r, copy)); }
      return res;
    }).catch(() => caches.match(r).then(hit => hit || (r.mode === 'navigate' ? caches.match('index.html') : Response.error()))));
  }
});
