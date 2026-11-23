// خدمة العمل بدون إنترنت — بتحفظ ملفات التطبيق على التلفون
const VERSION = 'v5';
const SHELL = [
  './', 'index.html', 'app.js', 'config.js', 'manifest.webmanifest',
  'fonts/cairo.css',
  'fonts/SLXVc1nY6HkvangtZmpQdkhzfH5lkSscQyyS4J0.woff2',
  'fonts/SLXVc1nY6HkvangtZmpQdkhzfH5lkSscRiyS.woff2',
  'fonts/SLXVc1nY6HkvangtZmpQdkhzfH5lkSscSCyS4J0.woff2',
  'icons/icon-192.png', 'icons/icon-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open('shell-' + VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(k => k.startsWith('shell-') && k !== 'shell-' + VERSION).map(k => caches.delete(k))
  )).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // بيانات الأسعار ما بتتخزن هون (التطبيق بخزنها لحاله)
  if (url.hostname.endsWith('google.com') || url.hostname.endsWith('googleusercontent.com')) return;
  // مكتبة قراءة الباركود الاحتياطية: من الإنترنت أول، وإذا ما في نت من المخزن
  if (url.hostname.endsWith('jsdelivr.net')) {
    e.respondWith(caches.open('lib-' + VERSION).then(async c => {
      try { const r = await fetch(req); if (r.ok) c.put(req, r.clone()); return r; }
      catch (err) { const m = await c.match(req); if (m) return m; throw err; }
    }));
    return;
  }
  if (url.origin !== location.origin) return;
  // تطبيق الصحي إله خدمته لحاله
  if (url.pathname.indexOf('/sihhi/') >= 0) return;
  // ملفات التطبيق: من الإنترنت أول (عشان التحديثات توصل)، وإذا ما في نت من المخزن
  e.respondWith(fetch(req).then(r => {
    if (r.ok) { const copy = r.clone(); caches.open('shell-' + VERSION).then(c => c.put(req, copy)); }
    return r;
  }).catch(() => caches.match(req, { ignoreSearch: true }).then(m => m || caches.match('index.html'))));
});
