/**
 * SCB Uplink — optional direct delivery of capture bundles to a
 * Supply Chain Brain intake endpoint.
 *
 * The Brain's primary intake is folder-drop (`pipeline/data/photogrammetry/inbox`),
 * which the exported ZIP serves. When an HTTP intake is reachable (e.g. a
 * small receiver in front of `python -m src.photogrammetry --watch`), the
 * Operate Console can POST bundles directly.
 *
 * Endpoint resolution order:
 *   1. localStorage `scb-intake-url` (set in the Operate Console)
 *   2. VITE_SCB_INTAKE_URL build-time env
 */

const STORAGE_KEY = 'scb-intake-url';

export function getIntakeUrl(): string {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return stored;
  } catch {
    /* private mode */
  }
  return (import.meta as any).env?.VITE_SCB_INTAKE_URL ?? '';
}

export function setIntakeUrl(url: string): void {
  try {
    if (url.trim()) localStorage.setItem(STORAGE_KEY, url.trim());
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* private mode */
  }
}

export interface UplinkResult {
  ok: boolean;
  status: number;
  message: string;
}

/**
 * POST a bundle to the intake endpoint as multipart/form-data:
 *   field "bundle"  — the ZIP blob
 *   field "session" — session id (for idempotent receivers)
 *
 * Retries transient failures with exponential backoff (2s, 4s, 8s).
 */
export async function uplinkBundle(
  bundle: Blob,
  fileName: string,
  sessionId: string,
): Promise<UplinkResult> {
  const url = getIntakeUrl();
  if (!url) {
    return {
      ok: false,
      status: 0,
      message: 'No SCB intake URL configured — use Export and drop the ZIP into pipeline/data/photogrammetry/inbox instead.',
    };
  }

  const form = new FormData();
  form.append('bundle', bundle, fileName);
  form.append('session', sessionId);

  let lastError = '';
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) {
      await new Promise(r => setTimeout(r, 2000 * 2 ** (attempt - 1)));
    }
    try {
      const res = await fetch(url, { method: 'POST', body: form });
      if (res.ok) {
        return { ok: true, status: res.status, message: 'Bundle delivered to Supply Chain Brain intake.' };
      }
      // 4xx won't improve on retry
      if (res.status >= 400 && res.status < 500) {
        return { ok: false, status: res.status, message: `Intake rejected the bundle (HTTP ${res.status}).` };
      }
      lastError = `HTTP ${res.status}`;
    } catch (err) {
      lastError = err instanceof Error ? err.message : 'network error';
    }
  }
  return { ok: false, status: 0, message: `Uplink failed after 3 attempts: ${lastError}` };
}

/** Lightweight reachability probe for the status pill. */
export async function probeIntake(): Promise<boolean> {
  const url = getIntakeUrl();
  if (!url) return false;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(url, { method: 'HEAD', signal: controller.signal });
    clearTimeout(timer);
    return res.ok || res.status === 405; // 405: endpoint exists, HEAD unsupported
  } catch {
    return false;
  }
}
