/**
 * quipuService — Loadopoly-OCR's link to the QUIPU Observer.
 *
 * Loadopoly-OCR handles major UNSTRUCTURED images (archival scans, scenery,
 * open-vocabulary documents), so its observations route onto QUIPU's *vision*
 * axis; Bakugo's structured card scans route onto *touch*. QUIPU trains one
 * shared mesh across both corpora and enacts its learnings back in both
 * directions:
 *
 *   feed up:      every completed OCR result posts to POST /observe
 *   receive down: the learned lexicon (terms seen across BOTH apps) is
 *                 injected into the Gemini extraction prompt as
 *                 disambiguation priors via lexiconHint()
 *
 * Everything is best-effort: when the Observer is unreachable the app
 * behaves exactly as before. Guidance is cached and refreshed in the
 * background so OCR latency never depends on QUIPU.
 */

import { logger } from '../lib/logger';
import { WorldModelState, RetrievalDirective, VisionGrounding } from '../lib/worldModelGrounding';

const QUIPU_URL = ((import.meta.env.VITE_QUIPU_URL as string | undefined) ?? 'http://localhost:7100').replace(/\/$/, '');
const GUIDANCE_TTL_MS = 5 * 60 * 1000;
const FETCH_TIMEOUT_MS = 4000;
const SOURCE = 'loadopoly-ocr';

export interface QuipuLexiconEntry {
  token: string;
  freq: number;
}

export interface QuipuGuidance {
  ok: boolean;
  source: string;
  kind: string;
  axis: string;
  lexicon: QuipuLexiconEntry[];
  numeric_lexicon: QuipuLexiconEntry[];
  pairs: { src: string; dst: string; weight: number; samples: number }[];
  calibration: { suggested_min_confidence: number; basis: string };
  sources: Record<string, { observations?: number; tokens?: number; confidence_ema?: number; last_seen?: string }>;
  mesh: { vocab: number | null; edges: number | null; weyl_tensor: number[] | null };
  last_train: Record<string, unknown> | null;
  world_model?: WorldModelState;
  retrieval_directive?: RetrievalDirective;
}

let guidanceCache: QuipuGuidance | null = null;
let guidanceFetchedAt = 0;
let guidanceInFlight = false;

export const quipuEnabled = (): boolean => QUIPU_URL.length > 0;

export const getObserverState = async (): Promise<Record<string, unknown> | null> => {
  if (!quipuEnabled()) return null;
  try {
    const { signal, cancel } = withTimeout(FETCH_TIMEOUT_MS);
    const res = await fetch(`${QUIPU_URL}/state`, { signal });
    cancel();
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
};

const withTimeout = (ms: number): { signal: AbortSignal; cancel: () => void } => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, cancel: () => clearTimeout(timer) };
};

// ---------------------------------------------------------------------------
// Outbox (v0.48.0): every write to QUIPU is queued in localStorage and sent
// with an idempotency key, so an OCR result is not lost when the Observer is
// down or the tab closes, and a retry is never learned twice (QUIPU answers a
// repeat with {duplicate: true}).  The browser cannot hold a signing key, so
// QUIPU accepts this surface at "origin" assurance from the origins the
// operator bound to loadopoly-ocr in the edge grant.
// ---------------------------------------------------------------------------

const OUTBOX_KEY = 'quipu.outbox.v1';
const OUTBOX_MAX = 500;
const AUTH_HOLD_MS = 15 * 60 * 1000;

interface OutboxItem {
  id: string;
  path: string;
  body: string;
  attempts: number;
  nextAt: number;
}

const readOutbox = (): OutboxItem[] => {
  try {
    const raw = globalThis.localStorage?.getItem(OUTBOX_KEY);
    const items = raw ? JSON.parse(raw) : [];
    return Array.isArray(items) ? items : [];
  } catch {
    return [];
  }
};

const writeOutbox = (items: OutboxItem[]): void => {
  try {
    globalThis.localStorage?.setItem(OUTBOX_KEY, JSON.stringify(items.slice(-OUTBOX_MAX)));
  } catch {
    /* storage full or unavailable: the in-flight send still happens */
  }
};

const newId = (): string => {
  try {
    return `ocr-${globalThis.crypto.randomUUID()}`;
  } catch {
    return `ocr-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  }
};

let flushing = false;

const sendOne = async (item: OutboxItem): Promise<'done' | 'retry' | 'drop'> => {
  const { signal, cancel } = withTimeout(FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`${QUIPU_URL}${item.path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Quipu-Idempotency': item.id },
      body: item.body,
      signal,
    });
    if (res.ok) return 'done';
    if (res.status === 400 || res.status === 413) return 'drop';
    if (res.status === 429) {
      const wait = Number(res.headers.get('Retry-After') || '60');
      item.nextAt = Date.now() + Math.max(1, wait) * 1000;
    } else if (res.status === 401 || res.status === 403) {
      item.nextAt = Date.now() + AUTH_HOLD_MS;
    } else {
      item.nextAt = Date.now() + Math.min(3600, 2 ** Math.min(item.attempts, 12)) * 1000;
    }
    return 'retry';
  } catch {
    item.nextAt = Date.now() + Math.min(3600, 2 ** Math.min(item.attempts, 12)) * 1000;
    return 'retry';
  } finally {
    cancel();
  }
};

/** Send everything that is due.  Safe to call any time; never throws. */
export const flushOutbox = async (): Promise<void> => {
  if (flushing || !quipuEnabled()) return;
  flushing = true;
  try {
    const now = Date.now();
    for (const item of readOutbox().filter((i) => i.nextAt <= now)) {
      item.attempts += 1;
      const outcome = await sendOne(item);
      const rest = readOutbox().filter((i) => i.id !== item.id);
      writeOutbox(outcome === 'retry' ? [...rest, item] : rest);
      if (outcome === 'drop') logger.debug('QUIPU refused a write', { operation: 'quipuOutbox', id: item.id });
    }
  } finally {
    flushing = false;
  }
};

const enqueue = (path: string, payload: Record<string, unknown>): void => {
  const item: OutboxItem = { id: newId(), path, body: JSON.stringify(payload), attempts: 0, nextAt: 0 };
  writeOutbox([...readOutbox(), item]);
  void flushOutbox();
};

if (typeof globalThis.addEventListener === 'function') {
  globalThis.addEventListener('online', () => void flushOutbox());
}
if (typeof globalThis.setInterval === 'function') {
  globalThis.setInterval(() => void flushOutbox(), 30_000);
}

/** Queue one completed OCR result for the Observer (kept until delivered). */
export const observeOcr = (input: {
  text: string;
  confidence?: number;
  meta?: Record<string, unknown>;
  visionGrounding?: VisionGrounding;
}): void => {
  if (!quipuEnabled() || !input.text?.trim()) return;

  const payloadMeta = { ...input.meta };
  if (input.visionGrounding) {
    payloadMeta.vision_grounding = input.visionGrounding;
  }

  enqueue('/observe', {
    source: SOURCE,
    kind: 'unstructured',
    text: input.text.slice(0, 20000),
    confidence: input.confidence,
    meta: payloadMeta,
  });
};

/** Report ground truth (e.g. user-corrected OCR text) back to the Observer. */
export const reportCorrection = (expected: string, observed: string): void => {
  if (!quipuEnabled() || !expected?.trim()) return;
  enqueue('/feedback', { source: SOURCE, expected, observed });
};

/** Refresh the guidance cache in the background. */
const refreshGuidance = (deviceId?: string): void => {
  if (!quipuEnabled() || guidanceInFlight) return;
  guidanceInFlight = true;
  const { signal, cancel } = withTimeout(FETCH_TIMEOUT_MS);
  const devParam = deviceId ? `&device_id=${encodeURIComponent(deviceId)}` : '';
  fetch(`${QUIPU_URL}/guidance?source=${SOURCE}${devParam}`, { signal })
    .then((r) => r.json())
    .then((g: QuipuGuidance) => {
      if (g?.ok) {
        guidanceCache = g;
        guidanceFetchedAt = Date.now();
        logger.debug('QUIPU guidance refreshed', {
          operation: 'quipuGuidance',
          vocab: g.mesh?.vocab,
          lexicon: g.lexicon?.length,
        });
      }
    })
    .catch(() => {
      /* optional */
    })
    .finally(() => {
      guidanceInFlight = false;
      cancel();
    });
};

/** Cached guidance (may be null before first successful refresh). */
export const getGuidance = (deviceId?: string): QuipuGuidance | null => {
  if (!quipuEnabled()) return null;
  if (!guidanceCache || Date.now() - guidanceFetchedAt > GUIDANCE_TTL_MS) {
    refreshGuidance(deviceId);
  }
  return guidanceCache;
};

/** Trigger an epistemic self-annealing iteration in QUIPU. */
export const triggerAnneal = async (): Promise<Record<string, unknown> | null> => {
  if (!quipuEnabled()) return null;
  try {
    const { signal, cancel } = withTimeout(FETCH_TIMEOUT_MS);
    const res = await fetch(`${QUIPU_URL}/anneal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: SOURCE }),
      signal,
    });
    cancel();
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
};

/** Returns the current world model state from cached guidance */
export const getWorldModelState = (): WorldModelState | null => {
  return getGuidance()?.world_model ?? null;
};

/** Returns the current retrieval directive from cached guidance */
export const getRetrievalDirective = (): RetrievalDirective | null => {
  return getGuidance()?.retrieval_directive ?? null;
};

/**
 * The enacted learning: a compact lexicon block for the extraction prompt.
 * Returns '' until guidance has been fetched at least once — the prompt is
 * unchanged when QUIPU is absent, and OCR never waits on the Observer.
 */
export const lexiconHint = (maxTokens = 40): string => {
  const g = getGuidance();
  if (!g?.lexicon?.length) return '';
  
  const wm = getWorldModelState();
  const dir = getRetrievalDirective();

  if (wm?.phase === 'receptive_hunger') {
    return '';
  }

  let limit = maxTokens;
  let validLexicon = g.lexicon;

  if (wm?.phase === 'targeted_epistemic' && dir?.confidence_floor !== undefined) {
    validLexicon = validLexicon.filter(e => e.freq >= dir.confidence_floor!);
  } else if (wm?.phase === 'continuous_synthesis') {
    limit = maxTokens * 2;
  }

  if (!validLexicon.length) return '';

  const terms = validLexicon
    .slice(0, limit)
    .map((e) => e.token)
    .join(', ');
  return `
    **DOMAIN LEXICON (QUIPU Observer):**
    Terms observed across this corpus and its sibling structured-image corpus:
    ${terms}.
    Use these ONLY as disambiguation priors when glyphs are unclear or ambiguous.
    Never invent text from this list; transcribe what is actually in the image.
  `;
};
