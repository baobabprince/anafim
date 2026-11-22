/* Anafim offline-first PWA Service Worker (network-first HTML, cache-first hashed assets). */
const CACHE_NAME = 'anafim-shell-v1';
const BASE_PATH = self.location.pathname.replace(/sw\.js$/, '');

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll([BASE_PATH, `${BASE_PATH}index.html`, `${BASE_PATH}manifest.json`, `${BASE_PATH}favicon.svg`]))
      .catch(() => {})
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  // Only cache same-origin app shell & static assets; never touch Supabase/Gemini/HF/Ollama APIs.
  if (url.origin !== self.location.origin) return;
  if (!url.pathname.startsWith(BASE_PATH)) return;

  // Navigation requests: network-first so new deployments always appear immediately, with offline fallback.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(`${BASE_PATH}index.html`, copy)).catch(() => {});
          }
          return response;
        })
        .catch(() => caches.match(`${BASE_PATH}index.html`).then(cached => cached || caches.match(BASE_PATH))),
    );
    return;
  }

  // Static assets (hashed JS/CSS/WASM, fonts, icons): cache-first with background fill.
  const isStatic = /\/(assets|fonts|ort)\/|\.(svg|png|json|ttf|woff2|wasm|css|js|mjs)$/i.test(url.pathname);
  if (!isStatic) return;

  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;
      return fetch(request).then(response => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, copy)).catch(() => {});
        }
        return response;
      });
    }),
  );
});
