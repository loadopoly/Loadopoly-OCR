/**
 * Performance Monitoring & Optimization Utilities
 * 
 * Provides tools for measuring and optimizing app performance,
 * particularly for heavy visualization components.
 * 
 * Features:
 * - Web Vitals tracking (LCP, FID, CLS, FCP, TTFB)
 * - Frame rate monitoring for animations
 * - Memory usage tracking
 * - Network performance logging
 * - Adaptive quality settings based on device capability
 */

import { logger } from './logger';

// ============================================
// Types
// ============================================

export interface PerformanceMetrics {
  lcp: number | null;  // Largest Contentful Paint
  fid: number | null;  // First Input Delay
  cls: number | null;  // Cumulative Layout Shift
  fcp: number | null;  // First Contentful Paint
  ttfb: number | null; // Time to First Byte
  fps: number | null;  // Current frame rate
  memory: MemoryInfo | null;
}

export interface MemoryInfo {
  usedJSHeapSize: number;
  totalJSHeapSize: number;
  jsHeapSizeLimit: number;
  usagePercent: number;
}

export interface DeviceCapability {
  tier: 'low' | 'mid' | 'high';
  cores: number;
  memory: number; // in GB (estimated)
  gpu: 'integrated' | 'discrete' | 'unknown';
  connection: 'slow' | 'medium' | 'fast';
  supportsOffscreenCanvas: boolean;
  supportsWebGL2: boolean;
  supportsWasm: boolean;
}

export interface AdaptiveSettings {
  maxGraphNodes: number;
  graphAnimationDuration: number;
  enableParticles: boolean;
  textureQuality: 'low' | 'medium' | 'high';
  shadowQuality: 'none' | 'low' | 'high';
  maxConcurrentWorkers: number;
  enableBackgroundSync: boolean;
  imageCompressionQuality: number;
}

// ============================================
// Metrics Storage
// ============================================

const metrics: PerformanceMetrics = {
  lcp: null,
  fid: null,
  cls: null,
  fcp: null,
  ttfb: null,
  fps: null,
  memory: null
};

let fpsFrames: number[] = [];
let lastFrameTime = performance.now();
let fpsMonitoringActive = false;

// ============================================
// Web Vitals Tracking
// ============================================

export function initWebVitalsTracking(): void {
  if (typeof window === 'undefined') return;

  // Largest Contentful Paint
  const lcpObserver = new PerformanceObserver((entryList) => {
    const entries = entryList.getEntries();
    const lastEntry = entries[entries.length - 1] as any;
    metrics.lcp = lastEntry?.startTime ?? null;
    logger.debug(`LCP: ${metrics.lcp}ms`);
  });
  
  try {
    lcpObserver.observe({ type: 'largest-contentful-paint', buffered: true });
  } catch {
    // Not supported in all browsers
  }

  // First Input Delay
  const fidObserver = new PerformanceObserver((entryList) => {
    const entries = entryList.getEntries();
    const firstEntry = entries[0] as any;
    if (firstEntry?.processingStart !== undefined && firstEntry?.startTime !== undefined) {
      metrics.fid = firstEntry.processingStart - firstEntry.startTime;
    }
    logger.debug(`FID: ${metrics.fid}ms`);
  });
  
  try {
    fidObserver.observe({ type: 'first-input', buffered: true });
  } catch {
    // Not supported in all browsers
  }

  // Cumulative Layout Shift
  let clsValue = 0;
  const clsObserver = new PerformanceObserver((entryList) => {
    for (const entry of entryList.getEntries() as any[]) {
      if (!entry.hadRecentInput) {
        clsValue += entry.value;
      }
    }
    metrics.cls = clsValue;
    logger.debug(`CLS: ${metrics.cls}`);
  });
  
  try {
    clsObserver.observe({ type: 'layout-shift', buffered: true });
  } catch {
    // Not supported in all browsers
  }

  // First Contentful Paint
  const fcpObserver = new PerformanceObserver((entryList) => {
    const entries = entryList.getEntries();
    const fcpEntry = entries.find(e => e.name === 'first-contentful-paint');
    if (fcpEntry) {
      metrics.fcp = fcpEntry.startTime;
      logger.debug(`FCP: ${metrics.fcp}ms`);
    }
  });
  
  try {
    fcpObserver.observe({ type: 'paint', buffered: true });
  } catch {
    // Not supported in all browsers
  }

  // Time to First Byte
  const navEntry = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
  if (navEntry) {
    metrics.ttfb = navEntry.responseStart - navEntry.requestStart;
    logger.debug(`TTFB: ${metrics.ttfb}ms`);
  }
}

// ============================================
// FPS Monitoring
// ============================================

export function startFPSMonitoring(): void {
  if (fpsMonitoringActive) return;
  fpsMonitoringActive = true;
  
  function measureFPS(currentTime: number) {
    if (!fpsMonitoringActive) return;
    
    const delta = currentTime - lastFrameTime;
    lastFrameTime = currentTime;
    
    if (delta > 0) {
      fpsFrames.push(1000 / delta);
      
      // Keep last 60 frames
      if (fpsFrames.length > 60) {
        fpsFrames.shift();
      }
      
      // Calculate average FPS
      metrics.fps = Math.round(
        fpsFrames.reduce((a, b) => a + b, 0) / fpsFrames.length
      );
    }
    
    requestAnimationFrame(measureFPS);
  }
  
  requestAnimationFrame(measureFPS);
}

export function stopFPSMonitoring(): void {
  fpsMonitoringActive = false;
  fpsFrames = [];
}

// ============================================
// Memory Monitoring
// ============================================

export function getMemoryUsage(): MemoryInfo | null {
  if (typeof window === 'undefined') return null;
  
  const perf = performance as any;
  if (!perf.memory) return null;
  
  const { usedJSHeapSize, totalJSHeapSize, jsHeapSizeLimit } = perf.memory;
  
  metrics.memory = {
    usedJSHeapSize,
    totalJSHeapSize,
    jsHeapSizeLimit,
    usagePercent: Math.round((usedJSHeapSize / jsHeapSizeLimit) * 100)
  };
  
  return metrics.memory;
}

// ============================================
// Device Capability Detection
// ============================================

let cachedCapability: DeviceCapability | null = null;

export function detectDeviceCapability(): DeviceCapability {
  if (cachedCapability) return cachedCapability;
  
  const cores = navigator.hardwareConcurrency || 4;
  
  // Estimate memory (deviceMemory is in GB, but limited browser support)
  const memory = (navigator as any).deviceMemory || 4;
  
  // Check WebGL for GPU detection
  let gpu: 'integrated' | 'discrete' | 'unknown' = 'unknown';
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (gl) {
      const debugInfo = (gl as WebGLRenderingContext).getExtension('WEBGL_debug_renderer_info');
      if (debugInfo) {
        const renderer = (gl as WebGLRenderingContext).getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
        if (renderer) {
          const rendererLower = renderer.toLowerCase();
          if (rendererLower.includes('nvidia') || 
              rendererLower.includes('amd') || 
              rendererLower.includes('radeon') ||
              rendererLower.includes('geforce')) {
            gpu = 'discrete';
          } else if (rendererLower.includes('intel') || 
                     rendererLower.includes('integrated') ||
                     rendererLower.includes('mali') ||
                     rendererLower.includes('adreno')) {
            gpu = 'integrated';
          }
        }
      }
    }
  } catch (e) {
    // WebGL not available
  }
  
  // Connection speed detection
  let connection: 'slow' | 'medium' | 'fast' = 'medium';
  const conn = (navigator as any).connection;
  if (conn) {
    const effectiveType = conn.effectiveType;
    if (effectiveType === 'slow-2g' || effectiveType === '2g') {
      connection = 'slow';
    } else if (effectiveType === '4g') {
      connection = 'fast';
    }
  }
  
  // Feature detection
  const supportsOffscreenCanvas = typeof OffscreenCanvas !== 'undefined';
  const supportsWebGL2 = (() => {
    try {
      const canvas = document.createElement('canvas');
      return !!canvas.getContext('webgl2');
    } catch (e) {
      return false;
    }
  })();
  const supportsWasm = typeof WebAssembly !== 'undefined';
  
  // Determine tier
  let tier: 'low' | 'mid' | 'high' = 'mid';
  const score = cores + (memory * 2) + (gpu === 'discrete' ? 4 : gpu === 'integrated' ? 2 : 0);
  
  if (score <= 8) {
    tier = 'low';
  } else if (score >= 16) {
    tier = 'high';
  }
  
  cachedCapability = {
    tier,
    cores,
    memory,
    gpu,
    connection,
    supportsOffscreenCanvas,
    supportsWebGL2,
    supportsWasm
  };
  
  logger.info('Device capability detected', { module: 'performance', tier, cores, memory, gpu });
  return cachedCapability;
}

// ============================================
// Adaptive Settings Based on Capability
// ============================================

export function getAdaptiveSettings(): AdaptiveSettings {
  const capability = detectDeviceCapability();
  
  switch (capability.tier) {
    case 'low':
      return {
        maxGraphNodes: 50,
        graphAnimationDuration: 0, // Disable animations
        enableParticles: false,
        textureQuality: 'low',
        shadowQuality: 'none',
        maxConcurrentWorkers: Math.max(1, capability.cores - 1),
        enableBackgroundSync: false,
        imageCompressionQuality: 0.6
      };
      
    case 'mid':
      return {
        maxGraphNodes: 150,
        graphAnimationDuration: 300,
        enableParticles: true,
        textureQuality: 'medium',
        shadowQuality: 'low',
        maxConcurrentWorkers: Math.max(2, capability.cores - 2),
        enableBackgroundSync: true,
        imageCompressionQuality: 0.75
      };
      
    case 'high':
      return {
        maxGraphNodes: 500,
        graphAnimationDuration: 500,
        enableParticles: true,
        textureQuality: 'high',
        shadowQuality: 'high',
        maxConcurrentWorkers: Math.max(4, capability.cores - 2),
        enableBackgroundSync: true,
        imageCompressionQuality: 0.85
      };
  }
}

// ============================================
// Performance Report
// ============================================

export function getPerformanceReport(): PerformanceMetrics & { capability: DeviceCapability } {
  getMemoryUsage(); // Update memory metrics
  
  return {
    ...metrics,
    capability: detectDeviceCapability()
  };
}

// ============================================
// Long Task Detection
// ============================================

let longTaskObserver: PerformanceObserver | null = null;

export function startLongTaskMonitoring(
  callback: (duration: number, startTime: number) => void
): void {
  if (longTaskObserver) return;
  
  try {
    longTaskObserver = new PerformanceObserver((entryList) => {
      for (const entry of entryList.getEntries()) {
        if (entry.duration > 50) { // Long task threshold
          callback(entry.duration, entry.startTime);
          logger.warn(`Long task detected: ${entry.duration}ms`);
        }
      }
    });
    
    longTaskObserver.observe({ entryTypes: ['longtask'] });
  } catch {
    // Long task observation not supported
  }
}

export function stopLongTaskMonitoring(): void {
  if (longTaskObserver) {
    longTaskObserver.disconnect();
    longTaskObserver = null;
  }
}

// ============================================
// Debounce & Throttle Utilities
// ============================================

export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  
  return function (...args: Parameters<T>) {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    
    timeoutId = setTimeout(() => {
      func.apply(null, args);
    }, wait);
  };
}

export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle = false;
  
  return function (...args: Parameters<T>) {
    if (!inThrottle) {
      func.apply(null, args);
      inThrottle = true;
      setTimeout(() => {
        inThrottle = false;
      }, limit);
    }
  };
}

// ============================================
// RAF-based Scheduler for Smooth Animations
// ============================================

type ScheduledCallback = () => void;
const scheduledCallbacks: ScheduledCallback[] = [];
let rafId: number | null = null;

export function scheduleRender(callback: ScheduledCallback): void {
  scheduledCallbacks.push(callback);
  
  if (rafId === null) {
    rafId = requestAnimationFrame(() => {
      const callbacks = [...scheduledCallbacks];
      scheduledCallbacks.length = 0;
      rafId = null;
      
      callbacks.forEach(cb => cb());
    });
  }
}

// ============================================
// Initialize Performance Monitoring
// ============================================

export function initPerformanceMonitoring(): void {
  if (typeof window === 'undefined') return;
  
  initWebVitalsTracking();
  
  // Start FPS monitoring only when document is visible
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      startFPSMonitoring();
    } else {
      stopFPSMonitoring();
    }
  });
  
  // Start if already visible
  if (document.visibilityState === 'visible') {
    startFPSMonitoring();
  }
  
  // Log performance report periodically in development
  if (process.env.NODE_ENV === 'development') {
    setInterval(() => {
      const report = getPerformanceReport();
      logger.debug(`Performance report - FPS: ${report.fps}, LCP: ${report.lcp}ms`);
    }, 30000);
  }
  
  logger.info('Performance monitoring initialized');
}
