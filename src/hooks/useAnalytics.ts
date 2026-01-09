/**
 * Analytics and Event Tracking Hook
 * Monitors user interactions, drop-off points, and feature usage
 * Integrates with Supabase/Vercel analytics or custom backends
 */

import { useCallback, useEffect, useRef } from 'react';

// Event types for tracking
export type AnalyticsEventType =
  | 'page_view'
  | 'feature_used'
  | 'upload_started'
  | 'upload_completed'
  | 'upload_failed'
  | 'ocr_processed'
  | 'graph_viewed'
  | 'metaverse_entered'
  | 'nft_flow_started'
  | 'nft_minted'
  | 'nft_flow_abandoned'
  | 'wallet_connected'
  | 'search_performed'
  | 'error_occurred'
  | 'onboarding_step'
  | 'onboarding_completed'
  | 'onboarding_skipped'
  | 'session_started'
  | 'session_ended'
  | 'survey_opened'
  | 'survey_completed'
  | 'feedback_submitted';

export interface AnalyticsEvent {
  type: AnalyticsEventType;
  timestamp: string;
  properties?: Record<string, any>;
  sessionId: string;
  userId?: string;
  userAgent?: string;
  referrer?: string;
}

interface AnalyticsConfig {
  enabled: boolean;
  endpoint?: string;
  supabaseEnabled?: boolean;
  vercelEnabled?: boolean;
  debug?: boolean;
  sampleRate?: number;
  batchSize?: number;
  flushIntervalMs?: number;
}

const DEFAULT_CONFIG: AnalyticsConfig = {
  enabled: true,
  debug: process.env.NODE_ENV === 'development',
  sampleRate: 1.0,
  batchSize: 10,
  flushIntervalMs: 30000,
};

// Session management
function getSessionId(): string {
  const key = 'geograph-session-id';
  let sessionId = sessionStorage.getItem(key);
  if (!sessionId) {
    sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    sessionStorage.setItem(key, sessionId);
  }
  return sessionId;
}

// Event queue for batching
class AnalyticsQueue {
  private queue: AnalyticsEvent[] = [];
  private config: AnalyticsConfig;
  private flushTimer: NodeJS.Timeout | null = null;

  constructor(config: AnalyticsConfig) {
    this.config = config;
    this.startFlushTimer();
  }

  add(event: AnalyticsEvent) {
    if (!this.config.enabled) return;
    
    // Sample rate check
    if (Math.random() > (this.config.sampleRate || 1)) return;

    this.queue.push(event);

    if (this.config.debug) {
      console.log('[Analytics]', event.type, event.properties);
    }

    if (this.queue.length >= (this.config.batchSize || 10)) {
      this.flush();
    }
  }

  private startFlushTimer() {
    if (this.flushTimer) clearInterval(this.flushTimer);
    this.flushTimer = setInterval(() => {
      this.flush();
    }, this.config.flushIntervalMs || 30000);
  }

  async flush() {
    if (this.queue.length === 0) return;

    const events = [...this.queue];
    this.queue = [];

    try {
      // Send to custom endpoint
      if (this.config.endpoint) {
        await fetch(this.config.endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ events }),
        });
      }

      // Store in localStorage for persistence across sessions
      this.persistEvents(events);

      // Vercel Web Analytics integration
      if (this.config.vercelEnabled && typeof window !== 'undefined' && (window as any).va) {
        events.forEach(e => {
          (window as any).va('event', { name: e.type, ...e.properties });
        });
      }
    } catch (error) {
      // Re-queue failed events
      this.queue = [...events, ...this.queue];
      console.error('[Analytics] Failed to send events:', error);
    }
  }

  private persistEvents(events: AnalyticsEvent[]) {
    try {
      const key = 'geograph-analytics-history';
      const existing = JSON.parse(localStorage.getItem(key) || '[]');
      const updated = [...existing, ...events].slice(-1000); // Keep last 1000 events
      localStorage.setItem(key, JSON.stringify(updated));
    } catch {
      // Ignore storage errors
    }
  }

  destroy() {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }
    this.flush();
  }
}

// Singleton queue instance
let analyticsQueue: AnalyticsQueue | null = null;

function getQueue(config?: Partial<AnalyticsConfig>): AnalyticsQueue {
  if (!analyticsQueue) {
    analyticsQueue = new AnalyticsQueue({ ...DEFAULT_CONFIG, ...config });
  }
  return analyticsQueue;
}

/**
 * Main analytics hook
 */
export function useAnalytics(config?: Partial<AnalyticsConfig>) {
  const userId = useRef<string | undefined>();
  const queue = getQueue(config);
  const sessionId = getSessionId();

  // Track session start on mount
  useEffect(() => {
    track('session_started', {
      entryPage: window.location.pathname,
      referrer: document.referrer,
    });

    // Track session end on unmount/close
    const handleUnload = () => {
      track('session_ended', {
        duration: Date.now() - performance.now(),
      });
      queue.flush();
    };

    window.addEventListener('beforeunload', handleUnload);
    return () => {
      window.removeEventListener('beforeunload', handleUnload);
    };
  }, []);

  // Track page views
  const trackPageView = useCallback((page: string, properties?: Record<string, any>) => {
    queue.add({
      type: 'page_view',
      timestamp: new Date().toISOString(),
      sessionId,
      userId: userId.current,
      userAgent: navigator.userAgent,
      properties: {
        page,
        ...properties,
      },
    });
  }, [sessionId]);

  // Generic event tracking
  const track = useCallback((
    type: AnalyticsEventType,
    properties?: Record<string, any>
  ) => {
    queue.add({
      type,
      timestamp: new Date().toISOString(),
      sessionId,
      userId: userId.current,
      userAgent: navigator.userAgent,
      properties,
    });
  }, [sessionId]);

  // Set user identity
  const identify = useCallback((id: string, traits?: Record<string, any>) => {
    userId.current = id;
    track('feature_used', { feature: 'identify', userId: id, ...traits });
  }, [track]);

  // Track feature usage
  const trackFeature = useCallback((feature: string, properties?: Record<string, any>) => {
    track('feature_used', { feature, ...properties });
  }, [track]);

  // Track errors
  const trackError = useCallback((error: Error, context?: Record<string, any>) => {
    track('error_occurred', {
      message: error.message,
      stack: error.stack,
      ...context,
    });
  }, [track]);

  // Track onboarding progress
  const trackOnboarding = useCallback((step: string, completed: boolean) => {
    track(completed ? 'onboarding_completed' : 'onboarding_step', { step });
  }, [track]);

  // Track NFT flow
  const trackNFTFlow = useCallback((action: 'started' | 'completed' | 'abandoned', properties?: Record<string, any>) => {
    const eventMap = {
      started: 'nft_flow_started',
      completed: 'nft_minted',
      abandoned: 'nft_flow_abandoned',
    } as const;
    track(eventMap[action], properties);
  }, [track]);

  // Track uploads
  const trackUpload = useCallback((
    status: 'started' | 'completed' | 'failed',
    properties?: Record<string, any>
  ) => {
    const eventMap = {
      started: 'upload_started',
      completed: 'upload_completed',
      failed: 'upload_failed',
    } as const;
    track(eventMap[status], properties);
  }, [track]);

  return {
    track,
    trackPageView,
    trackFeature,
    trackError,
    trackOnboarding,
    trackNFTFlow,
    trackUpload,
    identify,
  };
}

/**
 * Drop-off analysis helper
 * Tracks funnel progression and identifies where users abandon
 */
export function useFunnelAnalytics(funnelName: string, steps: string[]) {
  const analytics = useAnalytics();
  const currentStep = useRef(0);
  const startTime = useRef(Date.now());

  const enterFunnel = useCallback(() => {
    currentStep.current = 0;
    startTime.current = Date.now();
    analytics.track('feature_used', {
      feature: 'funnel_enter',
      funnel: funnelName,
      step: steps[0],
    });
  }, [funnelName, steps, analytics]);

  const advanceStep = useCallback((stepIndex: number) => {
    const previousStep = currentStep.current;
    currentStep.current = stepIndex;
    
    analytics.track('feature_used', {
      feature: 'funnel_advance',
      funnel: funnelName,
      fromStep: steps[previousStep],
      toStep: steps[stepIndex],
      timeOnPreviousStep: Date.now() - startTime.current,
    });
    
    startTime.current = Date.now();
  }, [funnelName, steps, analytics]);

  const completeFunnel = useCallback(() => {
    analytics.track('feature_used', {
      feature: 'funnel_complete',
      funnel: funnelName,
      totalSteps: steps.length,
      completedAt: currentStep.current,
    });
  }, [funnelName, steps, analytics]);

  const abandonFunnel = useCallback((reason?: string) => {
    analytics.track('feature_used', {
      feature: 'funnel_abandon',
      funnel: funnelName,
      abandonedAtStep: steps[currentStep.current],
      stepIndex: currentStep.current,
      reason,
    });
  }, [funnelName, steps, analytics]);

  return {
    enterFunnel,
    advanceStep,
    completeFunnel,
    abandonFunnel,
    currentStep: currentStep.current,
  };
}

/**
 * Performance metrics hook
 */
export function usePerformanceAnalytics() {
  const analytics = useAnalytics();

  useEffect(() => {
    // Track Core Web Vitals if available
    if ('web-vital' in window) return;

    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        analytics.track('feature_used', {
          feature: 'performance',
          metric: entry.name,
          value: entry.startTime,
          entryType: entry.entryType,
        });
      }
    });

    try {
      observer.observe({ entryTypes: ['largest-contentful-paint', 'first-input', 'layout-shift'] });
    } catch {
      // Not all browsers support all entry types
    }

    return () => observer.disconnect();
  }, [analytics]);

  const trackTiming = useCallback((name: string, duration: number) => {
    analytics.track('feature_used', {
      feature: 'timing',
      name,
      duration,
    });
  }, [analytics]);

  return { trackTiming };
}

/**
 * In-app survey system
 */
export interface SurveyQuestion {
  id: string;
  type: 'rating' | 'text' | 'choice';
  question: string;
  options?: string[];
}

export function useSurveyAnalytics() {
  const analytics = useAnalytics();

  const openSurvey = useCallback((surveyId: string) => {
    analytics.track('survey_opened', { surveyId });
  }, [analytics]);

  const completeSurvey = useCallback((surveyId: string, responses: Record<string, any>) => {
    analytics.track('survey_completed', { surveyId, responses });
  }, [analytics]);

  const submitFeedback = useCallback((type: string, message: string, context?: Record<string, any>) => {
    analytics.track('feedback_submitted', { type, message, ...context });
  }, [analytics]);

  return { openSurvey, completeSurvey, submitFeedback };
}
