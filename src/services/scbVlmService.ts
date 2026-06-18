import { GISMetadata, GraphData, TokenizationData, ScanType, TaxonomyData, ItemAttributes, SceneryAttributes, ReadingOrderBlock } from "../types";
import { geminiLogger as logger } from "../lib/logger";

const DEFAULT_URL = "http://127.0.0.1:8787";

export interface ScbProcessResponse {
  ocrText: string;
  gisMetadata: GISMetadata;
  graphData: GraphData;
  tokenization: TokenizationData;
  analysis: string;
  ocrDerivedTimestamp: string | null;
  nlpDerivedTimestamp: string | null;
  ocrDerivedGisZone: string | null;
  nlpDerivedGisZone: string | null;
  nlpNodeCategorization: string;
  preprocessOcrTranscription: string;
  documentTitle: string;
  documentDescription: string;
  creatorAgent: string | null;
  rightsStatement: string;
  languageCode: string;
  confidenceScore: number;
  keywordsTags: string[];
  accessRestrictions: boolean;
  associativeItemTag: string | null;
  suggestedCollection: string;
  taxonomy?: TaxonomyData;
  itemAttributes?: ItemAttributes;
  sceneryAttributes?: SceneryAttributes;
  alt_text_short?: string;
  alt_text_long?: string;
  reading_order?: ReadingOrderBlock[];
  accessibility_score?: number;
  entiretySignal?: Record<string, unknown>;
}

const getScbVlmUrl = (): string => {
  if (typeof import.meta !== "undefined" && import.meta.env?.VITE_SCB_VLM_URL) {
    return import.meta.env.VITE_SCB_VLM_URL.replace(/\/$/, "");
  }
  if (typeof localStorage !== "undefined") {
    const saved = localStorage.getItem("geograph-scb-vlm-url");
    if (saved) return saved.replace(/\/$/, "");
  }
  return DEFAULT_URL;
};

let _healthCache: { ok: boolean; checkedAt: number } | null = null;
const HEALTH_TTL_MS = 30_000;

export const isScbVlmAvailable = async (): Promise<boolean> => {
  const now = Date.now();
  if (_healthCache && now - _healthCache.checkedAt < HEALTH_TTL_MS) {
    return _healthCache.ok;
  }
  const base = getScbVlmUrl();
  try {
    const res = await fetch(`${base}/health`, { method: "GET", signal: AbortSignal.timeout(2500) });
    const ok = res.ok;
    _healthCache = { ok, checkedAt: now };
    return ok;
  } catch {
    _healthCache = { ok: false, checkedAt: now };
    return false;
  }
};

const defaultTokenization = (text: string): TokenizationData => {
  const tokens = text.split(/\s+/).filter(Boolean);
  const freq = new Map<string, number>();
  for (const t of tokens) {
    const k = t.toLowerCase();
    freq.set(k, (freq.get(k) || 0) + 1);
  }
  const topTokens = [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([token, frequency]) => ({ token, frequency }));
  return {
    tokenCount: tokens.length,
    vocabularySize: freq.size,
    topTokens,
    embeddingVectorPreview: [],
  };
};

const mapGatewayResult = (raw: Record<string, unknown>): ScbProcessResponse => {
  const ocrText = String(raw.ocrText || "");
  const graphData = (raw.graphData as GraphData) || { nodes: [], links: [] };
  const gis = (raw.gisMetadata as GISMetadata) || {
    zoneType: "Unknown",
    environmentalContext: "SCB VLM capture",
    nearbyLandmarks: [],
  };

  return {
    ocrText,
    preprocessOcrTranscription: String(raw.preprocessOcrTranscription || ocrText),
    analysis: String(raw.analysis || "Processed via Supply Chain Brain VLM gateway."),
    gisMetadata: {
      ...gis,
      nearbyLandmarks: gis.nearbyLandmarks || [],
    },
    graphData: {
      nodes: graphData.nodes || [],
      links: graphData.links || [],
    },
    tokenization: (raw.tokenization as TokenizationData) || defaultTokenization(ocrText),
    ocrDerivedTimestamp: (raw.ocrDerivedTimestamp as string) || null,
    nlpDerivedTimestamp: (raw.nlpDerivedTimestamp as string) || null,
    ocrDerivedGisZone: (raw.ocrDerivedGisZone as string) || null,
    nlpDerivedGisZone: (raw.nlpDerivedGisZone as string) || null,
    nlpNodeCategorization: String(raw.nlpNodeCategorization || "General"),
    documentTitle: String(raw.documentTitle || "SCB Capture"),
    documentDescription: String(raw.documentDescription || ocrText.slice(0, 240) || "Visual capture"),
    creatorAgent: (raw.creatorAgent as string) || "scb_geograph_vlm",
    rightsStatement: String(raw.rightsStatement || "User capture via SCB"),
    languageCode: String(raw.languageCode || "en"),
    confidenceScore: Number(raw.confidenceScore ?? 0.5),
    keywordsTags: (raw.keywordsTags as string[]) || [],
    accessRestrictions: Boolean(raw.accessRestrictions ?? false),
    associativeItemTag: (raw.associativeItemTag as string) || null,
    suggestedCollection: String(raw.suggestedCollection || "SCB Processing"),
    taxonomy: raw.taxonomy as TaxonomyData | undefined,
    itemAttributes: raw.itemAttributes as ItemAttributes | undefined,
    sceneryAttributes: raw.sceneryAttributes as SceneryAttributes | undefined,
    alt_text_short: raw.alt_text_short as string | undefined,
    alt_text_long: raw.alt_text_long as string | undefined,
    reading_order: raw.reading_order as ReadingOrderBlock[] | undefined,
    accessibility_score: raw.accessibility_score as number | undefined,
    entiretySignal: raw.entiretySignal as Record<string, unknown> | undefined,
  };
};

export const processImageWithScb = async (
  file: File,
  location: { lat: number; lng: number } | null,
  scanType: ScanType = ScanType.DOCUMENT,
  debugMode: boolean = false,
): Promise<ScbProcessResponse> => {
  const base = getScbVlmUrl();
  const form = new FormData();
  form.append("file", file, file.name);
  form.append("scan_type", scanType);
  if (location) {
    form.append("lat", String(location.lat));
    form.append("lng", String(location.lng));
  }

  logger.debug("SCB VLM request", {
    operation: "processImageWithScb",
    url: `${base}/ocr/process`,
    scanType,
    fileName: file.name,
  });

  try {
    const res = await fetch(`${base}/ocr/process`, {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(120_000),
    });
    const payload = await res.json();
    if (!res.ok) {
      throw new Error(payload?.error || `SCB VLM HTTP ${res.status}`);
    }
    const result = payload?.result ?? payload;
    return mapGatewayResult(result as Record<string, unknown>);
  } catch (error: unknown) {
    const err = error as Error;
    logger.error("SCB VLM processing failed", error, { operation: "processImageWithScb" });
    const msg = err.message || "SCB VLM gateway unavailable";
    if (debugMode) {
      throw new Error(`DEBUG_ERR: ${msg}`);
    }
    throw new Error(msg);
  }
};

/** Prefer SCB when reachable; otherwise fall back to Gemini. */
export const processImageOptimized = async (
  file: File,
  location: { lat: number; lng: number } | null,
  scanType: ScanType = ScanType.DOCUMENT,
  debugMode: boolean = false,
): Promise<ScbProcessResponse> => {
  if (await isScbVlmAvailable()) {
    return processImageWithScb(file, location, scanType, debugMode);
  }
  const { processImageWithGemini } = await import("./geminiService");
  return processImageWithGemini(file, location, scanType, debugMode) as Promise<ScbProcessResponse>;
};