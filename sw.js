const CACHE_NAME = 'mazaj-menu-v3';
const STATIC_ASSETS = [
  './',
  'index.html',
  'style.min.css',
  'app.min.js',
  'mazaj.ico',
  'mazaj.webp',
  'mazaj1_preview.webp',
  'mazaj2_preview.webp'
];

// Helper to attach caching headers to synthetic responses
function withCacheHeaders(response, maxAge = 31536000) {
  const headers = new Headers(response.headers);
  headers.set('Cache-Control', `public, max-age=${maxAge}, immutable`);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: headers
  });
}

// Install: Cache critical static shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// Activate: Clean old caches and claim clients immediately
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: Caching strategies with explicit cache-control guarantees
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Skip cross-origin requests
  if (url.origin !== self.location.origin) {
    return;
  }

  // HTML navigation: Stale-while-revalidate for fresh content
  if (event.request.mode === 'navigate' || event.request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
          }
          return networkResponse;
        })
        .catch(() => caches.match(event.request) || caches.match('./') || caches.match('index.html'))
    );
    return;
  }

  // Static Assets (Images, CSS, JS, Fonts): Cache-first with long-term caching
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, withCacheHeaders(responseClone));
          });
        }
        return networkResponse;
      });
    })
  );
});
