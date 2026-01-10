const CACHE_NAME = 'geograph-v1.8.2';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon.svg'
];

// Assets that should NOT be cached (dynamic bundles change on each build)
const NO_CACHE_PATTERNS = [
  /\/assets\/.*\.js$/,
  /\/assets\/.*\.css$/
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') return;
  
  // Skip cross-origin requests
  if (!event.request.url.startsWith(self.location.origin)) return;
  
  // Skip requests that match no-cache patterns (JS/CSS bundles)
  const url = new URL(event.request.url);
  const shouldSkipCache = NO_CACHE_PATTERNS.some(pattern => pattern.test(url.pathname));
  
  if (shouldSkipCache) {
    // For JS/CSS bundles, always go to network first, don't cache
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) return cachedResponse;
      
      return fetch(event.request).then((response) => {
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }
        const responseToCache = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });
        return response;
      }).catch((error) => {
        console.error('Fetch failed:', error);
        // Return a basic offline response for navigation requests
        if (event.request.mode === 'navigate') {
          return caches.match('/index.html');
        }
        throw error;
      });
    })
  );
});

// Background Sync
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-data') {
    // event.waitUntil(syncData());
    console.log('Background sync triggered');
  }
});

// Periodic Sync
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'update-content') {
    // event.waitUntil(updateContent());
    console.log('Periodic sync triggered');
  }
});

// Push Notifications
self.addEventListener('push', (event) => {
  const data = event.data ? event.data.text() : 'No payload';
  event.waitUntil(
    self.registration.showNotification('GeoGraph', {
      body: data,
      icon: '/icon.svg'
    })
  );
});
