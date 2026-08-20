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

const QUIPU_URL = ((import.meta.env.VITE_QUIPU_URL as string | undefined) ?? '').replace(/\/$/, '');
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

const withTimeout = (ms: number): { signal: AbortSignal; cancel: () => void } => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, cancel: () => clearTimeout(timer) };
};

/** Fire-and-forget: feed one completed OCR result up to the Observer. */
export const observeOcr = (input: {
  text: string;
  confidence?: number;
  meta?: Record<string, unknown>;
  visionGrounding?: VisionGrounding;
}): void => {
  if (!quipuEnabled() || !input.text?.trim()) return;
  const { signal, cancel } = withTimeout(FETCH_TIMEOUT_MS);
  
  const payloadMeta = { ...input.meta };
  if (input.visionGrounding) {
    payloadMeta.vision_grounding = input.visionGrounding;
  }

  fetch(`${QUIPU_URL}/observe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      source: SOURCE,
      kind: 'unstructured',
      text: input.text.slice(0, 20000),
      confidence: input.confidence,
      meta: payloadMeta,
    }),
    signal,
  })
    .then((r) => r.json())
    .then((res) => {
      logger.debug('QUIPU observation accepted', {
        operation: 'quipuObserve',
        tokens: res?.tokens,
        knownCoverage: res?.enacted?.known_token_coverage,
      });
    })
    .catch(() => {
      /* the Observer is optional; never surface transport errors */
    })
    .finally(cancel);
};

/** Report ground truth (e.g. user-corrected OCR text) back to the Observer. */
export const reportCorrection = (expected: string, observed: string): void => {
  if (!quipuEnabled() || !expected?.trim()) return;
  const { signal, cancel } = withTimeout(FETCH_TIMEOUT_MS);
  fetch(`${QUIPU_URL}/feedback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source: SOURCE, expected, observed }),
    signal,
  })
    .catch(() => {
      /* optional */
    })
    .finally(cancel);
};

/** Refresh the guidance cache in the background. */
const refreshGuidance = (): void => {
  if (!quipuEnabled() || guidanceInFlight) return;
  guidanceInFlight = true;
  const { signal, cancel } = withTimeout(FETCH_TIMEOUT_MS);
  fetch(`${QUIPU_URL}/guidance?source=${SOURCE}`, { signal })
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
export const getGuidance = (): QuipuGuidance | null => {
  if (!quipuEnabled()) return null;
  if (!guidanceCache || Date.now() - guidanceFetchedAt > GUIDANCE_TTL_MS) {
    refreshGuidance();
  }
  return guidanceCache;
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
