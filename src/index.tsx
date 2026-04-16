// PERF FIX: Polyfills (Buffer/process) are now deferred to web3 chunk.
// Only the global polyfill remains in index.html's inline script.
import './index.css';
import React, { Suspense, lazy, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ToastProvider, ConnectionStatus } from './components/Toast';
// PERF FIX: Onboarding only shown for first-time users. Skip import entirely for returning users.
const shouldOnboard = !localStorage.getItem('geograph-onboarding-v2');
const LazyOnboarding = shouldOnboard ? lazy(() => import('./components/EnhancedOnboarding').then(m => ({ default: m.EnhancedOnboarding }))) : () => null;
// PERF FIX: ModuleProvider, bootstrap, App, pwaUtils, performanceMonitor are
// ALL dynamic imports. The entry chunk only needs: React (193KB) + lucide-react
// icons (50KB) + vendor-preload (1KB) + this file (13KB) = ~257KB total.
// Everything else (supabase 169KB, genai 253KB, cluster-sync 138KB, App 196KB,
// batch 28KB, storage 96KB) loads lazily after React mounts.

// Build info for debugging cache issues
declare const __BUILD_TIME__: string;
const BUILD_TIME = typeof __BUILD_TIME__ !== 'undefined' ? __BUILD_TIME__ : 'development';
console.log(`[GeoGraph] Build: ${BUILD_TIME}`);

// Root element for React mount (contains HTML app shell that renders instantly)
const rootElement = document.getElementById('root');

// Service Worker update detection
// IMPORTANT: We deliberately do NOT auto-reload on SW activation.
// The previous pattern (controllerchange -> location.reload()) caused the
// app to fully restart whenever the phone lock screen was lifted, because
// clients.claim() fires controllerchange on every new page claim.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.ready.then((registration) => {
    // If a new worker is found (background update downloaded), let the user
    // know non-intrusively — do NOT force-reload.
    registration.addEventListener('updatefound', () => {
      const newWorker = registration.installing;
      if (newWorker) {
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            console.log('[GeoGraph] New version available — dispatching update event');
            // Dispatch a custom event; the React app listens and shows a toast banner.
            window.dispatchEvent(new CustomEvent('geograph-sw-updated'));
          }
        });
      }
    });
  });

  // Listen for SW_UPDATED message from the service worker activate event.
  // This is sent when a new SW takes control. Show a soft banner, not a forced reload.
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data?.type === 'SW_UPDATED') {
      console.log('[GeoGraph] SW_UPDATED received — version', event.data.version);
      window.dispatchEvent(new CustomEvent('geograph-sw-updated', {
        detail: { version: event.data.version },
      }));
    }
  });

  // controllerchange fires when clients.claim() is called on SW activation.
  // DO NOT reload here — this causes the lock-screen reload loop.
  // Simply log the event for debugging.
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    console.log('[GeoGraph] SW controller changed — app continues without reload');
  });
}

function requestIdle(callback: () => void, timeout = 1500) {
  if ('requestIdleCallback' in window) {
    (window as any).requestIdleCallback(callback, { timeout });
    return;
  }
  globalThis.setTimeout(callback, 0);
}

let nonCriticalStartupScheduled = false;
function scheduleNonCriticalStartup() {
  if (nonCriticalStartupScheduled) return;
  nonCriticalStartupScheduled = true;

  const start = () => {
    import('./lib/performanceMonitor').then(m => m.initPerformanceMonitoring());
    import('./lib/pwaUtils').then(m => m.initPWA());
    import('./bootstrap').then(({ bootstrapModuleSystem }) => {
      bootstrapModuleSystem().catch((err: unknown) => {
        console.error('[GeoGraph] Module bootstrap failed:', err);
      });
    });
  };

  if (document.readyState === 'complete') {
    requestIdle(start);
    return;
  }

  window.addEventListener('load', () => requestIdle(start), { once: true });
}

// iOS Safari standalone PWA: when the OS evicts the page from bfcache and
// restores it, the page can appear blank (stale render, dead JS context).
// A `pageshow` with `event.persisted` detects bfcache restoration — reload
// the page to get a fresh React tree and live camera/network state.
// Show a loading indicator immediately so the user doesn't see a blank page.
window.addEventListener('pageshow', (event) => {
  if (event.persisted) {
    console.log('[GeoGraph] Restored from bfcache — reloading for fresh state');
    // Restore the loading indicator in the root so user sees branded UI during reload
    const root = document.getElementById('root');
    if (root) {
      root.innerHTML = `
        <div style="display:flex;flex-direction:column;height:100vh;background:#020617;color:#f8fafc;font-family:system-ui,-apple-system,sans-serif;">
          <div style="display:flex;align-items:center;gap:8px;padding:12px 16px;border-bottom:1px solid #1e293b;">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14a9 3 0 0 0 18 0V5"/><path d="M3 12a9 3 0 0 0 18 0"/></svg>
            <span style="font-size:18px;font-weight:700;letter-spacing:-0.025em;">GeoGraph<span style="color:#64748b;">OCR</span></span>
          </div>
          <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;">
            <div style="width:48px;height:48px;border:3px solid #334155;border-top-color:#3b82f6;border-radius:50%;animation:spin 0.8s linear infinite;"></div>
            <p style="color:#94a3b8;font-size:14px;margin:0;">Restoring session…</p>
          </div>
          <style>@keyframes spin{to{transform:rotate(360deg)}}</style>
        </div>
      `;
    }
    location.reload();
  }
});

// Mount React immediately — no waiting on bootstrap or module system.
// The HTML app shell is already visible; React replaces it on mount.
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);

// PERF FIX: Lazy-load App and ModuleProvider so React mounts IMMEDIATELY.
// Previously: Promise.all([import('./App'), import('./ModuleContext')]) blocked
// all rendering until ~880KB of JS (App 196KB + vendor-ai 253KB + vendor-supabase
// 169KB + cluster-sync 138KB + batch 28KB + storage 96KB) was downloaded and parsed.
// Now: React mounts instantly with Suspense, the HTML app shell stays visible while
// heavy chunks download in parallel. On a Pixel 10, this reduces perceived load
// from ~33s to ~2-4s (entry + React + Suspense fallback).
let appShellPromise:
  | Promise<[typeof import('./App'), typeof import('./contexts/ModuleContext')]>
  | null = null;

function preloadAppShell() {
  if (!appShellPromise) {
    appShellPromise = Promise.all([
      import('./App'),
      import('./contexts/ModuleContext'),
    ]);
  }
  return appShellPromise;
}

const LazyAppShell = lazy(() =>
  preloadAppShell().then(([appModule, { ModuleProvider }]) => ({
    default: () => (
      <ModuleProvider>
        <ToastProvider>
          <ConnectionStatus />
          <Suspense fallback={null}><LazyOnboarding onComplete={() => {}} /></Suspense>
          <appModule.default />
        </ToastProvider>
      </ModuleProvider>
    ),
  }))
);

// Suspense fallback: lightweight loading skeleton matching the HTML app shell.
// Keeps the branded header + spinner visible while App + ModuleProvider download.
const AppShellFallback = () => (
  <div style={{display:'flex',flexDirection:'column',height:'100vh',background:'#020617',color:'#f8fafc',fontFamily:'system-ui,-apple-system,sans-serif'}}>
    <div style={{display:'flex',alignItems:'center',gap:'8px',padding:'12px 16px',borderBottom:'1px solid #1e293b'}}>
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14a9 3 0 0 0 18 0V5"/><path d="M3 12a9 3 0 0 0 18 0"/></svg>
      <span style={{fontSize:'18px',fontWeight:700,letterSpacing:'-0.025em'}}>GeoGraph<span style={{color:'#64748b'}}>OCR</span></span>
    </div>
    <div style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:'16px'}}>
      <div style={{width:'48px',height:'48px',border:'3px solid #334155',borderTopColor:'#3b82f6',borderRadius:'50%',animation:'spin 0.8s linear infinite'}} />
      <p style={{color:'#94a3b8',fontSize:'14px',margin:0}}>Loading application…</p>
      <p style={{color:'#475569',fontSize:'12px',margin:0}}>Preparing your workspace</p>
    </div>
  </div>
);

// Landing page: shown to first-time visitors, lightweight (no heavy deps)
const LazyLandingPage = lazy(() => import('./components/LandingPage'));

// Entrypoint wrapper: decides whether to show landing page or app
const hasVisited = localStorage.getItem('geograph-has-visited');
const isReturningUser = !!hasVisited;

function AppEntry() {
  const [showApp, setShowApp] = React.useState(isReturningUser);

  useEffect(() => {
    if (!showApp) return;
    preloadAppShell();
    scheduleNonCriticalStartup();
  }, [showApp]);

  if (!showApp) {
    return (
      <Suspense fallback={<AppShellFallback />}>
        <LazyLandingPage
          onGetStarted={() => {
            preloadAppShell();
            localStorage.setItem('geograph-has-visited', 'true');
            setShowApp(true);
          }}
          onSignIn={() => {
            preloadAppShell();
            localStorage.setItem('geograph-has-visited', 'true');
            setShowApp(true);
          }}
        />
      </Suspense>
    );
  }

  return (
    <Suspense fallback={<AppShellFallback />}>
      <LazyAppShell />
    </Suspense>
  );
}

// Mount React immediately — Suspense shows the AppShellFallback (branded header + spinner)
// while LazyAppShell downloads. No blank screen, no layout shift.
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <AppEntry />
    </ErrorBoundary>
  </React.StrictMode>
);
