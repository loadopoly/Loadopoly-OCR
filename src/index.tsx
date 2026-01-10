import './polyfills';
import './index.css';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ToastProvider, ConnectionStatus } from './components/Toast';
import { Onboarding } from './components/Onboarding';
import { ModuleProvider } from './contexts/ModuleContext';
import { bootstrapModuleSystem } from './bootstrap';

// Build info for debugging cache issues
declare const __BUILD_TIME__: string;
const BUILD_TIME = typeof __BUILD_TIME__ !== 'undefined' ? __BUILD_TIME__ : 'development';
console.log(`[GeoGraph] Build: ${BUILD_TIME}`);

// Show loading state immediately
const rootElement = document.getElementById('root');
if (rootElement) {
  rootElement.innerHTML = `
    <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; background: #020617; color: #f8fafc; font-family: system-ui, sans-serif;">
      <div style="width: 48px; height: 48px; border: 3px solid #334155; border-top-color: #3b82f6; border-radius: 50%; animation: spin 1s linear infinite;"></div>
      <p style="margin-top: 16px; color: #94a3b8; font-size: 14px;">Loading GeoGraph...</p>
      <style>@keyframes spin { to { transform: rotate(360deg); } }</style>
    </div>
  `;
}

// Service Worker update detection
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.ready.then((registration) => {
    registration.addEventListener('updatefound', () => {
      const newWorker = registration.installing;
      if (newWorker) {
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            // New version available - prompt user to refresh
            console.log('[GeoGraph] New version available');
            if (window.confirm('A new version of GeoGraph is available. Reload to update?')) {
              window.location.reload();
            }
          }
        });
      }
    });
  });
}

// Initialize module system first, then load the app
// This ensures all providers, storage adapters, and plugins are ready
bootstrapModuleSystem()
  .then(() => import('./App'))
  .then(({ default: App }) => {
    if (!rootElement) {
      throw new Error("Could not find root element to mount to");
    }

    const root = ReactDOM.createRoot(rootElement);
    root.render(
      <React.StrictMode>
        <ErrorBoundary>
          <ModuleProvider>
            <ToastProvider>
              <ConnectionStatus />
              <Onboarding onComplete={() => {}} />
              <App />
            </ToastProvider>
          </ModuleProvider>
        </ErrorBoundary>
      </React.StrictMode>
    );
  })
  .catch((err) => {
    console.error("Failed to load application:", err);
    // Render error to screen so it's not just blank
    if (rootElement) {
      const isServiceWorkerError = err.message?.includes('ServiceWorker') || 
                                    err.message?.includes('Failed to fetch') ||
                                    err.message?.includes('Loading failed');
      
      rootElement.innerHTML = `
        <div style="color: #ef4444; padding: 20px; font-family: monospace; background: #0f172a; height: 100vh; overflow: auto;">
          <h1 style="font-size: 24px; margin-bottom: 16px;">Application Error</h1>
          <p style="margin-bottom: 16px;">Failed to initialize the GeoGraph Node.</p>
          ${isServiceWorkerError ? `
            <div style="background: #1e3a5f; padding: 16px; border-radius: 8px; margin-bottom: 16px; border: 1px solid #3b82f6;">
              <p style="color: #93c5fd; margin-bottom: 8px;"><strong>Cache Issue Detected</strong></p>
              <p style="color: #bfdbfe; font-size: 14px;">This may be caused by a stale service worker cache. Try these steps:</p>
              <ol style="color: #bfdbfe; font-size: 14px; margin: 8px 0 0 20px;">
                <li>Hard refresh: Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac)</li>
                <li>Or clear site data in DevTools → Application → Storage</li>
              </ol>
              <button onclick="navigator.serviceWorker.getRegistrations().then(r => r.forEach(sw => sw.unregister())).then(() => location.reload())" 
                      style="margin-top: 12px; padding: 8px 16px; background: #3b82f6; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold;">
                Clear Cache & Reload
              </button>
            </div>
          ` : ''}
          <pre style="background: #1e293b; padding: 16px; border-radius: 8px; overflow: auto; border: 1px solid #334155; font-size: 12px;">${err.message}\n\n${err.stack}</pre>
          <p style="margin-top: 16px; color: #64748b; font-size: 12px;">Build: ${BUILD_TIME}</p>
        </div>
      `;
    }
  });
