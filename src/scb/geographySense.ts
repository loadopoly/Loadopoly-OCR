/**
 * Geography Sense – Algorithms
 *
 * Client-side implementations of the SCB geospatial perception algorithms:
 *
 *   - Composite sense confidence from coordinate trust × OCR confidence × depth
 *   - Sinusoidal weighted-average jitter resolution for multi-observation fusion
 *   - Torus expansion radius derived from confidence and base GPS accuracy
 *   - Inverse derivation of missing positions from graph neighbour topology
 *   - GeographySense builder helper
 *
 * These algorithms are the client-side counterparts to the spatial processing
 * performed in `supabase/functions/spatial-coordinates/index.ts`.  The same
 * mathematical primitives are replicated inline in the edge function (which
 * cannot import from `src/`) but must be kept in sync with this file.
 *
 * Lidar / scan-frame analogy
 * ──────────────────────────
 * Each OCR capture event is modelled as a Lidar scan frame:
 *   - DevicePose       ↔  sensor origin + orientation in world space
 *   - SpatialObject    ↔  individual range measurement (range + bearing)
 *   - GeographySense   ↔  full scan frame (timestamped, origin-anchored)
 *   - ANCHOR_COUNT     ↔  number of accumulated frames at this location
 *   - TorusExpansion   ↔  per-point positional uncertainty ellipsoid
 *
 * @module scb/geographySense
 * @version 2.21.0
 */

import { CoordinateSource, GraphData } from '../types';
import {
  GeographySense,
  DevicePose,
  SpatialObject,
  SpatialJitterSample,
  JitterResolutionResult,
  TorusExpansionResult,
  InverseDerivationResult,
} from './types';

// ============================================
// Coordinate Source Trust Weights
// ============================================

/**
 * Ordered trust weights for coordinate origins.
 * Mirror the CoordinateSource ordering in `src/types/index.ts`.
 */
const COORDINATE_TRUST: Record<CoordinateSource, number> = {
  'exif': 0.95,
  'device-live': 0.85,
  'device-delayed': 0.65,
  'ai-inferred': 0.40,
  'none': 0.0,
};

/**
 * Conservative default horizontal GPS uncertainty when `accuracyM` is
 * not available from the device (30 m is a typical urban-outdoor value).
 */
const DEFAULT_ACCURACY_M = 30;

// ============================================
// Composite Sense Confidence
// ============================================

/**
 * Calculate the composite confidence for a single geospatial sense event.
 *
 * Formula:
 *   confidence = coordinateTrust × ocrConfidence × triangulationQuality
 *
 * Where:
 *   triangulationQuality = 1 − 1 / (triangulationDepth + 1)
 *
 * The triangulation quality factor approaches 1 asymptotically as
 * independent observations accumulate (ANCHOR_COUNT → ∞), mirroring
 * how a Lidar map becomes more certain as scan frames accumulate.
 *
 * @param coordinateSource  Trust level of the GPS / coordinate origin
 * @param ocrConfidence     OCR extraction confidence [0–1]
 * @param triangulationDepth  Number of fused independent observations
 */
export function calculateSenseConfidence(
  coordinateSource: CoordinateSource,
  ocrConfidence: number,
  triangulationDepth: number
): number {
  const coordinateTrust = COORDINATE_TRUST[coordinateSource] ?? 0;
  const clampedOcr = Math.max(0, Math.min(1, ocrConfidence));
  // Asymptotic quality: 0 at depth=0, 0.5 at depth=1, 0.9 at depth=9, →1
  const triangulationQuality = 1 - 1 / (triangulationDepth + 1);
  return coordinateTrust * clampedOcr * triangulationQuality;
}

// ============================================
// Sinusoidal Weighted-Average Jitter Resolution
// ============================================

/**
 * Fuse multiple position observations using sinusoidal weighted averaging.
 *
 * Each observation i (1-indexed) receives weight:
 *   w_i = sin(π × i / (N + 1))
 *
 * This bell-shaped weight profile de-emphasises the first and last
 * observations (more likely outliers from device start-up / network lag)
 * while maximising the contribution of mid-sequence, steady-state readings.
 *
 * The "sinoidal gap region" is the angular zone around device pitch ≈ 0°
 * where `estimateDistanceFromPitch` returns NaN.  The sinusoidal WA bridges
 * this gap by interpolating smoothly between observations on either side,
 * maintaining a continuous position estimate throughout the gap.
 *
 * Use `resolveSpatialJitterIncremental` when only the current mean + count
 * are available (the running-estimate pattern used in the edge function).
 *
 * @param samples  Two or more position observations with weights and indices
 */
export function resolveSpatialJitter(
  samples: SpatialJitterSample[]
): JitterResolutionResult {
  if (samples.length === 0) {
    throw new Error('resolveSpatialJitter: samples array must not be empty');
  }
  if (samples.length === 1) {
    return {
      lat: samples[0].lat,
      lng: samples[0].lng,
      residualJitterM: 0,
      sampleCount: 1,
      method: 'single',
    };
  }

  const N = samples.length;
  let totalWeight = 0;
  let weightedLat = 0;
  let weightedLng = 0;

  for (let i = 0; i < N; i++) {
    // 1-indexed sinusoidal weight — peaks at the centre of the sequence
    const sinWeight = Math.sin((Math.PI * (i + 1)) / (N + 1));
    const combinedWeight = sinWeight * samples[i].weight;
    weightedLat += samples[i].lat * combinedWeight;
    weightedLng += samples[i].lng * combinedWeight;
    totalWeight += combinedWeight;
  }

  const fusedLat = weightedLat / totalWeight;
  const fusedLng = weightedLng / totalWeight;

  // Residual jitter = max haversine distance from fused position to any sample
  const residualJitterM = Math.max(
    ...samples.map(s => haversineDistanceM(s.lat, s.lng, fusedLat, fusedLng))
  );

  return {
    lat: fusedLat,
    lng: fusedLng,
    residualJitterM,
    sampleCount: N,
    method: 'sinusoidal-wa',
  };
}

/**
 * Incremental sinusoidal weighted-average update.
 *
 * Used when only the current mean position and observation count are
 * available (the `ANCHOR_COUNT` pattern in `spatial-coordinates`).
 *
 * Sinusoidal learning rate:
 *   α = sin(π / (2 × (count + 1)))
 *
 *   count = 1  → α ≈ 0.707  (large initial correction)
 *   count = 5  → α ≈ 0.259
 *   count = 20 → α ≈ 0.074
 *   count → ∞  → α → 0      (stabilisation)
 *
 * This smooth convergence resolves the field jitter that the naive
 * running-mean produces when observations have high variance.
 *
 * @param existingLat  Current best-estimate latitude
 * @param existingLng  Current best-estimate longitude
 * @param newLat       New observation latitude
 * @param newLng       New observation longitude
 * @param count        Total observations including the new one
 */
export function resolveSpatialJitterIncremental(
  existingLat: number,
  existingLng: number,
  newLat: number,
  newLng: number,
  count: number
): { lat: number; lng: number } {
  const alpha = Math.sin(Math.PI / (2 * (count + 1)));
  return {
    lat: alpha * newLat + (1 - alpha) * existingLat,
    lng: alpha * newLng + (1 - alpha) * existingLng,
  };
}

// ============================================
// Torus Expansion
// ============================================

/**
 * Compute the spatial uncertainty torus around an anchored position.
 *
 * The torus models the 2-D uncertainty band in which the true physical
 * location of an OCR-detected object lies.  As ANCHOR_COUNT grows, the
 * torus collapses:
 *   innerRadius ↑  and  outerRadius ↓  until both → 0
 *
 * The outer radius defines the spatial neighbourhood for SPATIAL_PROXIMITY
 * edge inference: graph nodes whose positions fall within `outerRadiusM`
 * are candidates for automatic edge creation.
 *
 * @param confidence    Composite sense confidence [0–1]
 * @param baseAccuracyM Device GPS accuracy in metres (default 30 m)
 */
export function computeTorusExpansion(
  confidence: number,
  baseAccuracyM = DEFAULT_ACCURACY_M
): TorusExpansionResult {
  const c = Math.max(0.001, Math.min(1, confidence));
  const innerRadiusM = baseAccuracyM * (1 - c);
  const outerRadiusM = baseAccuracyM / c;
  const nominalRadiusM = (innerRadiusM + outerRadiusM) / 2;
  return { innerRadiusM, outerRadiusM, nominalRadiusM, confidence: c };
}

// ============================================
// Inverse Spatial Derivation
// ============================================

/**
 * Derive a missing world-space position from connected graph anchor nodes.
 *
 * When direct triangulation fails (distanceM = null, sinoidal gap region),
 * this function computes a confidence-weighted centroid of neighbouring
 * nodes that already have known lat/lng.
 *
 * The weight of each neighbour is:
 *   w = edgeConfidence × ln(anchorCount + 1)
 *
 * Using ln(anchorCount + 1) means more thoroughly-observed anchors
 * contribute more, but with diminishing returns (mirrors Bayesian
 * accumulation of evidence).
 *
 * This is the "inverse derivation from world-space projection edges":
 * working backwards from the known graph edge topology to resolve
 * un-anchored positions rather than leaving them null.
 *
 * @param neighbours  Known-position neighbours with confidence and anchorCount
 */
export function inverseDeriveSpatialPosition(
  neighbours: Array<{
    lat: number;
    lng: number;
    confidence: number;
    anchorCount: number;
    nodeId?: string;
  }>
): InverseDerivationResult | null {
  const valid = neighbours.filter(
    n => Number.isFinite(n.lat) && Number.isFinite(n.lng)
  );
  if (valid.length === 0) return null;

  let totalWeight = 0;
  let weightedLat = 0;
  let weightedLng = 0;
  const anchorNodeIds: string[] = [];

  for (const n of valid) {
    const w = n.confidence * Math.log(n.anchorCount + 1);
    weightedLat += n.lat * w;
    weightedLng += n.lng * w;
    totalWeight += w;
    if (n.nodeId) anchorNodeIds.push(n.nodeId);
  }

  if (totalWeight === 0) return null;

  // Derived confidence grows logarithmically with neighbour count
  // (single anchor → 0.4; 6 anchors → 0.84; capped at 0.85)
  const derivedConfidence = Math.min(0.85, 0.4 * Math.log(valid.length + 1));

  return {
    derivedLat: weightedLat / totalWeight,
    derivedLng: weightedLng / totalWeight,
    confidence: derivedConfidence,
    anchorNodeIds,
    method: 'graph-weighted-centroid',
  };
}

// ============================================
// GeographySense Builder
// ============================================

/**
 * Build a GeographySense object from raw capture data.
 *
 * Computes composite confidence, torus radius, and populates all fields
 * required by the GeographySense interface.
 *
 * @example
 * ```typescript
 * const sense = buildGeographySense({
 *   devicePose: { lat: 51.5, lng: -0.1, altM: 10, compassHeadingDeg: 90,
 *                 pitchDeg: -5, rollDeg: 0, accuracyM: 5 },
 *   detectedObjects: [{ label: 'Sign', confidence: 0.88 }],
 *   coordinateSource: 'device-live',
 *   ocrConfidence: 0.88,
 *   triangulationDepth: 3,
 *   graphDelta: { nodes: [], links: [] },
 *   sensorPayloadHash: 'sha256hex…',
 * });
 * ```
 */
export function buildGeographySense(params: {
  captureId?: string;
  devicePose: DevicePose;
  detectedObjects: SpatialObject[];
  coordinateSource: CoordinateSource;
  ocrConfidence: number;
  triangulationDepth: number;
  graphDelta: GraphData;
  sensorPayloadHash: string;
}): GeographySense {
  const captureId = params.captureId ?? crypto.randomUUID();
  const confidence = calculateSenseConfidence(
    params.coordinateSource,
    params.ocrConfidence,
    params.triangulationDepth
  );
  const torus = computeTorusExpansion(
    confidence,
    params.devicePose.accuracyM ?? DEFAULT_ACCURACY_M
  );

  return {
    captureId,
    devicePose: params.devicePose,
    detectedObjects: params.detectedObjects,
    coordinateSource: params.coordinateSource,
    confidence,
    triangulationDepth: params.triangulationDepth,
    graphDelta: params.graphDelta,
    timestamp: new Date().toISOString(),
    fixityChecksum: params.sensorPayloadHash,
    torusRadiusM: torus.nominalRadiusM,
  };
}

// ============================================
// Internal utility
// ============================================

/**
 * Haversine distance between two lat/lng points in metres.
 * Used internally for residual jitter estimation.
 */
function haversineDistanceM(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const Δφ = toRad(lat2 - lat1);
  const Δλ = toRad(lng2 - lng1);
  const a =
    Math.sin(Δφ / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
