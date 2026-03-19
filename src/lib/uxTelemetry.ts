import { logger } from './logger';

type UXEventName =
  | 'process_pending_start'
  | 'process_pending_complete'
  | 'process_pending_cancel'
  | 'process_pending_error'
  | 'release_stale_retry'
  | 'tab_navigation'
  | 'mobile_quick_nav'
  | 'queue_panel_toggle';

interface UXEventPayload {
  [key: string]: unknown;
}

const UX_EVENTS_KEY = 'geograph-ux-events';
const UX_EVENTS_MAX = 100;

function persistUXEvent(entry: Record<string, unknown>): void {
  if (typeof window === 'undefined') return;

  try {
    const existing = localStorage.getItem(UX_EVENTS_KEY);
    const parsed = existing ? JSON.parse(existing) : [];
    const next = [...(Array.isArray(parsed) ? parsed : []), entry].slice(-UX_EVENTS_MAX);
    localStorage.setItem(UX_EVENTS_KEY, JSON.stringify(next));
  } catch {
    // Ignore persistence failures
  }
}

export function getRecentUXEvents(): Array<Record<string, unknown>> {
  if (typeof window === 'undefined') return [];
  try {
    const existing = localStorage.getItem(UX_EVENTS_KEY);
    const parsed = existing ? JSON.parse(existing) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function trackUXEvent(event: UXEventName, payload: UXEventPayload = {}): void {
  try {
    const entry = {
      event,
      timestamp: new Date().toISOString(),
      ...payload,
    };

    logger.info(`UX event: ${event}`, { module: 'ux-telemetry', ...entry });
    persistUXEvent(entry);

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('geograph:ux-event', { detail: entry }));
    }
  } catch {
    // Never block user flow for telemetry issues
  }
}
