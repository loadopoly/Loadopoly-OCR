/**
 * SCB VLM Service — route low-confidence OCR/VLM to the Supply-Chain-Brain
 * (its free-tier ensemble + recall cache) *before* spending costed Gemini tokens.
 *
 * Cheap-before-costed tiering for the field-capture PWA:
 *
 *   edge Tesseract (free, offline)
 *     → SCB VLM (cheap: free OpenRouter registry + the Brain's content-addressed
 *       recall cache, so identical images cost zero tokens)
 *     → Gemini (costed) only as a last resort.
 *
 * This service is the middle tier: a thin client over a configured SCB OCR
 * endpoint. When `VITE_SCB_OCR_URL` is unset it is a clean no-op (returns
 * `null`), so behaviour is unchanged unless an operator wires the Brain in. The
 * Brain side (`brain.geograph_ocr_bridge.analyse_image`, wrapped by
 * `brain.vlm_cache`) recalls an identical image for zero tokens and writes fresh
 * results back, so repeats across the whole system are served for free.
 *
 * @module scbVlmService
 */
import { logger } from '../lib/logger';

export interface ScbVlmResult {
  ocrText: string;
  entities: string[];
  confidence: number;
  /** True when the Brain served this from its recall cache (zero tokens). */
  cached: boolean;
  model?: string;
  raw?: unknown;
}

const SCB_TIMEOUT_MS = 15000;

// Client-side recall: never re-POST an identical image within a session.
const _recall = new Map<string, ScbVlmResult>();

/** The configured SCB OCR endpoint, or `null` when the Brain is not wired in. */
export function scbOcrUrl(): string | null {
  const url = import.meta.env.VITE_SCB_OCR_URL;
  return url && url.trim() ? url.trim() : null;
}

/** Whether a cheap SCB tier is available ahead of costed providers. */
export function isScbConfigured(): boolean {
  return scbOcrUrl() !== null;
}

async function toBase64(imageData: Blob | ArrayBuffer | string): Promise<string> {
  let buf: ArrayBuffer;
  if (typeof imageData === 'string') {
    if (imageData.startsWith('data:')) return imageData.split(',')[1] ?? '';
    buf = await (await fetch(imageData)).arrayBuffer();
  } else if (imageData instanceof Blob) {
    buf = await imageData.arrayBuffer();
  } else {
    buf = imageData;
  }
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

/**
 * Try the SCB for a cheap OCR/VLM result. Returns `null` when the Brain is not
 * configured, the request fails/times out, or the response is unusable — the
 * caller then falls back to the costed provider. Never throws.
 */
export async function tryScbVlm(
  imageData: Blob | ArrayBuffer | string,
  opts: { hash?: string; hint?: string } = {}
): Promise<ScbVlmResult | null> {
  const url = scbOcrUrl();
  if (!url) return null;

  if (opts.hash) {
    const cached = _recall.get(opts.hash);
    if (cached) return { ...cached, cached: true };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SCB_TIMEOUT_MS);
  try {
    const base64Image = await toBase64(imageData);
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image_b64: base64Image, hint: opts.hint ?? null }),
      signal: controller.signal,
    });
    if (!res.ok) {
      logger.warn('SCB VLM endpoint returned non-OK; falling back to costed provider', {
        status: res.status,
      });
      return null;
    }
    const json: any = await res.json();
    const result: ScbVlmResult = {
      ocrText: String(json?.ocrText ?? json?.ocr_text ?? json?.description ?? ''),
      entities: Array.isArray(json?.entities) ? json.entities.map((e: unknown) => String(e)) : [],
      confidence: Number(json?.confidence ?? json?.confidenceScore ?? 0) || 0,
      cached: Boolean(json?.cached),
      model: json?.model ? String(json.model) : undefined,
      raw: json,
    };
    if (!result.ocrText && result.entities.length === 0) {
      return null; // nothing usable — let the costed provider try
    }
    if (opts.hash) _recall.set(opts.hash, result);
    return result;
  } catch (error) {
    logger.warn('SCB VLM call failed; falling back to costed provider', { error });
    return null;
  } finally {
    clearTimeout(timer);
  }
}
