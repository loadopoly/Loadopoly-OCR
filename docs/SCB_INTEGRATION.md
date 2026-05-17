# SCB Integration Guide

**System Core Bridge (SCB) — Architecture & Operations Reference**  
Version 2.21.0 · Loadopoly-OCR

---

## Overview

The **System Core Bridge (SCB)** is an integration layer that sits between the
edge OCR sensor (Tesseract.js WASM) and the cloud processing pipeline
(Gemini / Supabase Edge Functions).  It provides:

1. **Route Switch** — redirect the auto-chain from the default Gemini self-invoke
   to an SCB endpoint for alternate server-side processing.
2. **Corpus Strengthening** — enrich the knowledge graph (fixity checksum +
   co-occurrence edges) before assets are marked `MINTED`.
3. **Geography-as-Sense** — formalise each OCR capture as a typed perception unit
   (`GeographySense`) analogous to a Lidar scan frame.
4. **Sinusoidal Jitter Resolution** — smooth multi-observation position fusion for
   spatial anchors, bridging the sinoidal gap region.
5. **Torus Expansion** — model spatial uncertainty as a torus that collapses as
   `ANCHOR_COUNT` grows.
6. **Inverse Spatial Derivation** — gap-fill missing world-space positions from
   connected graph topology.

---

## Architecture Diagram

```
Camera / Scanner
       │ image
       ▼
┌─────────────────────────────┐
│  Tesseract.js (edge sensor) │  low-confidence → escalate
│  edgeOCRService.ts          │─────────────────────────────►┐
└─────────────────────────────┘                              │
                                                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│  process-ocr  (Supabase Edge Function)                              │
│                                                                     │
│   1. claim_processing_job()                                         │
│   2. fetch image from storage                                       │
│   3. callGemini()  ◄── cloud processor (Gemini 2.5 Flash)          │
│   4. saveAsset()                                                    │
│   5. [SCB] strengthenCorpus()  ← SCB_CORPUS_STRENGTHEN=true        │
│   6. complete_processing_job()                                      │
│                                                                     │
│   Auto-chain (SCB Route Switch, lines 219–253):                     │
│     if SCB_ENABLED && SCB_ENDPOINT → route to SCB endpoint          │
│     else                           → self-reinvoke (default)        │
└─────────────────────────────────────────────────────────────────────┘
       │                              │
       ▼ graph delta                  ▼ spatial request
┌──────────────────┐        ┌───────────────────────────────────┐
│  graph_nodes /   │        │  spatial-coordinates              │
│  graph_edges     │        │  (Supabase Edge Function)         │
│  (Supabase DB)   │        │                                   │
│                  │        │  [SCB] sinusoidalUpdate()         │
│                  │        │  [SCB] torusNominalRadiusM()      │
│                  │        │  [SCB] inverse derivation gap-fill│
└──────────────────┘        └───────────────────────────────────┘
```

---

## Environment Variables

| Variable | Type | Default | Description |
|---|---|---|---|
| `SCB_ENABLED` | bool | `false` | Activate SCB routing in the auto-chain |
| `SCB_ENDPOINT` | URL | — | Target URL for SCB batch processing |
| `SCB_CORPUS_STRENGTHEN` | bool | `false` | Enrich graph before MINTED commit |
| `SCB_INVERSE_DERIVE` | bool | `false` | Gap-fill via graph topology in spatial-coordinates |

Set these via Supabase Edge Function secrets:
```bash
supabase secrets set SCB_ENABLED=true
supabase secrets set SCB_ENDPOINT=https://your-scb-server.example.com/process
supabase secrets set SCB_CORPUS_STRENGTHEN=true
supabase secrets set SCB_INVERSE_DERIVE=true
```

---

## 1. Route Switch

**File:** `supabase/functions/process-ocr/index.ts` (lines 219–253)

After each batch completes, the auto-chain logic selects the next processing target:

```
if SCB_ENABLED=true and SCB_ENDPOINT is set:
    POST SCB_ENDPOINT  {maxJobs, routeMode: 'scb', scbSession, strengthenCorpus}
    Header: X-SCB-Session: <12-char UUID prefix>
else (default):
    POST /functions/v1/process-ocr  {maxJobs, routeMode: 'gemini', scbSession}
```

The `scbSession` correlation ID persists across the full processing chain and
appears in `X-SCB-Session` headers, enabling distributed tracing.

**Backwards compatibility:** Without any SCB env vars the behaviour is identical
to the previous implementation.

---

## 2. Corpus Strengthening

**File:** `supabase/functions/process-ocr/index.ts` — `strengthenCorpus()` function

When `SCB_CORPUS_STRENGTHEN=true` is set, after `saveAsset()` completes and before
`complete_processing_job()` commits the result, the following steps run:

### Step 1: SHA-256 Fixity Checksum

```
payload = documentTitle + "\n" + ocrText
FIXITY_CHECKSUM = SHA-256(payload)
```

The checksum is persisted to `historical_documents_global.FIXITY_CHECKSUM`.
Re-hashing the original text and comparing detects accidental corruption or
tampering of the OCR record.

### Step 2: Entity Co-occurrence Edges

All entities extracted in the same document are connected via
`ENTITY_CO_OCCURS` graph edges in `graph_edges`:

```
For every pair (entity_i, entity_j) in entities[0..19]:
  UPSERT graph_edges SET
    FROM_NODE_ID = graph_node(entity_i).ID
    TO_NODE_ID   = graph_node(entity_j).ID
    RELATIONSHIP = 'ENTITY_CO_OCCURS'
    CONFIDENCE   = result.confidence
    WEIGHT       = 0.5
    ASSET_IDS    = [job.asset_id]
  ON CONFLICT (FROM_NODE_ID, TO_NODE_ID, RELATIONSHIP) IGNORE
```

Corpus strengthening is **non-fatal**: if any step fails the job still completes.
The result is serialised into `RESULT_DATA.strengtheningMeta`.

---

## 3. Geography-as-Sense

**Files:** `src/scb/types.ts`, `src/scb/geographySense.ts`

Each OCR capture event is modelled as a **`GeographySense`** — an analogue to a
Lidar scan frame:

| Lidar concept | Geography-as-Sense equivalent |
|---|---|
| Sensor origin | `DevicePose` (lat/lng/alt + heading/pitch/roll) |
| Range measurement | `SpatialObject` (label + bbox + confidence) |
| Scan frame | `GeographySense` (timestamped, origin-anchored) |
| Accumulated frames | `triangulationDepth` / `ANCHOR_COUNT` |
| Point cloud | `graphDelta` (new nodes + edges this sense produced) |
| Positional uncertainty | `torusRadiusM` |

### Composite Sense Confidence

```
confidence = coordinateSourceTrust × ocrConfidence × triangulationQuality
```

Where:

- `coordinateSourceTrust`: `exif`=0.95, `device-live`=0.85, `device-delayed`=0.65,
  `ai-inferred`=0.40, `none`=0.0
- `triangulationQuality = 1 − 1/(triangulationDepth + 1)` — approaches 1 as
  observations accumulate

### Fixity Checksum

```
fixityChecksum = SHA-256(raw sensor payload)
```

Re-hashing the original capture data and comparing enables integrity verification
of the GeographySense record.

---

## 4. Sinusoidal Jitter Resolution

**Files:** `src/scb/geographySense.ts`, `supabase/functions/spatial-coordinates/index.ts`

### The Problem: Sinusoidal Gap Region

> **Terminology note:** "sinoidal gap region" is the project-domain term used
> in the problem specification.  It corresponds to the standard mathematical
> concept of a **sinusoidal** interpolation zone.  Both terms refer to the
> same phenomenon described below.

`estimateDistanceFromPitch` returns `NaN` when device pitch is within ±2° of
horizontal.  This creates a gap region where no distance can be computed.
Multiple observations around this zone produce high-variance position estimates
(field jitters).

### Full-batch algorithm (`resolveSpatialJitter`)

For N stored observations, weight each by:

```
w_i = sin(π × (i+1) / (N+1))
```

This bell-shaped profile de-emphasises outliers at the start/end of the sequence
and maximises contribution from steady-state mid-sequence observations.

### Incremental algorithm (`sinusoidalUpdate` in edge function)

When only the running mean and count are available (the `ANCHOR_COUNT` pattern):

```
α = sin(π / (2 × (count + 1)))
newLat = α × observedLat + (1 − α) × existingLat
newLng = α × observedLng + (1 − α) × existingLng
```

Learning rate behaviour:

| count | α |
|---|---|
| 1 | 0.707 |
| 5 | 0.259 |
| 20 | 0.074 |
| ∞ | → 0 |

This replaced the previous naive incremental mean in `spatial-coordinates`.

---

## 5. Torus Expansion

**Files:** `src/scb/geographySense.ts`, `supabase/functions/spatial-coordinates/index.ts`

The **torus** models the 2-D uncertainty band around an anchored position:

```
innerRadiusM = baseAccuracyM × (1 − confidence)   // high-confidence core
outerRadiusM = baseAccuracyM / confidence           // maximum plausible extent
nominalRadiusM = (inner + outer) / 2               // centre-line
```

As `ANCHOR_COUNT` grows → `confidence` grows → torus collapses toward a point.

The **outer radius** defines the neighbourhood for `SPATIAL_PROXIMITY` edge
inference: graph nodes whose world-space positions fall within `outerRadiusM` are
candidates for automatic edge creation, enabling "torus expansion" to propagate
spatial relationships across the graph.

---

## 6. Inverse Spatial Derivation

**Files:** `src/scb/geographySense.ts`, `supabase/functions/spatial-coordinates/index.ts`

When direct triangulation returns `null` (sinoidal gap region), and
`SCB_INVERSE_DERIVE=true` is set, the edge function queries `graph_nodes` for
the most-anchored node with the same label:

```sql
SELECT LAT, LNG, ANCHOR_COUNT
FROM graph_nodes
WHERE LABEL = :label AND LAT IS NOT NULL
ORDER BY ANCHOR_COUNT DESC
LIMIT 1
```

If found, the previously-established world-space position is inherited, ensuring
the spatial anchor row is created even when pitch-based distance fails.

The client-side `inverseDeriveSpatialPosition()` function implements the full
graph-weighted-centroid variant: for nodes connected via graph edges whose
neighbours have known positions, it computes:

```
weight_i = edgeConfidence_i × ln(anchorCount_i + 1)
derivedLat = Σ(lat_i × weight_i) / Σ(weight_i)
derivedLng = Σ(lng_i × weight_i) / Σ(weight_i)
```

---

## 7. Client-side Integration

### Register the Corpus Strengthener

```typescript
import { corpusStrengthener } from './scb/corpusStrengthener';
import { moduleRegistry } from './modules/registry';

moduleRegistry.registerProcessor(corpusStrengthener);
```

This registers the `post-ocr` processor that computes fixity checksums and
infers co-occurrence edges in the client-side processing pipeline.

### Build a GeographySense

```typescript
import { buildGeographySense } from './scb/geographySense';

const sense = buildGeographySense({
  devicePose: { lat: 51.5, lng: -0.1, altM: 10,
                compassHeadingDeg: 90, pitchDeg: -5, rollDeg: 0, accuracyM: 5 },
  detectedObjects: [{ label: 'Victorian Sign', confidence: 0.91 }],
  coordinateSource: 'device-live',
  ocrConfidence: 0.91,
  triangulationDepth: 3,
  graphDelta: { nodes: [], links: [] },
  sensorPayloadHash: await sha256hex(rawPayload),
});
// sense.confidence ≈ 0.85 × 0.91 × 0.75 ≈ 0.580
// sense.torusRadiusM (at 5m GPS accuracy) ≈ 4.9m
```

### Resolve Jitter from Multiple Observations

```typescript
import { resolveSpatialJitter } from './scb/geographySense';

const result = resolveSpatialJitter([
  { lat: 51.5001, lng: -0.1001, weight: 0.9, index: 0 },
  { lat: 51.5003, lng: -0.1003, weight: 0.7, index: 1 },  // gap observation
  { lat: 51.5002, lng: -0.1002, weight: 0.95, index: 2 },
]);
// result.method === 'sinusoidal-wa'
// result.residualJitterM ≈ 15m (Haversine to most distant sample)
```

---

## 8. Files Added / Modified

| File | Type | Description |
|---|---|---|
| `src/scb/types.ts` | New | SCB type definitions |
| `src/scb/geographySense.ts` | New | Geography sense algorithms |
| `src/scb/corpusStrengthener.ts` | New | IProcessor for post-ocr corpus enrichment |
| `supabase/functions/process-ocr/index.ts` | Modified | SCB route switch + corpus strengthening |
| `supabase/functions/spatial-coordinates/index.ts` | Modified | Jitter resolution + torus + inverse derivation |
| `docs/SCB_INTEGRATION.md` | New | This document |

---

## 9. Security Notes

- The SCB endpoint receives the same `Authorization: Bearer <service-role-key>`
  header as the self-invoke path.  Restrict `SCB_ENDPOINT` to a trusted
  internal URL and validate the header on the SCB server.
- `strengthenCorpus` caps entity processing at 20 entities per document to bound
  the N² edge-creation cost (`O(20²/2) = 190` upserts maximum).
- All SCB operations are non-fatal wrappers; they cannot cause job failure.
- `SCB_INVERSE_DERIVE` adds one SELECT query per unanchored object.  Enable only
  for deployments where spatial gap-fill precision outweighs the DB cost.
