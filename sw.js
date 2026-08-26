const CACHE = 'junies-budget-tracker-v1.1-push';
const ASSETS = ['./', './index.html', './styles.css', './payments.css', './v11.css', './app.js', './payments.js', './v11.js', './push.js', './manifest.webmanifest', './icon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))));
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request).then((cached) => cached || caches.match('./index.html')))
  );
});

self.addEventListener('push', (event) => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch { payload = { body: event.data?.text() || '' }; }
  event.waitUntil(
    self.registration.showNotification(payload.title || "Junie's Budget Tracker", {
      body: payload.body || 'You have an upcoming payment.',
      icon: './icon.svg',
      badge: './icon.svg',
      tag: payload.tag || 'budget-reminder',
      renotify: false,
      data: { url: payload.url || './' },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = event.notification.data?.url || './';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const existing = windows[0];
      if (existing) {
        existing.navigate(target).catch(() => {});
        return existing.focus();
      }
      return clients.openWindow(target);
    })
  );
});
