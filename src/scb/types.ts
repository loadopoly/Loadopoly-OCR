/**
 * System Core Bridge (SCB) – Type Definitions
 *
 * Defines the interfaces and types for the SCB integration layer, which
 * connects the edge OCR sensor (Tesseract.js WASM) to the cloud processing
 * pipeline and the geospatial perception subsystem.
 *
 * Design overview
 * ───────────────
 * The SCB acts as a Sensor-Cognition Bridge — an abstraction layer over the
 * Gemini / server processing route that enables:
 *
 *   1. Alternative routing (SCB endpoint vs. self-reinvoke) in the auto-chain
 *      (process-ocr/index.ts lines 219–229).
 *   2. Corpus strengthening: graph enrichment before assets are marked MINTED.
 *   3. Geography-as-Sense: each OCR capture becomes a typed perception unit
 *      analogous to a Lidar scan frame.
 *   4. Sinusoidal weighted-average jitter resolution for multi-observation
 *      position fusion (addresses the "sinoidal gap region" near device
 *      pitch ≈ 0° where pitch-based distance estimation returns NaN).
 *   5. Torus expansion: models the spatial uncertainty band that collapses
 *      as ANCHOR_COUNT grows.
 *   6. Inverse spatial derivation: infer missing world-space positions from
 *      connected graph topology when direct triangulation fails.
 *
 * Environment variables consumed
 * ───────────────────────────────
 *   SCB_ENABLED=true           master on/off for SCB routing
 *   SCB_ENDPOINT=<url>         target URL for SCB processing batches
 *   SCB_CORPUS_STRENGTHEN=true run corpus enrichment before MINTED commit
 *   SCB_INVERSE_DERIVE=true    enable gap-fill via graph-topology derivation
 *
 * @module scb/types
 * @version 2.21.0
 */

import { CoordinateSource, GraphData } from '../types';

// ============================================
// SCB Routing
// ============================================

/**
 * Determines which cloud processor handles the next batch in the auto-chain.
 *
 * - `'gemini'` – self-reinvoke process-ocr (default, existing behaviour)
 * - `'scb'`    – route to SCB_ENDPOINT for alternate server-side processing
 * - `'auto'`   – prefer SCB when available, fall back to gemini
 */
export type SCBRouteMode = 'gemini' | 'scb' | 'auto';

/** Runtime configuration for the SCB layer, mirroring env vars */
export interface SCBConfig {
  /** Master enable flag (mirrors SCB_ENABLED env var) */
  enabled: boolean;
  /** URL of the SCB processing endpoint (mirrors SCB_ENDPOINT env var) */
  endpoint?: string;
  /** How to route the next batch once the current batch completes */
  routeMode: SCBRouteMode;
  /** Whether to run corpus enrichment before marking assets MINTED */
  corpusStrengthen: boolean;
  maxRetries: number;
  timeoutMs: number;
}

/** Payload sent to the chain target when SCB routing is active */
export interface SCBChainRequest {
  maxJobs: number;
  routeMode: SCBRouteMode;
  /** Correlation ID that persists across the full chain for tracing */
  scbSession?: string;
  strengthenCorpus?: boolean;
}

/** Per-job result summary written into RESULT_DATA */
export interface SCBProcessingResult {
  assetId: string;
  route: SCBRouteMode;
  corpusStrengthened: boolean;
  strengtheningSummary?: CorpusStrengtheningResult;
  processingTimeMs: number;
}

// ============================================
// Corpus Strengthening
// ============================================

/** Summary returned by the corpus strengthening pass */
export interface CorpusStrengtheningResult {
  /** New graph_node rows created during strengthening */
  entitiesAdded: number;
  /** ENTITY_CO_OCCURS graph_edge rows upserted */
  edgesAdded: number;
  /** Existing spatial anchors cross-linked to new nodes */
  spatialAnchorsLinked: number;
  /** SHA-256 of OCR text + title for integrity verification */
  fixityChecksum: string;
  /** ISO-8601 timestamp of when strengthening completed */
  strengthenedAt: string;
}

// ============================================
// Geography Sense
// ============================================

/**
 * A structured geospatial perception event.
 *
 * Analogous to a Lidar scan frame: a single capture event produces a
 * timestamped, origin-anchored collection of world-space positions with
 * a formal trust chain. Multiple GeographySense events fuse together
 * via ANCHOR_COUNT averaging, improving position accuracy over time.
 *
 * Confidence formula:
 *   confidence = coordinateSourceTrust × ocrConfidence × triangulationQuality
 *   where triangulationQuality = 1 − 1 / (triangulationDepth + 1)
 */
export interface GeographySense {
  /** Unique capture identifier (UUID) */
  captureId: string;
  /** Device pose at the moment of capture */
  devicePose: DevicePose;
  /** Objects spatially detected in the capture frame */
  detectedObjects: SpatialObject[];
  /** Provenance of the coordinate origin (trust hierarchy) */
  coordinateSource: CoordinateSource;
  /**
   * Composite sense confidence [0–1].
   * Derived from: coordinateSourceTrust × ocrConfidence × triangulationQuality.
   */
  confidence: number;
  /**
   * Number of independent observations fused into the current position estimate.
   * Directly maps to ANCHOR_COUNT in graph_nodes. Higher = more certain.
   */
  triangulationDepth: number;
  /** Incremental graph delta produced by processing this sense event */
  graphDelta: GraphData;
  /** ISO-8601 capture timestamp */
  timestamp: string;
  /**
   * SHA-256 of the raw sensor payload for fixity verification.
   * Re-hash the original capture data and compare to detect tampering.
   */
  fixityChecksum: string;
  /**
   * Torus nominal radius (metres): the centre-line of the spatial uncertainty
   * band. Shrinks as triangulationDepth increases, collapsing toward a point.
   */
  torusRadiusM: number;
}

/** Device pose at the moment of an OCR capture */
export interface DevicePose {
  lat: number;
  lng: number;
  altM: number;
  compassHeadingDeg: number;
  pitchDeg: number;
  rollDeg: number;
  /** GPS horizontal accuracy in metres, if available */
  accuracyM?: number;
}

/** A single spatially-detected object within a GeographySense frame */
export interface SpatialObject {
  label: string;
  recognizedText?: string;
  confidence: number;
  bbox?: { x: number; y: number; w: number; h: number };
  knownSizeM?: number;
  /** Projected world-space position (null if in the sinoidal gap region) */
  subjectLat?: number | null;
  subjectLng?: number | null;
  subjectBearingDeg?: number;
  subjectDistanceM?: number | null;
  graphNodeId?: string | null;
}

// ============================================
// Spatial Jitter Resolution
// ============================================

/** A single position observation fed into the jitter filter */
export interface SpatialJitterSample {
  lat: number;
  lng: number;
  /** Observation weight (e.g. OCR confidence, GPS accuracy inverse) */
  weight: number;
  /** Sequential observation index, 0-based */
  index: number;
}

/**
 * Result of sinusoidal weighted-average jitter resolution.
 *
 * The sinusoidal WA bridges the "sinoidal gap region": the angular zone
 * near device pitch ≈ 0° where `estimateDistanceFromPitch` returns NaN.
 * Weighting observations with sin(π × (i+1) / (N+1)) applies a smooth
 * approach curve converging toward a stable position as N → ∞, without
 * storing all historical observations.
 */
export interface JitterResolutionResult {
  lat: number;
  lng: number;
  /** Remaining positional uncertainty in metres after fusion */
  residualJitterM: number;
  /** Number of samples fused */
  sampleCount: number;
  /** Algorithm variant applied */
  method: 'sinusoidal-wa' | 'incremental-avg' | 'single';
}

// ============================================
// Torus Expansion
// ============================================

/**
 * Models the spatial uncertainty zone around a physical anchor as a torus.
 *
 * The inner radius is the high-confidence core; the outer radius is the
 * maximum plausible extent. As ANCHOR_COUNT grows the torus collapses
 * toward a point (inner ↑, outer ↓).
 *
 * The outer radius defines the neighbourhood for SPATIAL_PROXIMITY edge
 * inference: graph nodes within outerRadiusM are candidates for automatic
 * spatial edge creation.
 */
export interface TorusExpansionResult {
  /** Minimum uncertainty radius (metres) — high-confidence core */
  innerRadiusM: number;
  /** Maximum uncertainty radius (metres) — maximum plausible extent */
  outerRadiusM: number;
  /** Centre-line radius used for graph edge weighting */
  nominalRadiusM: number;
  confidence: number;
}

// ============================================
// Inverse Spatial Derivation
// ============================================

/**
 * Derives a missing world-space position from connected graph anchor nodes.
 *
 * When direct triangulation fails (distanceM = null, sinoidal gap region),
 * SCB walks the graph topology to find neighbours with known lat/lng and
 * computes their confidence-weighted centroid as an inferred position.
 *
 * This is the "inverse derivation from world-space projection edges":
 * working backwards from known graph edges to resolve unanchored positions.
 */
export interface InverseDerivationResult {
  derivedLat: number;
  derivedLng: number;
  /** Confidence of the derived position [0–1] */
  confidence: number;
  /** IDs of the graph_node anchors used in the derivation */
  anchorNodeIds: string[];
  method: 'graph-weighted-centroid';
}
