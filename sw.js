const CACHE = 'raspisanie-v5';
const FILES = ['./', './index.html', './style.css', './script.js', './manifest.json', './icon.svg'];

// Установка: кладём свежие файлы в кэш (в обход кэша браузера)
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => Promise.all(FILES.map(f => cache.add(new Request(f, { cache: 'reload' })))))
      .then(() => self.skipWaiting())
  );
});

// Активация: удаляем старые кэши
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Запросы: сначала сеть (свежие файлы), если нет интернета — берём из кэша
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  if (new URL(req.url).origin !== location.origin) return;

  event.respondWith(
    fetch(req, { cache: 'no-cache' })
      .then(res => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req).then(r => r || caches.match('./index.html')))
  );
});