/**
 * PWA Utilities
 * 
 * Provides utilities for Progressive Web App functionality including:
 * - Service Worker management
 * - Install prompt handling
 * - Update detection and prompting
 * - Offline/online status
 * - Background sync registration
 * - Push notification management
 */

import { logger } from './logger';

// ============================================
// Types
// ============================================

export interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}

export interface PWAState {
  isInstalled: boolean;
  isInstallable: boolean;
  isOnline: boolean;
  hasUpdate: boolean;
  swRegistration: ServiceWorkerRegistration | null;
  swVersion: string | null;
}

type PWAListener = (state: PWAState) => void;

// ============================================
// State Management
// ============================================

let deferredInstallPrompt: BeforeInstallPromptEvent | null = null;
let swRegistration: ServiceWorkerRegistration | null = null;
let swVersion: string | null = null;
const listeners: Set<PWAListener> = new Set();

const state: PWAState = {
  isInstalled: false,
  isInstallable: false,
  isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
  hasUpdate: false,
  swRegistration: null,
  swVersion: null
};

function notifyListeners(): void {
  state.swRegistration = swRegistration;
  state.swVersion = swVersion;
  listeners.forEach(listener => listener({ ...state }));
}

// ============================================
// State Subscription
// ============================================

export function subscribeToPWAState(listener: PWAListener): () => void {
  listeners.add(listener);
  listener({ ...state }); // Immediate state
  
  return () => {
    listeners.delete(listener);
  };
}

export function getPWAState(): PWAState {
  return { ...state };
}

// ============================================
// Installation
// ============================================

export function isInstalled(): boolean {
  // Check if running in standalone mode (installed PWA)
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
  const isIOSStandalone = (navigator as any).standalone === true;
  const hasInstalledCookie = document.cookie.includes('pwa-installed=true');
  
  return isStandalone || isIOSStandalone || hasInstalledCookie;
}

export function canInstall(): boolean {
  return deferredInstallPrompt !== null && !isInstalled();
}

export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  if (!deferredInstallPrompt) {
    logger.warn('Install prompt not available');
    return 'unavailable';
  }
  
  try {
    await deferredInstallPrompt.prompt();
    const { outcome } = await deferredInstallPrompt.userChoice;
    
    logger.info(`Install prompt result: ${outcome}`);
    
    if (outcome === 'accepted') {
      state.isInstalled = true;
      state.isInstallable = false;
      deferredInstallPrompt = null;
      
      // Set cookie to remember installation
      document.cookie = 'pwa-installed=true; max-age=31536000; path=/';
      
      notifyListeners();
    }
    
    return outcome;
  } catch (error) {
    logger.error('Install prompt failed', error instanceof Error ? error : undefined);
    return 'unavailable';
  }
}

// ============================================
// Service Worker Management
// ============================================

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) {
    logger.warn('Service Worker not supported');
    return null;
  }
  
  try {
    const registration = await navigator.serviceWorker.register('/sw.js', {
      scope: '/',
      updateViaCache: 'none'
    });
    
    swRegistration = registration;
    state.swRegistration = registration;
    
    logger.info(`Service Worker registered: ${registration.scope}`);
    
    // Get version from SW
    getServiceWorkerVersion();
    
    // Handle updates
    registration.addEventListener('updatefound', () => {
      const newWorker = registration.installing;
      
      if (newWorker) {
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            // New version available
            state.hasUpdate = true;
            notifyListeners();
            logger.info('New service worker version available');
          }
        });
      }
    });
    
    // Check for updates periodically
    setInterval(() => {
      registration.update().catch(err => 
        logger.debug(`SW update check failed: ${err}`)
      );
    }, 60 * 60 * 1000); // Every hour
    
    notifyListeners();
    return registration;
  } catch (error) {
    logger.error('Service Worker registration failed', error instanceof Error ? error : undefined);
    return null;
  }
}

export async function getServiceWorkerVersion(): Promise<string | null> {
  if (!navigator.serviceWorker?.controller) return null;
  
  return new Promise((resolve) => {
    const messageChannel = new MessageChannel();
    
    messageChannel.port1.onmessage = (event) => {
      swVersion = event.data?.version ?? null;
      state.swVersion = swVersion;
      notifyListeners();
      resolve(swVersion);
    };
    
    navigator.serviceWorker.controller!.postMessage(
      { type: 'GET_VERSION' },
      [messageChannel.port2]
    );
    
    // Timeout after 1 second
    setTimeout(() => resolve(null), 1000);
  });
}

export async function skipWaiting(): Promise<void> {
  if (swRegistration?.waiting) {
    swRegistration.waiting.postMessage({ type: 'SKIP_WAITING' });
  }
}

export async function applyUpdate(): Promise<void> {
  await skipWaiting();
  window.location.reload();
}

export async function clearAllCaches(): Promise<boolean> {
  if (!navigator.serviceWorker?.controller) return false;
  
  return new Promise((resolve) => {
    const messageChannel = new MessageChannel();
    
    messageChannel.port1.onmessage = (event) => {
      resolve(event.data?.success ?? false);
    };
    
    navigator.serviceWorker.controller!.postMessage(
      { type: 'CLEAR_CACHE' },
      [messageChannel.port2]
    );
    
    setTimeout(() => resolve(false), 5000);
  });
}

// ============================================
// Background Sync
// ============================================

export async function registerBackgroundSync(tag: string): Promise<boolean> {
  if (!swRegistration) {
    logger.warn('No service worker registration for background sync');
    return false;
  }
  
  try {
    await (swRegistration as any).sync?.register(tag);
    logger.info(`Background sync registered: ${tag}`);
    return true;
  } catch (error) {
    logger.error('Background sync registration failed', error instanceof Error ? error : undefined);
    return false;
  }
}

export async function registerPeriodicSync(
  tag: string, 
  minInterval: number = 24 * 60 * 60 * 1000 // 24 hours
): Promise<boolean> {
  if (!swRegistration) return false;
  
  try {
    const status = await navigator.permissions.query({ 
      name: 'periodic-background-sync' as PermissionName 
    });
    
    if (status.state !== 'granted') {
      logger.warn('Periodic sync permission not granted');
      return false;
    }
    
    await (swRegistration as any).periodicSync?.register(tag, {
      minInterval
    });
    
    logger.info(`Periodic sync registered: ${tag}`);
    return true;
  } catch (error) {
    logger.debug(`Periodic sync not available: ${error}`);
    return false;
  }
}

// ============================================
// Push Notifications
// ============================================

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!('Notification' in window)) {
    logger.warn('Notifications not supported');
    return 'denied';
  }
  
  const permission = await Notification.requestPermission();
  logger.info(`Notification permission: ${permission}`);
  return permission;
}

export async function subscribeToPushNotifications(
  vapidPublicKey: string
): Promise<PushSubscription | null> {
  if (!swRegistration) {
    logger.warn('No SW registration for push subscription');
    return null;
  }
  
  try {
    const subscription = await swRegistration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as BufferSource
    });
    
    logger.info('Push subscription created');
    return subscription;
  } catch (error) {
    logger.error('Push subscription failed', error instanceof Error ? error : undefined);
    return null;
  }
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  
  return outputArray;
}

// ============================================
// Online/Offline Handling
// ============================================

function handleOnlineStatus(): void {
  state.isOnline = navigator.onLine;
  notifyListeners();
  logger.info(`Online status changed: ${state.isOnline}`);
}

// ============================================
// Initialization
// ============================================

export function initPWA(): void {
  if (typeof window === 'undefined') return;
  
  // Check initial installed state
  state.isInstalled = isInstalled();
  
  // Listen for install prompt
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e as BeforeInstallPromptEvent;
    state.isInstallable = true;
    notifyListeners();
    logger.info('Install prompt available');
  });
  
  // Listen for successful installation
  window.addEventListener('appinstalled', () => {
    state.isInstalled = true;
    state.isInstallable = false;
    deferredInstallPrompt = null;
    notifyListeners();
    logger.info('App installed successfully');
  });
  
  // Online/offline events
  window.addEventListener('online', handleOnlineStatus);
  window.addEventListener('offline', handleOnlineStatus);
  
  // Display mode change (e.g., entering standalone mode)
  window.matchMedia('(display-mode: standalone)').addEventListener('change', (e) => {
    if (e.matches) {
      state.isInstalled = true;
      notifyListeners();
    }
  });
  
  // Listen for messages from service worker
  navigator.serviceWorker?.addEventListener('message', (event) => {
    if (event.data?.type === 'SYNC_STARTED') {
      logger.info('Background sync started');
    }
    if (event.data?.type === 'NOTIFICATION_CLICKED') {
      logger.info('Notification clicked', { module: 'pwa', data: event.data.data });
    }
  });
  
  // Register service worker
  registerServiceWorker();
  
  logger.info('PWA utilities initialized');
}

// ============================================
// Share API
// ============================================

export function canShare(): boolean {
  return 'share' in navigator;
}

export async function shareContent(data: ShareData): Promise<boolean> {
  if (!canShare()) {
    logger.warn('Web Share API not supported');
    return false;
  }
  
  try {
    await navigator.share(data);
    return true;
  } catch (error) {
    if ((error as Error).name !== 'AbortError') {
      logger.error('Share failed', error instanceof Error ? error : undefined);
    }
    return false;
  }
}

// ============================================
// Screen Wake Lock
// ============================================

let wakeLock: WakeLockSentinel | null = null;

export async function requestWakeLock(): Promise<boolean> {
  if (!('wakeLock' in navigator)) {
    logger.warn('Wake Lock API not supported');
    return false;
  }
  
  try {
    wakeLock = await (navigator as any).wakeLock.request('screen');
    
    wakeLock?.addEventListener('release', () => {
      logger.debug('Wake lock released');
      wakeLock = null;
    });
    
    logger.info('Wake lock acquired');
    return true;
  } catch (error) {
    logger.error('Wake lock failed', error instanceof Error ? error : undefined);
    return false;
  }
}

export function releaseWakeLock(): void {
  if (wakeLock) {
    wakeLock.release();
    wakeLock = null;
  }
}
