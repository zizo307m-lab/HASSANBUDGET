// Service worker : l'application fonctionne hors ligne (cache d'abord, mise à jour en arrière-plan).
const VERSION = 'kanz-v1.0.1';
const ASSETS = ['./', 'index.html', 'manifest.webmanifest', 'css/app.css', 'icons/icon-192.png', 'icons/icon-512.png',
  'js/app.js', 'js/utils.js', 'js/model.js', 'js/storage.js', 'js/calc.js', 'js/store.js', 'js/assistant.js', 'js/security.js', 'js/notify.js',
  'js/ui/dom.js', 'js/ui/icons.js', 'js/ui/charts.js', 'js/ui/common.js', 'js/ui/forms.js', 'js/ui/theme.js',
  'js/screens/home.js', 'js/screens/transactions.js', 'js/screens/add.js', 'js/screens/budget.js', 'js/screens/menu.js', 'js/screens/analyse.js',
  'js/screens/wealth.js', 'js/screens/life.js', 'js/screens/settings.js'];
self.addEventListener('install', (e) => e.waitUntil(caches.open(VERSION).then((c) => Promise.all(ASSETS.map((a) => c.add(a).catch(() => {})))).then(() => self.skipWaiting())));
self.addEventListener('activate', (e) => e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    caches.match(e.request).then((hit) => {
      const net = fetch(e.request).then((r) => {
        if (r.ok) caches.open(VERSION).then((c) => c.put(e.request, r.clone()));
        return r;
      }).catch(() => hit);
      return hit || net;
    }),
  );
});
