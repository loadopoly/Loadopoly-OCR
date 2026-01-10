/**
 * GeoGraph Service Worker v2.0.0
 * 
 * IMPORTANT: This service worker is designed to be cache-safe for Vite builds.
 * - JS/CSS bundles are NEVER cached (they have content hashes that change per build)
 * - Only static assets (HTML, manifest, icons) are cached
 * - Version bump forces cache invalidation across all clients
 */

const CACHE_VERSION = '2.0.0';
const CACHE_NAME = `geograph-v${CACHE_VERSION}`;

// Only cache truly static assets that don't change per build
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon.svg'
];

// Patterns for files that should NEVER be cached
// These are Vite-generated bundles with content hashes
const NEVER_CACHE_PATTERNS = [
  /\/assets\//,           // All Vite-generated assets
  /\.[a-f0-9]{8}\./,      // Files with content hashes (e.g., index.a1b2c3d4.js)
  /\.js(\?.*)?$/,         // All JavaScript files
  /\.css(\?.*)?$/,        // All CSS files
  /\.mjs(\?.*)?$/,        // ES modules
  /hot-update/,           // Vite HMR files
];

// Log helper for debugging
const log = (msg, ...args) => {
  if (self.location.hostname === 'localhost') {
    console.log(`[SW ${CACHE_VERSION}] ${msg}`, ...args);
  }
};

self.addEventListener('install', (event) => {
  log('Installing service worker');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(ASSETS_TO_CACHE))
      .then(() => log('Static assets cached'))
  );
  // Force immediate activation - don't wait for old SW to release
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  log('Activating service worker');
  event.waitUntil(
    Promise.all([
      // Delete ALL old caches
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== CACHE_NAME) {
              log('Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      }),
      // Clean any accidentally cached JS/CSS from current cache
      caches.open(CACHE_NAME).then((cache) => {
        return cache.keys().then((requests) => {
          return Promise.all(
            requests.map((request) => {
              const url = new URL(request.url);
              if (NEVER_CACHE_PATTERNS.some(p => p.test(url.pathname) || p.test(url.href))) {
                log('Removing stale asset:', url.pathname);
                return cache.delete(request);
              }
            })
          );
        });
      })
    ])
  );
  // Take control of all clients immediately
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  
  // Only handle GET requests
  if (request.method !== 'GET') return;
  
  // Only handle same-origin requests
  if (!request.url.startsWith(self.location.origin)) return;
  
  const url = new URL(request.url);
  
  // CRITICAL: Never intercept JS/CSS/asset requests - let browser fetch directly
  // This prevents stale bundle issues that cause blank pages
  if (NEVER_CACHE_PATTERNS.some(pattern => pattern.test(url.pathname) || pattern.test(url.href))) {
    log('Skipping cache for:', url.pathname);
    return; // Don't call respondWith - browser handles normally
  }

  // For navigation requests (page loads), use network-first strategy
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Cache the fresh HTML
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
          return response;
        })
        .catch(() => {
          // Offline fallback
          return caches.match('/index.html');
        })
    );
    return;
  }

  // For other static assets, use cache-first strategy
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      
      return fetch(request).then((response) => {
        // Only cache successful responses
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }
        
        // Double-check this isn't a JS/CSS file before caching
        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('javascript') || contentType.includes('css')) {
          return response;
        }
        
        const responseToCache = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(request, responseToCache);
        });
        return response;
      }).catch((error) => {
        log('Fetch failed:', error.message);
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
