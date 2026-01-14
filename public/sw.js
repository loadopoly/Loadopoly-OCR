/**
 * GeoGraph Service Worker v3.0.0
 * 
 * IMPORTANT: This service worker is designed to be cache-safe for Vite builds.
 * - JS/CSS bundles are NEVER cached (they have content hashes that change per build)
 * - Only static assets (HTML, manifest, icons) are cached
 * - Version bump forces cache invalidation across all clients
 * 
 * Features:
 * - Network-first for navigation (always fresh HTML)
 * - Cache-first for static assets (icons, fonts)
 * - Background sync for offline data
 * - Push notifications support
 * - Performance optimizations with preload hints
 */

const CACHE_VERSION = '3.1.0';
const CACHE_NAME = `geograph-v${CACHE_VERSION}`;
const IMAGE_CACHE_NAME = `geograph-images-v${CACHE_VERSION}`;
const API_CACHE_NAME = `geograph-api-v${CACHE_VERSION}`;

// Only cache truly static assets that don't change per build
// IMPORTANT: Do NOT cache index.html - it references versioned JS bundles
const ASSETS_TO_CACHE = [
  '/manifest.json',
  '/icon.svg',
  '/icon-192.png',
  '/icon-512.png'
];

// API routes that can be cached briefly for offline support
const CACHEABLE_API_PATTERNS = [
  /\/api\/datasets\//,  // Dataset metadata
];

// Image types to cache
const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.ico'];

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
    Promise.all([
      caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS_TO_CACHE)),
      caches.open(IMAGE_CACHE_NAME), // Pre-create image cache
      caches.open(API_CACHE_NAME), // Pre-create API cache
    ]).then(() => log('All caches initialized'))
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
            // Keep current version caches
            if (cacheName === CACHE_NAME || 
                cacheName === IMAGE_CACHE_NAME || 
                cacheName === API_CACHE_NAME) {
              return;
            }
            log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          })
        );
      }),
      // Clean any accidentally cached JS/CSS/HTML from current cache
      caches.open(CACHE_NAME).then((cache) => {
        return cache.keys().then((requests) => {
          return Promise.all(
            requests.map((request) => {
              const url = new URL(request.url);
              // Remove any HTML files from cache
              if (url.pathname === '/' || url.pathname.endsWith('.html')) {
                log('Removing cached HTML:', url.pathname);
                return cache.delete(request);
              }
              if (NEVER_CACHE_PATTERNS.some(p => p.test(url.pathname) || p.test(url.href))) {
                log('Removing stale asset:', url.pathname);
                return cache.delete(request);
              }
            })
          );
        });
      }),
      // Prune old API cache entries (keep last 50)
      caches.open(API_CACHE_NAME).then((cache) => {
        return cache.keys().then((requests) => {
          if (requests.length > 50) {
            const toDelete = requests.slice(0, requests.length - 50);
            return Promise.all(toDelete.map(r => cache.delete(r)));
          }
        });
      }),
      // Notify all clients to reload for the new version
      self.clients.matchAll({ type: 'window' }).then((clients) => {
        clients.forEach((client) => {
          client.postMessage({ type: 'SW_UPDATED', version: CACHE_VERSION });
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

  // Handle image requests with stale-while-revalidate
  if (IMAGE_EXTENSIONS.some(ext => url.pathname.toLowerCase().endsWith(ext))) {
    event.respondWith(handleImageRequest(request, url));
    return;
  }

  // Handle cacheable API requests
  if (CACHEABLE_API_PATTERNS.some(pattern => pattern.test(url.pathname))) {
    event.respondWith(handleApiRequest(request));
    return;
  }

  // For navigation requests (page loads), ALWAYS fetch from network
  // CRITICAL: Never serve cached HTML as it references versioned JS bundles
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Return fresh HTML but don't cache it
          return response;
        })
        .catch(() => {
          // Offline fallback - show a simple offline message instead of stale HTML
          return new Response(
            `<!DOCTYPE html>
            <html>
              <head><title>Offline - GeoGraph</title></head>
              <body style="background:#020617;color:#f8fafc;font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
                <div style="text-align:center;">
                  <h1>You're Offline</h1>
                  <p style="color:#94a3b8;">Please check your internet connection and try again.</p>
                  <button onclick="location.reload()" style="margin-top:16px;padding:12px 24px;background:#3b82f6;color:white;border:none;border-radius:8px;cursor:pointer;font-size:16px;">Retry</button>
                </div>
              </body>
            </html>`,
            { headers: { 'Content-Type': 'text/html' } }
          );
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

// Stale-while-revalidate for images
async function handleImageRequest(request, url) {
  const cache = await caches.open(IMAGE_CACHE_NAME);
  const cachedResponse = await cache.match(request);
  
  const fetchPromise = fetch(request).then((networkResponse) => {
    if (networkResponse && networkResponse.status === 200) {
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  }).catch(() => {
    log('Image fetch failed for:', url.pathname);
    return null;
  });
  
  // Return cached immediately, update in background
  return cachedResponse || fetchPromise;
}

// Network-first with short cache for API
async function handleApiRequest(request) {
  const cache = await caches.open(API_CACHE_NAME);
  
  try {
    const networkResponse = await fetch(request);
    if (networkResponse && networkResponse.status === 200) {
      // Cache API response for offline access (short TTL managed by pruning)
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    log('API fetch failed, trying cache');
    const cachedResponse = await cache.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    throw error;
  }
});

// Background Sync for offline data
self.addEventListener('sync', (event) => {
  log('Background sync triggered:', event.tag);
  if (event.tag === 'sync-data') {
    event.waitUntil(syncOfflineData());
  }
  if (event.tag === 'sync-contributions') {
    event.waitUntil(syncContributions());
  }
});

async function syncOfflineData() {
  // Notify clients that sync is happening
  const clients = await self.clients.matchAll();
  clients.forEach(client => {
    client.postMessage({ type: 'SYNC_STARTED' });
  });
  
  // Actual sync would be handled by the main app
  log('Offline data sync initiated');
}

async function syncContributions() {
  log('Contribution sync initiated');
}

// Periodic Sync for background updates
self.addEventListener('periodicsync', (event) => {
  log('Periodic sync triggered:', event.tag);
  if (event.tag === 'update-content') {
    event.waitUntil(updateContent());
  }
  if (event.tag === 'check-notifications') {
    event.waitUntil(checkForNotifications());
  }
});

async function updateContent() {
  // Refresh critical cached content
  const cache = await caches.open(CACHE_NAME);
  try {
    await cache.add('/');
    log('Content updated successfully');
  } catch (error) {
    log('Content update failed:', error.message);
  }
}

async function checkForNotifications() {
  log('Checking for notifications');
}

// Push Notifications with rich actions
self.addEventListener('push', (event) => {
  let data = { title: 'GeoGraph', body: 'You have a new notification', icon: '/icon-192.png' };
  
  if (event.data) {
    try {
      data = { ...data, ...event.data.json() };
    } catch (e) {
      data.body = event.data.text();
    }
  }
  
  const options = {
    body: data.body,
    icon: data.icon || '/icon-192.png',
    badge: '/icon-192.png',
    vibrate: [100, 50, 100],
    data: data.data || {},
    actions: data.actions || [
      { action: 'view', title: 'View' },
      { action: 'dismiss', title: 'Dismiss' }
    ],
    tag: data.tag || 'geograph-notification',
    renotify: true
  };
  
  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
  log('Notification clicked:', event.action);
  event.notification.close();
  
  if (event.action === 'dismiss') {
    return;
  }
  
  const urlToOpen = event.notification.data?.url || '/';
  
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // Focus existing window if available
        for (const client of clientList) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            client.focus();
            client.postMessage({ 
              type: 'NOTIFICATION_CLICKED', 
              data: event.notification.data 
            });
            return;
          }
        }
        // Open new window if no existing window
        if (self.clients.openWindow) {
          return self.clients.openWindow(urlToOpen);
        }
      })
  );
});

// Handle messages from the main thread
self.addEventListener('message', (event) => {
  log('Message received:', event.data?.type);
  
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data?.type === 'GET_VERSION') {
    event.ports[0]?.postMessage({ version: CACHE_VERSION });
  }
  
  if (event.data?.type === 'CLEAR_CACHE') {
    event.waitUntil(
      caches.keys().then((names) => 
        Promise.all(names.map((name) => caches.delete(name)))
      ).then(() => {
        event.ports[0]?.postMessage({ success: true });
      })
    );
  }
});
