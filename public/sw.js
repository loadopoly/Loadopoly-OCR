const CACHE_NAME = 'geograph-v1.8.2';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon.svg',
  '/icon-192.png',
  '/icon-512.png'
];

const EXTERNAL_ASSETS = [
  'https://esm.sh/react@^19.2.3',
  'https://esm.sh/react-dom@^19.2.3/',
  'https://esm.sh/lucide-react@^0.561.0',
  'https://esm.sh/@google/genai@^1.33.0'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('Caching app shell and dependencies');
      return cache.addAll([...ASSETS_TO_CACHE, ...EXTERNAL_ASSETS]);
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
            console.log('Deleting old cache:', cacheName);
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

  const url = new URL(event.request.url);

  // Cache strategy: Stale-while-revalidate for most things, 
  // but Cache-first for known external dependencies and local assets.
  
  const isExternalDependency = url.origin === 'https://esm.sh';
  const isLocalAsset = url.origin === self.location.origin;

  if (isExternalDependency || isLocalAsset) {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) {
          // Return cached response, but update in background if it's a local asset (not hashed)
          if (isLocalAsset && !url.pathname.includes('assets/')) {
             fetch(event.request).then(response => {
               if (response.status === 200) {
                 caches.open(CACHE_NAME).then(cache => cache.put(event.request, response));
               }
             }).catch(() => {}); // Ignore background fetch errors
          }
          return cachedResponse;
        }

        return fetch(event.request).then((response) => {
          if (!response || response.status !== 200) {
            return response;
          }
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
          return response;
        }).catch(() => {
          // If both fail, we are offline and asset is not in cache
          if (event.request.mode === 'navigate') {
            return caches.match('/index.html');
          }
          return null;
        });
      })
    );
  }
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
