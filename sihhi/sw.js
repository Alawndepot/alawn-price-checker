// خدمة العمل بدون إنترنت لتطبيق الصحي — مخزنها منفصل عن قارئ الأسعار
const VERSION = 'v2';
const SHELL = [
  './', 'index.html', 'app.js', 'config.js', 'manifest.webmanifest',
  '../fonts/cairo.css',
  '../fonts/SLXVc1nY6HkvangtZmpQdkhzfH5lkSscQyyS4J0.woff2',
  '../fonts/SLXVc1nY6HkvangtZmpQdkhzfH5lkSscRiyS.woff2',
  '../fonts/SLXVc1nY6HkvangtZmpQdkhzfH5lkSscSCyS4J0.woff2',
  'icons/icon-192.png', 'icons/icon-512.png'
];
const SHELL_CACHE = 'sihhi-shell-' + VERSION, LIB_CACHE = 'sihhi-lib-' + VERSION;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL_CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(k => k.startsWith('sihhi-') && k !== SHELL_CACHE && k !== LIB_CACHE).map(k => caches.delete(k))
  )).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.hostname.endsWith('google.com') || url.hostname.endsWith('googleusercontent.com')) return;
  if (url.hostname.endsWith('jsdelivr.net')) {
    e.respondWith(caches.open(LIB_CACHE).then(async c => {
      try { const r = await fetch(req); if (r.ok) c.put(req, r.clone()); return r; }
      catch (err) { const m = await c.match(req); if (m) return m; throw err; }
    }));
    return;
  }
  if (url.origin !== location.origin) return;
  e.respondWith(fetch(req).then(r => {
    if (r.ok) { const copy = r.clone(); caches.open(SHELL_CACHE).then(c => c.put(req, copy)); }
    return r;
  }).catch(() => caches.open(SHELL_CACHE).then(c => c.match(req, { ignoreSearch: true }))
    .then(m => m || caches.match(new URL('index.html', self.registration.scope).href))));
});
