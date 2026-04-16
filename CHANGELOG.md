## [v2.20.0] - 2026-04-16

### Added
- **`historical_documents_global` CREATE TABLE**: Full DDL with all 50+ columns including `LATITUDE`/`LONGITUDE` added to `CONSOLIDATED_SCHEMA.sql`. Schema is now fully self-contained.
- **Credit System Tables**: `user_credits` and `credit_transactions` added to consolidated schema with RLS policies and indexes.
- **Cloudflare Workers**: `wrangler.toml` for `geograph` service serving `www.loadopoly.com` via static assets from `./dist`.
- **Supabase Migration**: `20260416000000_historical_documents_global.sql` — safe for fresh and existing databases.
- **Benchmarks Document**: `docs/technical/BENCHMARKS.md` covering build, schema, sizing, Stripe, admin controls, and testing.
- **TypeScript Types**: `user_credits` and `credit_transactions` added to `database.types.ts`.

### Fixed
- **`creditService.ts`**: Column casing corrected to match deployed migration (lowercase: `credits_remaining`, `user_id`, etc.).
- **Schema Simplification**: Removed conditional `DO $$ ... END $$` blocks for `historical_documents_global` — table now always created directly.

### Changed
- **Schema Version**: `CONSOLIDATED_SCHEMA.sql` bumped to v3.3.0 (26 tables, 54 indexes, 61 RLS policies, 19 functions).
- **Composite Index**: Added `idx_documents_lat_lng` for geospatial queries on LATITUDE/LONGITUDE.

## [v2.19.3] - 2026-04-15

### Fixed
- **Sidebar Freeze**: Boot sequence blocked the main thread with sequential per-asset IndexedDB writes. Now uses `bulkPut` (single transaction) and renders local assets immediately before background sync.
- **IndexedDB**: Added `saveAssets()` bulk write function to avoid O(n) individual transactions.
- **Manual Bundle**: Fixed sequential save loop to use bulk write.

## [v2.19.2] - 2026-04-15

### Performance
- **Deep Dynamic Import Deferral**: Converted 9 remaining static service imports (creditService, bundleService, syncEngine, indexeddb, auth, supabaseService, processingQueueService, workerPool, batchProcessorService) to dynamic `import()` at 38 call sites.
- **Additional Lazy Components**: CameraCapture, PrivacyPolicyModal, CreditGate, and CreditBadge now lazy-loaded with Suspense boundaries.
- **App Chunk Reduction**: 148KB → 118KB (20% smaller, 29KB gzipped). Vendor-supabase (169KB) and vendor-storage (96KB) fully deferred from initial load.

## [v2.19.1] - 2026-04-15

### Fixed
- **Dashboard Routing**: Fixed auto-navigation bug that forced the app to Knowledge Graph tab on every load instead of staying on Dashboard. The first-OCR celebration redirect now correctly fires only once (persisted via UX preferences).
- **Performance**: Reduced initial App bundle from 340KB to 148KB (57% smaller) by lazy-loading 17 heavy components (GraphVisualizer, ARScene, WorldRenderer, SocialApp, SettingsPanel, etc.) and deferring Gemini AI, image compression, and web3 service imports to call sites.
- **Worker Pool**: Deferred worker thread creation to on-demand instead of eager spawn at mount.

## [v2.19.0] - 2026-04-15\n\n### Reverted\n- **Stability Degradation**: Reverted to stable commit `0acd35a` (from Monday morning) to address severe regressions in application load time and sidebar responsiveness.\n\n# Changelog

All notable changes to this project will be documented in this file.
See [RELEASE_NOTES.md](RELEASE_NOTES.md) for a high-level summary of recent major updates.

## [2.18.0] - 2026-04-12

### Relational Sizing Dynamic & Physical Dimension Tracking

**Feature:** Expanded the system to support "Relational Sizing" — the ability to infer the absolute physical dimensions of objects (like trees) by comparing them to known reference objects (like bottles) within the same scene.

**Core Changes:**
- **Relational Sizing Strategy**: New `relationalSizingStrategy` in the Graph Healer module. It automatically propagates physical height/width from reference nodes to connected unknown nodes using calculated scale ratios.
- **Physical Schema Extension**: Updated `graph_nodes` and `graph_edges` tables with `PHYSICAL_HEIGHT_M`, `PHYSICAL_WIDTH_M`, `IS_REFERENCE_OBJECT`, and `RELATIVE_SCALE` fields.
- **Sizing Reference Library**: Seeded the database with standard reference objects (500ml Water Bottle, Soda Can, Credit Card, iPhone 15, A4/US Letter paper) to provide grounding for real-world scaling.
- **Enhanced OCR Pipeline**: Updated the Gemini-based `process-ocr` Edge Function to recognize reference objects and compute relative bounding box ratios.

**Files changed:**
- `src/modules/sizingStrategy.ts` (New)
- `api/process-ocr/index.ts`
- `src/modules/graphHealer.ts`
- `src/types/index.ts`
- `supabase/migrations/20260412000000_relational_sizing.sql` (New)
- `supabase/migrations/20260412000100_seed_sizing_references.sql` (New)

## [2.17.0] - 2026-04-09

### Server Queue Reconciliation & Processing Pipeline Hardening

**Problem:** When the browser was closed or refreshed while assets were being processed on the server, completion events delivered via Supabase Realtime were lost. The `onJobCompleted` callback only updated React state — never IndexedDB. On reload, completed assets reverted to PROCESSING, inflating the "stuck assets" count (e.g., 58 phantom stuck items). `syncLocalWithServerQueue` only checked `processing_queue`, missing results in `historical_documents_global` where completed data actually lives.

**Fixes — Persistence & Recovery:**
- **processingQueueService.ts**: New `reconcileWithServer()` method queries `historical_documents_global` and `processing_queue` for stuck local assets, recovering completed results, marking server failures, and resetting true orphans to PENDING
- **processingQueueService.ts**: New `persistJobStatusToIndexedDB()`, `persistJobCompletionToIndexedDB()`, `persistJobFailureToIndexedDB()` — all Realtime status changes (PROCESSING, COMPLETED, FAILED) now persisted to IndexedDB immediately, surviving page refresh
- **App.tsx**: Startup init now calls `reconcileWithServer()` after queue init, reloads local assets if any were recovered
- **App.tsx**: `restartStuckAssets()` tries server reconciliation first (Phase 1), re-checks for remaining stuck assets (Phase 2), then processes locally with concurrency limit (Phase 3)

**Fixes — Data Accuracy:**
- **processingQueueService.ts**: `requeueLocalAssets()` now saves actual `job.id` as `serverJobId` (was incorrectly saving `asset.id`), and writes PROCESSING status only AFTER server calls succeed (prevents orphaned PROCESSING on upload failure)
- **processingQueueService.ts**: `requeueLocalAssets()` deduplicates by asset ID to prevent double-queuing
- **processingQueueService.ts**: `getStats()` deduplicates all 4 statuses (PENDING, PROCESSING, COMPLETED, FAILED) by ASSET_ID and excludes CANCELLED jobs
- **processingQueueService.ts**: `syncLocalWithServerQueue()` uses dual lookup (jobById + jobByAssetId) and includes FAILED in status filter

**Fixes — Resource Cleanup & Stability:**
- **processingQueueService.ts**: `destroy()` uses `supabase.removeChannel()` for proper Realtime channel cleanup (was using `.unsubscribe()` which leaks channels)
- **processingQueueService.ts**: `enableContinuousProcessing()` adds periodic reconciliation every 3 minutes
- **BatchProcessingPanel.tsx**: Stable refs for callback props prevent useEffect re-fires that spammed "Configuration updated: maxConcurrent=3" logs every render
- **batchProcessorService.ts**: `configure()` skips if values unchanged

**UI Improvements:**
- **QueueMonitor.tsx**: New "Reconcile with Server" button appears when local items are tracked but server has no active jobs
- **QueueMonitor.tsx**: Queue label changed from "X on server queue" to "X tracked locally (server: Y pending, Z active)" for clarity
- **QueueMonitor.tsx**: Removed FAILED from "local pending" count (FAILED items are not pending)

**Files changed:** 5 files, +395 -45 lines

## [2.16.4] - 2026-04-08

### Fix Blank Screen on App Resume

**Problem:** When the user switches to another app or locks their phone, the OS kills camera media tracks. On return, the video element renders a dead black frame inside the `bg-black` AR/Camera overlay, which looks like a completely blank screen. There was no `visibilitychange` handler in either camera component to detect this.

Additionally, iOS Safari can restore standalone PWA pages from bfcache in a stale/blank state. No `pageshow` handler existed to detect this.

**Fixes:**
- **ARScene.tsx**: Added `visibilitychange` handler — stops the dead stream on hide, reinitialises camera on resume. Cleaned up duplicate camera error UI block.
- **CameraCapture.tsx**: Added matching `visibilitychange` handler — stops stream on hide, restarts with current `facingMode` on resume.
- **index.tsx**: Added `pageshow` handler — detects bfcache restoration (`event.persisted`) and forces a clean reload.

## [2.16.3] - 2026-04-08

### Fix Startup Freeze & Batch Panel Navigation

**Problem 1 — Startup freeze:** The v2.16.2 bundle worker was DOA. `deduplicationServiceV2` statically imports `DigitalAsset` from `../types/index.ts`, which imports `lucide-react`, which imports React — undefined in a Worker context. The worker crashed silently on module load, the `onerror` handler was missing, and the fallback ran the full O(n²) dedup on the main thread. Additionally, `bundleService.ts` was statically imported in `App.tsx`, pulling the entire 1000-line dedup module into the App chunk parse path (~10KB gzip), blocking the main thread for hundreds of ms even before any bundling ran.

**Fix:**
- Changed `deduplicationServiceV2.ts` to use `import type` for `DigitalAsset` (erased at compile time, breaks the lucide-react cascade)
- Changed `bundleService.ts` to dynamically import `deduplicationServiceV2` inside `createBundles()` (no longer in the App chunk parse path)
- Changed `bundleWorker.ts` to dynamically import dedup at message time with async `onmessage`
- Added `worker.format: 'es'` to Vite config (IIFE workers can't do dynamic imports)
- Added `onerror` handler on the Worker to null out the ref on crash (triggers fallback)
- Removed `createBundles` from static import — only `createBundleFromGroup` and `createUserBundle` imported statically (neither touches dedup at runtime)

**Result:** App chunk shrank from 186.93KB → 177.14KB (−10KB). Dedup module is now a separate 10.69KB async chunk, only loaded by the worker. Worker initializes correctly.

**Problem 2 — Batch panel close from AR took 20s:** v2.16.1 routed to `dashboard` on batch panel close, which triggers heavy asset card rendering + thumbnails + signed URL resolution.

**Fix:** Removed the dashboard navigation on batch panel close. When dismissed from AR, user stays on AR Scanner as expected. Instant close.

## [2.16.2] - 2026-04-08

### Fix 50-Second Sidebar Freeze — Bundle Dedup Moved to Web Worker

**Root Cause:** `createBundles()` → `findDuplicateClustersV2()` runs O(n²) pair comparisons (~75K for 387 assets) with Levenshtein, n-gram, shingle, and phonetic similarity calculations. This ran on the main thread via `requestIdleCallback` with a forced timeout at 5-8 seconds. When the user touched the sidebar at ~10s, the callback fired during the React re-render cycle, blocking the UI for up to 50 seconds on mobile.

**Fix:** Created `bundleWorker.ts` — a dedicated Web Worker that offloads the entire dedup + bundling computation. The main thread only does:
1. Fingerprint check (skip if asset set unchanged)
2. Strip assets to minimal fields needed for dedup (~300KB vs ~2MB)
3. Post to worker, receive ID-based assignments
4. Reconstruct `ImageBundle` objects from the assignments (fast — no O(n²))

**Files:**
- `src/workers/bundleWorker.ts` — New worker: imports deduplicationServiceV2, runs findDuplicateClustersV2 + traditional bundling, returns ID-based group assignments
- `src/App.tsx` — Replaced requestIdleCallback-based bundling with worker-based approach; added bundleWorkerRef lifecycle; fallback to main-thread if worker creation fails
- `src/services/bundleService.ts` — Exported `createBundleFromGroup` for main-thread bundle reconstruction

**Bundle impact:** +15KB worker chunk (self-contained, loaded async). Entry chunk unchanged (3.38KB gzip). App chunk +0.34KB gzip.

## [2.16.1] - 2026-04-09

### Workflow UX Fixes

**Camera Error UI (ARScene.tsx)**
- Camera permission denial now shows a full-screen error overlay with `CameraOff` icon, human-readable message, and "Try Again" button instead of a silent black screen
- Error messages are mapped per `DOMException` name: `NotAllowedError` → permission instructions, `NotFoundError` → no camera detected, `NotReadableError` → camera in use by another app

**Camera Stream Unmount Race Condition (ARScene.tsx)**
- Added `unmountedRef` guard so `getUserMedia` promises that resolve after component unmount immediately stop all tracks instead of leaking the camera stream
- Consolidated stream cleanup into a single effect return, eliminating the separate `[stream]` effect that could miss cleanup during rapid tab switches

**Accessible AR Session Leave Dialog (App.tsx)**
- Replaced `window.confirm()` with an in-app modal dialog (`role="dialog"`, `aria-modal`, `aria-labelledby`)
- Three clear actions: "Process & Continue", "Discard & Leave", "Stay in AR Scanner"
- Dismiss confirmation also supports the user's original navigation target

**Batch Panel Dismiss from AR (App.tsx)**
- Closing the batch processing panel while on the AR tab now navigates to the dashboard, so users see their processed results instead of returning to a live camera with no context

## [2.16.0] - 2026-04-08

### EXIF GPS Extraction & Coordinate Source Tracking

**Core Problem:** When photos were queued for processing after a delay (gallery picks, offline uploads, batch imports from desktop), the device GPS captured at ingest time reflected where the user *currently is*, not where the photo was *taken*. The EXIF GPS parser in `imageCompression.ts` was scaffolded but returned `null` unconditionally.

**Result:** Photos with embedded EXIF GPS data now have their true capture-time coordinates extracted automatically. A new `CoordinateSource` type tracks how coordinates were obtained (`exif`, `device-live`, `device-delayed`, `ai-inferred`, `none`), enabling downstream consumers (dedup, knowledge graph, marketplace) to make trust-aware decisions. When no GPS is available at all, Gemini now returns structured `inferredCoordinates` from visual cues.

#### EXIF GPS Parser (imageCompression.ts)
- Implemented full TIFF IFD0 → GPS IFD tag parser: reads byte order, walks IFD entries, extracts GPS rational values (tags 0x0001–0x0004)
- Handles both little-endian and big-endian EXIF headers
- Converts DMS (degrees/minutes/seconds) rationals to decimal degrees
- Rejects invalid coordinates (out of range, 0/0 Null Island)
- Zero new dependencies — pure DataView arithmetic (~120 lines)
- Exported `extractGpsFromExif()` for use in ingest pipelines

#### Coordinate Source Tracking (types, processingQueueService)
- New `CoordinateSource` type: `'exif' | 'device-live' | 'device-delayed' | 'ai-inferred' | 'none'`
- `QueueJob` and `QueueOptions` carry `coordinateSource` field
- `queueFile()` auto-resolves best coordinates: EXIF GPS → device GPS (with staleness check via `File.lastModified`) → none
- `insertJob()` persists `COORDINATE_SOURCE` column to processing_queue
- `File.lastModified` staleness threshold (30s) distinguishes live camera captures from gallery/delayed uploads

#### Ingest Pipeline Updates (App.tsx)
- Single-file ingest: tries EXIF GPS (dynamic import, JPEG only) before falling back to device `getCurrentPosition`
- Batch handler: uses `compressionResult.gpsCoordinates` from already-called `compressImage()`, avoiding redundant EXIF reads
- Both paths pass `coordinateSource` through to `queueFile()`

#### Gemini Visual Geo-Inference (geminiService.ts)
- New `inferredCoordinates` field in `ProcessResponse` and Gemini response schema: `{ lat, lng, confidence }`
- No-GPS prompt strengthened: instructs Gemini to estimate coordinates from landmarks, signage, architecture, vegetation, road markings, and language on signs
- `inferredCoordinates` preserved in response sanitization

#### Coordinate Priority Chain
```
EXIF GPS (photo metadata) → Device GPS live (<30s) → Device GPS delayed (>30s) → Gemini AI inference → none
```

#### Bundle Impact
- **+0.27KB gzip** to App.js (EXIF parser in deferred imageCompression module)
- Zero impact to Entry path (88.2KB unchanged)
- No new chunks, no new dependencies, no new workers

## [2.15.6] - 2026-04-07

### Web Worker Graph Construction: Eliminate 26s Sidebar Freeze

**Core Problem:** v2.15.5 moved dimension extraction to a worker, but the PRIMARY bottleneck was `globalGraphData` useMemo in App.tsx. This synchronous computation built the knowledge graph (~30,000-42,000 string operations + Map lookups) every time `assets` changed (2-3× during init). On mobile, each invocation blocked the main thread for 5-10s. Clicking the sidebar queued behind this blocking render, then triggered cascading re-renders that compounded the delay.

**Result:** Graph construction now runs in a dedicated Web Worker. The main thread does ZERO graph computation. Combined with the dimension worker from v2.15.5, all heavy computation is off-thread.

#### Changes
- `src/workers/graphDataWorker.ts` — 1.9KB worker that builds globalGraphData off-thread
- App.tsx: `globalGraphData` changed from `useMemo` to `useState` + worker `useEffect`
- Only 7 sqlRecord fields sent to worker (vs full record) — reduces structured clone cost ~10×
- Generation counter prevents stale graph results when assets change rapidly
- Memoized 4 inline filter calls: `pendingLocalCount`, `pendingGlobalCount`, `stuckAssetsCount`, `failedAssetCount`
- Two workers now active: dimensionWorker (13KB) + graphDataWorker (1.9KB)

## [2.15.5] - 2026-04-07

### Web Worker Dimension Extraction: Zero Main-Thread Blocking

**Core Problem:** v2.15.4 batched setState into one call, but each individual dimension extraction (regex-heavy `deriveMediaType`, `deriveNarrativeRole`, etc.) still ran on the main thread — each taking 1-2s on mobile. With 18 Tier 1 + 3 Tier 2 dimensions computed sequentially via `setTimeout(0)`, the main thread was blocked ~1.5s per dimension with only ~4ms gaps. Click events (sidebar open) were technically processed between tasks, but the browser couldn't paint the result for 26s. Clicking the sidebar mid-computation could double total time to 58s.

**Result:** All Tier 1+2 extraction runs in a dedicated Web Worker on a separate thread. Main thread does ZERO extraction work after Tier 0. Clicks, scrolls, paints, and sidebar opens are instant.

#### Changes
- `src/lib/dimensionExtraction.ts` — All pure extraction functions + constants extracted to a shared module
- `src/workers/dimensionWorker.ts` — Web Worker that imports extraction module, computes 21 dimensions
- FilterProvider: Worker created on mount, posts minimal (`{id, sqlRecord, graphData}`) asset data
- Worker sends single `postMessage` with all dimension values → one `setState` on main thread
- Generation counter prevents stale results when assets change before worker finishes
- Removed: `tier1HandleRef`, `tier2HandleRef`, `sliceAbortRef`, `cancelDeferred`, time-sliced loop
- Added: `workerRef`, `generationRef`, worker lifecycle `useEffect`

## [2.15.4] - 2026-04-07

### Eliminate Re-render Storm: Single setState for Tier 1 Dimensions

**Core Problem:** v2.15.3 time-sliced Tier 1 dimensions via `setTimeout(0)` which kept the UI scrollable, but each of the 18 dimensions called `setState()` individually — triggering 18 separate React re-renders of the entire FilterProvider subtree. When the user clicked to open the sidebar at ~20s, React was overwhelmed by the re-render queue, causing a 10s freeze before the sidebar appeared.

**Result:** Tier 1 dimensions are still time-sliced for responsiveness, but results accumulate in a plain Map (outside React state) and commit in a single `setState()` call after all 18 dimensions finish. This reduces re-renders from 18 to 1 for Tier 1, eliminating the interaction freeze.

#### Changes
- Accumulate Tier 1 dimension results in a closure-local `Map` instead of calling `setState` per dimension
- Single `setState` merges all 18 accumulated dimensions at once after the last slice completes
- Abort guard (`sliceAbortRef`) checked before final commit to prevent stale writes
- Total setState calls for full dimension pipeline: 3 (Tier 0 + Tier 1 batch + Tier 2) — was 21

## [2.15.3] - 2026-04-07

### Time-Sliced Dimension Computation & Lazy IntegrationsHub

**Core Problem:** v2.15.2 deferred Tier 1 dimensions via `requestIdleCallback`, but the callback still computed all 18 dimensions synchronously in one long task (~13-15s main-thread block). Additionally, `<IntegrationsHub>` was unconditionally rendered in the JSX tree even when closed, triggering an eager chunk download and showing a "Loading integrations..." spinner on the dashboard.

**Result:** Dashboard is fully interactive within ~1s of first paint. Each deferred dimension computes in its own macrotask (`setTimeout(0)`), yielding to the browser between dimensions so events, paints, and other callbacks are processed. IntegrationsHub chunk only loads when the user opens the panel.

#### Time-Sliced Tier 1
- Each of 18 Tier 1 dimensions now computes in a separate `setTimeout(0)` macrotask
- Browser can process touch/click events, repaint, and run other callbacks between each dimension
- Added `sliceAbortRef` to cancel in-progress time-sliced chains on asset changes
- Tier 2 chains after last Tier 1 slice completes (unchanged)

#### Conditional IntegrationsHub Rendering
- Wrapped `<IntegrationsHub>` in `{showIntegrationsHub && ...}` guard
- Eliminates eager lazy-chunk download and "Loading integrations..." spinner on dashboard
- Chunk now downloads on-demand only when user clicks "Integrations"

## [2.15.2] - 2026-04-07

### Dashboard Interactivity: 3-Tier Deferred Dimension Computation

**Core Problem:** After v2.15.1 split dimensions into 2 tiers, the dashboard still appeared unusable for ~29 seconds because Tier 1 synchronously computed 21 dimensions including regex-heavy `deriveMediaType` (14 regex tests × 387 assets), `derivePlaceType` (7×387), `deriveGeographicScale` (3×387), and `deriveNarrativeRole` (5×387) — totalling ~10,449 regex operations blocking the main thread.

**Result:** Dashboard becomes interactive in <1 second. Only 3 instant field lookups (category, era, license) run synchronously. All other dimensions defer via `requestIdleCallback`.

#### 3-Tier Split
- **Tier 0 (sync)**: `category`, `era`, `license` — direct field reads, zero regex, InlineFilterBar renders instantly
- **Tier 1 (deferred)**: 18 remaining dimensions including regex-heavy `mediaType`, `placeType`, `geographicScale`, `narrativeRole` — deferred via `requestIdleCallback` with 2s timeout
- **Tier 2 (chained after Tier 1)**: `subjectMatter`, `connectionDensity`, `serendipityScore` — O(n²) cross-asset comparisons, 5s timeout

#### Cleanup Consolidation
- Replaced separate `tier2HandleRef` with dual `tier1HandleRef` + `tier2HandleRef` tracked by unified `cancelDeferred()` helper
- Tier 2 now chains after Tier 1 completion (instead of running in parallel) to avoid main-thread contention

## [2.15.1] - 2026-04-07

### Filter Engine Startup Performance: Tiered Dimension Computation

**Core Problem:** The InlineFilterBar (selection bar) took ~20 seconds to appear on fresh app load because `FilterProvider` computed all 27 filter dimensions synchronously in a single `useEffect`, including O(n²) cross-asset comparisons for serendipity scoring and connection density.

**Result:** The selection bar renders in <2 seconds. Cheap dimensions (category, era, license, etc.) are computed synchronously on mount; expensive dimensions (subjectMatter, connectionDensity, serendipityScore) are deferred via `requestIdleCallback`.

#### Phase 1 — Tiered Computation & Algorithm Fixes
- Split 27 dimensions into Tier 1 (21 cheap O(n) lookups, sync) and Tier 2 (3 expensive, deferred via `requestIdleCallback` with 3s timeout)
- Reduced `calculateSerendipityScore` from O(n²×m²) to O(n×m) with precomputed entity-frequency and category-by-id maps
- Added `extractExpensiveDimensionsBatch` to precompute shared lookup tables once for all Tier 2 dimensions
- Added shallow equality guard (`prevAssetKeyRef`/`prevGraphKeyRef`) to skip recomputation when assets haven't changed
- Cached `getConstrainedValues` to return `meta.availableValues` directly when no filters are active

#### Phase 2 — Static Hoisting & Deduplication
- Hoisted `dimensionLabels` to module-level `DIMENSION_LABELS` constant (was recreated every render)
- Converted `buildMeta` from `useCallback` to module-level `buildDimensionMeta` function
- Precomputed `DIMENSION_DEPS_ON` and `DIMENSION_AFFECTS` maps from `FILTER_DEPENDENCIES` (avoids repeated `.filter()` per dimension)
- Extracted `cancelTier2()` helper to deduplicate idle-callback cleanup logic (was repeated 3×)
- Removed `buildMeta` from `useEffect` dependency array

## [2.15.0] - 2026-04-07

### Deep Startup Performance: Defer Supabase from Critical Path

**Core Problem:** After v2.14.0 reduced entry-blocking JS from ~880KB to ~76KB gzip, the Suspense waterfall (spinner → full UI) still loaded ~130KB gzip including vendor-supabase (44KB gzip) and vendor-storage (32KB gzip) because App.tsx statically imported supabaseService, processingQueueService, downloadService, and auth — all of which pull in the Supabase SDK.

**Result:** vendor-supabase (44KB gzip) and its transitive dependency chain are now fully deferred from the static startup path. The Suspense waterfall dropped from ~130KB to ~100KB gzip.

#### Deferred Supabase Imports (App.tsx)
- Converted `processingQueueService` and `downloadService` from static imports to module-level deferred dynamic imports (`_pqsP`, `_dlsP` promises started at module eval)
- Converted all `supabaseService` function calls (contributeAssetToGlobalCorpus, fetchUserAssets, fetchGlobalCorpus, fetchAssetLineage, subscribeToAssetUpdates) to inline `await import('./services/supabaseService').then(...)` at ~12 call sites
- Converted `getCurrentUser` to inline dynamic import at 2 call sites
- All early effects wrapped to await deferred service promises before use

#### Deferred Avatar Service (useAvatar.ts)
- Replaced static `import { avatarService }` with `getAvatarService()` dynamic loader
- All effects and callbacks updated to `await getAvatarService()` or `.then()`
- Updated `useWorldSectors` hook similarly

#### Resource Hints (index.html)
- Added `<link rel="preconnect">` and `<link rel="dns-prefetch">` for `generativelanguage.googleapis.com`

#### Lazy Onboarding + Eager App Prefetch (index.tsx)
- Onboarding component conditionally lazy-loaded based on `localStorage` flag
- App and ModuleContext imports started eagerly at module evaluation time

#### Service Worker v3.6.0 (sw.js)
- Added Navigation Preload (enable in activate, use `event.preloadResponse` in fetch handler)

#### Build Optimization (vite.config.js)
- Added `chunk-app-shared` manual chunk for FilterContext and logger — extracts them from chunk-cluster-sync to break App → chunk-cluster-sync → vendor-supabase static chain
- chunk-cluster-sync reduced from 118KB to 94KB

#### Critical Path Budget
| Phase | Chunk | Gzip |
|-------|-------|------|
| Entry | index.js | 3.4KB |
| Entry | vendor-preload.js | 0.7KB |
| Entry | vendor-react.js | 60.2KB |
| Entry | vendor-icons.js | 10.5KB |
| Entry | index.css | 13.4KB |
| **Entry Total** | | **88.2KB** |
| Suspense | App.js | 49.9KB |
| Suspense | chunk-app-shared.js | 7.9KB |
| Suspense | chunk-batch-processing.js | 8.4KB |
| Suspense | vendor-storage.js (Dexie) | 31.9KB |
| Suspense | pwaUtils.js | 2.2KB |
| **Suspense Total** | | **100.3KB** |
| **DEFERRED** | vendor-supabase.js | **44.0KB** |
| **DEFERRED** | chunk-cluster-sync.js | **25.9KB** |

## [2.14.0] - 2026-04-07

### Startup Performance Optimization

**Core Problem:** Application took 20–33 seconds to load on mobile devices (Google Pixel 10) due to synchronous import chains pulling ~880 KB of blocking JavaScript into the critical path, including vendor-ai (253 KB) and chunk-cluster-sync (138 KB) that were not needed at startup.

#### React.lazy + Suspense Entry Point (index.tsx)
- Replaced blocking `Promise.all([import('./App'), import('./ModuleContext')]).then(render)` with `React.lazy()` + `<Suspense>` so React mounts immediately with a branded skeleton fallback
- Added `AppShellFallback` component with header, spinner, and bottom nav matching the HTML app shell
- Dynamic imports for `pwaUtils`, `performanceMonitor`, and `bootstrap` — no longer in the critical path

#### Deferred Heavy Dependencies (App.tsx, gemini.ts)
- `ClusterSyncButton` lazy-loaded via `React.lazy()` with pulse placeholder fallback
- `processImageWithGemini` lazy-imported at both call sites (camera capture + AR capture) — vendor-ai (253 KB / 50 KB gzip) completely removed from startup chain
- `geminiService` import in `modules/llm/gemini.ts` converted to dynamic `await import()` inside `extractMetadata()` to break the module → @google/genai cascade

#### Vite Build Optimization (vite.config.js, vite.config.ts)
- Disabled `modulePreload` to prevent eager download of all chunks via `<link rel="modulepreload">`
- Added `vendor-preload` manual chunk (1.13 KB) to isolate Vite's `__vitePreload` helper from large chunks
- Added `chunk-gemini` manual chunk to isolate `geminiService` for on-demand loading

#### Service Worker v3.5.0 (sw.js)
- Added cache-first caching for content-hashed JS/CSS bundles under `/assets/`
- Pattern-matched filenames with content hashes for safe indefinite caching
- HTML excluded from caching to ensure bundle references stay current

#### HTML App Shell (index.html)
- Added branded skeleton UI inside `<div id="root">` — header with Database icon, loading spinner, and bottom navigation tabs — visible instantly while JS loads

#### Deferred Polyfills (polyfills.ts, web3Service.ts)
- Moved Buffer/process polyfills behind lazy `ensureWeb3Polyfills()` function
- Polyfills only loaded when Web3 features are accessed

#### Results
- Entry blocking JS reduced from ~880 KB to ~76 KB gzip
- vendor-ai (253 KB) loads only on camera/OCR action
- vendor-web3 (395 KB) loads only on wallet connect
- Branded skeleton visible within ~1 second on mobile

## [2.13.0] - 2026-04-06

### Batch Retry Resilience & File Persistence

**Core Problem:** "File not found" errors when retrying failed batch items — files stored only in memory were lost on page refresh, tab switch, or network interruption, causing 50-75% failure rates on mobile.

#### IndexedDB File Persistence (indexeddb.ts)
- Added `batchFiles` table (v3 schema migration) to persist file blobs across page refreshes
- Added `arQueue` table for AR session capture persistence
- New helpers: `saveBatchFile`, `loadBatchFile`, `deleteBatchFile`, `deleteBatchFiles`, `clearAllBatchFiles`
- New helpers: `saveArQueueItem`, `loadArQueue`, `clearArQueue`, `getArQueueCount`

#### Batch Processor File Recovery (batchProcessorService.ts)
- `addFiles()` now persists file blobs to IndexedDB alongside the in-memory Map
- `processItem()` attempts 3-tier file recovery on cache miss before failing
- `retryFailed()` uses server-side retry for items with `serverJobId` (no re-upload needed)
- New `recoverFiles()` method: batchFiles IndexedDB → assets table imageBlob → Supabase Storage download
- New `retryViaServer()` method: server-side retry path for cross-location support
- `loadPersistedState()` now restores QUEUED items (previously dropped) since files persist in IndexedDB
- `clearCompleted()`/`clearAll()` clean up IndexedDB entries to prevent storage bloat
- New `setServerJobId()` public method for tracking server job IDs on batch items
- Added `serverJobId` to `BatchItemState`, `serverRetry`/`downloadFromStorage` to callbacks

#### Server-Side Recovery (processingQueueService.ts)
- New `downloadFromStorage()` public method: downloads files from Supabase Storage by asset ID for cross-location retry
- Fixed `requeueLocalAssets()` to prefer `imageBlob` from IndexedDB over fetching dead `blob:` URLs

#### AR Session Queue Persistence (App.tsx)
- AR captures now persist to IndexedDB via `saveArQueueItem()` — survive page crashes
- Restored from IndexedDB on app mount via `loadArQueue()`
- Cleared on consumption via `clearArQueue()`

#### Wiring & Integration
- `handleNewBatchProcess` tracks `serverJobId` back to batch items via `setServerJobId()`
- `BatchProcessingPanel` wired with `serverRetry` and `downloadFromStorage` callbacks
- Zero bundle size increase — new code uses existing Dexie dependency

## [2.12.13] - 2026-03-19

### Fix: `ImportMeta.env` TypeScript Errors

- **`src/vite-env.d.ts`**: Declared full `ImportMetaEnv` interface with all app-specific environment variables (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_LOADOPOLY_SUPABASE_URL`, `VITE_LOADOPOLY_SUPABASE_ANON_KEY`, `VITE_GEMINI_API_KEY`, `VITE_OPENAI_API_KEY`, `API_KEY`, `VITE_DCC1_ADDRESS`) and a `VITE_FF_*` template-literal index for feature flags. Added explicit `ImportMeta.env` declaration.
- Removed all `// @ts-ignore` suppressions that worked around the missing types in `src/lib/logger.ts`, `src/modules/llm/gemini.ts`, `src/modules/llm/openai.ts`, and `src/services/geminiService.ts`.
- **`src/lib/supabaseClient.ts`**: Replaced unsafe dynamic `import.meta.env[key]` indexing with a typed `as Record<string, string | undefined>` cast — no suppressions required.
- **`src/modules/featureFlags.ts`**: Same cast pattern applied to the dynamic feature-flag env lookup (`VITE_FF_*`).

## [2.12.12] - 2026-03-04

### Realtime Update Overwrite Fix (Image Blob Preservation)
- Fixed a central regression where realtime Supabase asset updates replaced local assets wholesale, dropping local `imageBlob` data and re-breaking thumbnails shortly after processing completed.
- `App.tsx` now merges incoming realtime assets with existing local assets and preserves local `imageBlob` + current `imageUrl` when available.
- Applies to both realtime `UPDATE` and `INSERT` handlers for `historical_documents_global` subscriptions.

## [2.12.11] - 2026-03-04

### Full-Library Thumbnail Recovery + Per-Card Signed Retry
- Fixed signed preview prefetch in `App.tsx` to process all blob-missing assets in batches (80 at a time) instead of stopping after the first batch, which left most large libraries unrecovered.
- Added robust bundle thumbnail retry logic in `BundleCard.tsx`: each slot now cycles candidates and then requests a fresh signed URL by `assetId` when initial sources fail.
- Bundle cards now fail gracefully to icon placeholders only after local/saved/signed candidates are exhausted.

## [2.12.10] - 2026-03-04

### Marketplace Visibility + Legacy Thumbnail Recovery
- Marketplace now includes single processed assets as generated one-item bundles, so a newly captured photo appears immediately with a thumbnail card even before clustering groups it.
- Signed preview prefetch in `App.tsx` now proactively targets assets that lack `imageBlob` (common for historical cloud-synced rows), even if they still have an `http` URL string.
- This addresses the long-tail case where `ORIGINAL_IMAGE_URL` exists but is stale/private and old bundle cards stayed broken.
- Purchase modal asset resolution now prefers `bundle.assetIds` via `assetsById`, with URL-based fallback retained for compatibility.

## [2.12.7] - 2026-03-04

### Critical: Storage Bucket Mismatch Fix
- **Root cause fix**: `downloadService` was searching for signed URLs in `processing-uploads` bucket, but images are stored in `corpus-images` bucket. All signed URL fallback attempts were silently failing.
- `getDirectSignedUrl` now searches both `corpus-images` and `processing-uploads` buckets with enhanced path resolution (root-level contributed assets + user folder structures).
- Fixed asset grid cards (line 3602) using `item.imageUrl` directly instead of `getThumbnailSrc` — the most visible thumbnail view was completely bypassing the fallback pipeline.
- Added `assetsById` prop to second `BundleCard` render that was missing signed URL data.
- Fixed proactive signed URL resolution race condition — removed `signedPreviewUrls` from effect dependencies, using ref-based tracking instead to prevent self-cancelling async fetches.
- `isUsableImageUrl` no longer treats `blob:` URLs as valid (they don't survive page reloads), preventing the proactive resolver from skipping assets with dead blob references.
- `getThumbnailSrc` now prioritises fresh blob URLs from stored imageBlobs, falls back through signed → persisted → original URLs, and always returns a placeholder SVG instead of empty string.
- `BundleCard` candidates now filter out stale `blob:` URLs and prioritise signed URL-enriched `assetsById` data.

## [2.12.6] - 2026-03-04

### Mobile Thumbnail Recovery (Signed URL Fallback)
- Added on-demand signed preview URL resolution for assets in `App.tsx` using `downloadService`.
- Thumbnail pipeline now recovers from invalid/expired `imageUrl` and missing `ORIGINAL_IMAGE_URL` by requesting fresh signed URLs from storage.
- Added signed preview URL caching and per-asset retry on image load failure to stabilize Marketplace/Curator/Structured list previews.
- Exposed `downloadService.getPreviewUrl()` and `getPreviewUrls()` for UI-safe thumbnail retrieval.

## [2.12.5] - 2026-03-04

### Multi-View Thumbnail Reliability
- Hardened bundle thumbnail URL generation in `bundleService` to prefer persisted image sources.
- Updated `BundleCard` to resolve thumbnail sources per asset (`imageUrl` + `ORIGINAL_IMAGE_URL` + bundle fallback) and retry alternate sources on load failure.
- Wired `BundleCard` to receive live asset lookup data from `App` for accurate fallback resolution in mobile/local-master views.
- This directly targets broken image placeholders across Marketplace/Exploratory and Curator-adjacent bundle views.

## [2.12.4] - 2026-03-04

### Structured DB Thumbnail Rendering
- Added centralized thumbnail source resolution in `App.tsx` for Structured DB and related queues.
- Thumbnails now resolve via fallback chain: `imageUrl` → `sqlRecord.ORIGINAL_IMAGE_URL` → in-memory `imageBlob` URL.
- Added resilient thumbnail `onError` handling to retry alternate sources before falling back to placeholder SVG.
- Added cleanup for generated blob thumbnail object URLs to avoid URL leak buildup.

## [2.12.3] - 2026-03-04

### Production Crash Guard Follow-up
- Added additional `undefined.slice` guards across high-risk production UI surfaces:
  - `Messages` conversation and gift ID rendering
  - `Communities` admission request user ID rendering
  - `CuratorMergePanel` match reason/entity/keyword array handling
  - `IntegrationStatus` state label rendering when integration payloads are partial
- This follows mobile reports where stale/partial records still triggered runtime `slice` errors after app reset.

## [2.12.2] - 2026-03-04

### Structured DB Stability
- Added targeted string truncation guards in `App.tsx` and `QueueMonitor.tsx` to prevent runtime crashes when IDs or file names are missing (`Cannot read properties of undefined (reading 'slice')`).
- Hardened Structured DB table and queue-adjacent render paths so malformed/partial records degrade safely instead of breaking the view.

### Knowledge World Thumbnails
- Added resilient thumbnail URL resolution in `WorldRenderer.tsx` and `StoryNarrator.tsx`.
- Thumbnails now fall back to `sqlRecord.ORIGINAL_IMAGE_URL` when primary image URLs fail, and gracefully hide broken images if both sources fail.

### Cluster Synchronizer Throughput UX
- Added sync execution mode selector (`Background` / `Foreground`) to `ClusterSynchronizer.tsx`.
- Refactored pause/resume logic to use live sync status refs (eliminates stale-state waits in long-running sync sessions).
- Added cooperative yielding in background mode to keep UI responsive during multi-asset sync.

## [2.12.1] - 2026-03-03

### Analysis Functions — Type Safety & Crash Guards
- **`asText()` helper**: Introduced a lightweight `asText(value, fallback)` guard in `App.tsx` that coerces any non-string value to a safe fallback string, preventing runtime crashes when JSONB fields arrive as numbers, booleans, or null instead of strings.
- **Graph data aggregation hardening**: All `buildGlobalGraphData` paths (category clustering, era bucketing, contested-content detection, node label extraction) now route through `asText()`, eliminating `TypeError: Cannot read properties of null` and `String.prototype.replace` crashes on malformed knowledge graph records.
- **`STRUCTURED_KNOWLEDGE_GRAPH` node merge safety**: Array guards added (`Array.isArray(skg?.nodes)`, `Array.isArray(asset.graphData?.nodes)`) before iterating server-side and client-side graph node lists, preventing silent failures on empty or non-array payloads.
- **Document title / entity label fallbacks**: `docNodes` and `entityNodesMap` entries now always receive a defined string label even when `DOCUMENT_TITLE`, `NLP_NODE_CATEGORIZATION`, or node `label` fields are missing.

### localStorage Resilience
- **`geograph-owned-assets` parse guard**: Wrapped `JSON.parse` in a try/catch; malformed stored data now resets asset ownership to an empty set rather than crashing the app on startup.
- **Array validation**: Parsed owned-asset IDs are validated with `Array.isArray()` before constructing the `Set`, preventing a `Set(non-iterable)` TypeError.

### Service Worker Fix
- **`handleApiRequest` syntax fix**: Corrected a stray `});` → `}` closing the `handleApiRequest` function body, resolving a parse error that could prevent SW registration in strict environments.

### Testing Infrastructure
- **Playwright added**: `playwright` and `@playwright/test` added as dev dependencies (`^1.58.2`) enabling headless browser automation.
- **Headless test suite**: Added `headless-test.cjs`, `headless-test-v2.cjs`, `headless-test-v3.cjs`, `test-navigation.cjs`, `test-db-interactive.cjs`, `test-mobile-db.cjs`, and `test-structured-db.cjs` for end-to-end browser, navigation, and database interaction testing.

## [2.12.0] - 2026-03-02

### Adventure Mode & AR Walk (WorldRenderer)
- **Adventure Mode**: New `Compass` toolbar button in the 3D World view activates live GPS tracking via `watchPosition`. Nearby captures (within 1 km, haversine distance) surface as a proximity overlay panel with thumbnail, title, and distance badge.
- **`onStartAdventure` prop**: `WorldRenderer` now accepts an optional callback so parent components can respond to adventure mode activation.
- **Empty-state overlay**: 3D World now shows a clear call-to-action when no graph data exists instead of a blank canvas.

### Structured Data Population (Edge Functions)
- **`TOKEN_COUNT`**: Populated in both `api/process-ocr/index.ts` and `supabase/functions/process-ocr/index.ts` using a ~0.75 words-per-token approximation.
- **`STRUCTURED_CONTENT`**: Populated with `detected`, `wordCount`, and `paragraphCount` when OCR text is present.
- **`STRUCTURED_TEMPORAL`**: Populated with detected temporal entities when DATE/TIME nodes are found.
- **`STRUCTURED_SPATIAL`**: Populated with zone type, GIS coordinates, and device-captured lat/lng when spatial context is available.
- **`STRUCTURED_PROVENANCE`**: Always populated with capture metadata (timestamp, scan type, source asset ID, processing version).
- **`STRUCTURED_DISCOVERY`**: Populated with entity/keyword/node/link counts when entities or keywords were extracted.

### Knowledge Graph — Server-Path Enrichment
- **`STRUCTURED_KNOWLEDGE_GRAPH` node merging**: `buildGlobalGraphData` in `App.tsx` now merges nodes and links from the edge function's `STRUCTURED_KNOWLEDGE_GRAPH` JSONB field alongside the existing client-side `graphData`, providing richer multi-hop entity relationships.

### GPS Capture at Ingest
- **Geolocation at queue time**: When a file is queued via `ingestFile()`, the current GPS position is captured (3 s timeout) and passed to `processingQueueService.queueFile()` as `location`, enabling the edge function to associate images with physical capture coordinates.

### PWA & Service Worker Reliability
- **No more lock-screen reload loop**: Removed `self.skipWaiting()` from SW `install` handler. SW now waits for old clients to close before activating, preventing the `clients.claim()` → `controllerchange` → `location.reload()` cycle that restarted the app on phone lock-screen unlock.
- **SW update banner**: `App.tsx` listens for the `geograph-sw-updated` custom event (dispatched by both `index.tsx` and `pwaUtils.ts`) and renders a non-blocking top banner with an "Update Now" button that calls `SKIP_WAITING` and reloads.
- **Offline status banner**: A persistent amber banner appears when `navigator.onLine` is false, showing how many queued captures will upload when connectivity returns.
- **Background Sync integration**: When the app comes back online with pending assets, it registers a `sync-contributions` background sync tag. The SW `sync` event dispatches `geograph-sync-requested` to the page which triggers `handleProcessAllPending`.

### UX & Navigation Fixes
- **3D World as Explore default**: `useEffect` in `App.tsx` resets `exploreSubTab` to `'3d'` every time the Explore tab is activated, preventing stale sub-tab state from previous visits.
- **Batch tab auto-navigation removed**: `handleBatchFiles` no longer calls `setActiveTab('batch')` — the caller decides navigation, preventing AR sessions from hijacking the user to the batch tab.
- **Queue monitor visible by default**: `showDashboardQueue` now reads from `localStorage` with a default of `true` (key `geograph-queue-visible`).

### Bug Fixes
- **Null-safe `ENTITIES_EXTRACTED`**: Drilldown table now uses `(rec?.ENTITIES_EXTRACTED ?? []).slice(0,3)` to avoid crash when field is null.
- **Blob URL cleanup**: `loadAssets` in `indexeddb.ts` now detects dead `blob:` URLs (no backing `imageBlob`) and clears them to prevent broken image icons after reload.
- **Public URL persistence**: After cloud sync, `saveAsset()` is called with the updated HTTPS URL so future reloads serve the permanent cloud link, not a dead blob.
- **`ErrorBoundary` on database tab**: The entire database view is now wrapped in an `ErrorBoundary` with a "Reset View" recovery button.

### Dependencies
- Promoted `@react-three/drei`, `@react-three/fiber`, and `three` from `optionalDependencies` to `dependencies` to ensure they are always bundled.

## [2.11.4] - 2026-02-25

### UX Reliability & Diagnostics
- **QA Debug Drill-Down**: Added failed-job visibility to the in-app QA panel, including queue failure stage/error details and quick navigation to the relevant asset context.
- **Structured DB Graph Affordance**: Made the `NODES` column interactive so users can jump directly to `Explore → Knowledge Graph` for node/edge inspection of a selected asset.
- **Explore Default Alignment**: Set `3D World` as the default Explore sub-tab and updated keyboard shortcut behavior for consistency.

### Download Resilience
- **Non-Blocking Failure UX**: Replaced blocking image download `alert()` fallbacks with toast-driven feedback and automatic JSON fallback export.
- **Signed URL Fallback Path**: Added direct Supabase Storage signed-URL fallback when edge-function URL generation fails, improving download success in environments where the edge endpoint is unavailable.
- **Abort/Cancel Integrity**: Preserved explicit cancellation states and queue updates through the revised download flow.

### Marketplace Card Robustness
- **Broken Image Handling**: Added Bundle card image fallback rendering to avoid broken thumbnail placeholders when bundle-part URLs are invalid or unavailable.

## [2.11.3] - 2026-02-24

### Edge Function Optimization & Type Safety
- **Deno-Native Edge Serving**: Migrated `process-ocr`, `download-asset`, `kg-backfill`, and `spatial-coordinates` Supabase edge functions from the deprecated `std/http/server.ts` `serve()` API to the native `Deno.serve()` entrypoint, ensuring compatibility with current Deno Deploy runtimes and eliminating cold-start overhead from the legacy HTTP module.
- **Parallelized Edge Initialization**: Supabase client construction and environment validation are now performed before the request handler fires, reducing per-request latency to near-zero for warm invocations.
- **Type-Safe Error Handling**: Changed `catch (error)` blocks to `catch (error: unknown)` with explicit `instanceof Error` guards in `download-asset` and `process-ocr`, eliminating implicit `any` TypeScript access on caught values.
- **Import Map Cleanup**: Removed unused `std/http/server.ts` entry from `supabase/functions/import_map.json`.
- **ESLint Comment Pruning**: Removed redundant `// eslint-disable-next-line` suppression comments in `src/lib/lazyComponents.tsx`, `src/lib/logger.ts`, and `src/services/avatarService.ts` now that the underlying patterns are correctly typed.

## [2.11.2] - 2026-02-22

### Security & Data Governance — Deletion Lockdown
- **Settings-Only Local Delete**: Updated `SettingsPanel` confirmation text to explicitly state that local clear operations affect only device storage and never delete server data.
- **Queue Deletion Controls Removed**: Removed `Delete All` and `Reset Server` actions from `QueueMonitor`, leaving only local reset/retry actions available in the client.
- **RLS Delete Hardening**: Added `supabase/migrations/20260222000000_lockdown_delete_policies.sql` to enforce service-role-only DELETE policies for queue and related data domains.
- **Spatial Anchors Policy Tightening**: Removed authenticated user DELETE policy from `spatial_anchors`; deletion now requires service-role authorization.

### Operational Note
- **Explicit-Request Deletions**: User data deletions are now constrained to explicit deletion requests and backend-authorized execution paths.

## [2.11.1] - 2026-02-22

### Performance — Cold-Start Elimination (H1-H3)
- **Parallel Boot Sequence**: Refactored `index.tsx` to trigger the `App` JS bundle download in parallel with the `bootstrapModuleSystem` initialization. This eliminates 2-3 seconds of sequential blocking on the main thread.
- **Lazy Web3 Dependencies**: Removed static `ethers.js` imports from the main bundle. The 400KB+ library is now dynamically fetched via `getEthers()` only when a Web3 transaction is initiated, drastically reducing initial parse time.
- **Component Code-Splitting**: Wrapped major UI components including `SettingsPanel`, `PurchaseModal`, `BundleCard`, and `ContributeButton` in `React.lazy` with `<Suspense>` boundaries.
- **Non-Blocking Connectivity**: Decoupled `isConnected()` network checks from the module system boot chain, allowing the app to reach "Phase-0" (IndexedDB-driven UI) even with high network latency.
- **Deferred Worker Initialization**: Updated `WorkerPool` to support `minWorkers: 0`, deferring worker thread creation until actual OCR tasks are queued.
- **O(n²) Render Optimization**: Implemented Map-based fingerprint caching for pair-wise asset deduplication, reducing sidebar render computation from 74,000+ comparisons to $O(1)$ lookups per item.

### Mobile UI & Sidebar
- **Sidebar Rendering Fix**: Solved the "invisible sidebar" bug on mobile by using `ReactDOM.createPortal` to move the sidebar outside of the `backdrop-blur` containing block.
- **Touch Interaction**: Added `active:scale-95` and touch-specific haptic feedback hints to sidebar navigation items for better tactile response.

## [2.11.0] - 2026-02-22

### Performance — Lazy Loading & GPU Optimization
- **Major Dependency Splitting**: Converted `SocialApp`, `IntegrationsHub`, `QueueMonitor`, `ClusterSyncStatsPanel`, and `BatchProcessingPanel` to lazy imports, removing `@google/genai` from the initial bundle.
- **Tab Consolidation**: Unified "Knowledge Graph" and "3D World" into an "Explore" tab to prevent premature WebGL context creation and save GPU VRAM.
- **Dashboard Shaving**: Gated the `QueueMonitor` behind an explicit expander to avoid eager network polls on startup.

### Database & Spatial Intelligence
- **Persistent Entity Graph**: Deployed `graph_nodes`, `graph_edges`, and `asset_graph_nodes` to track real-world entity relationships across the dataset.
- **Spatial Triangulation**: Launched the `spatial-coordinates` Edge Function to calculate target coordinates from device orientation and GPS telemetry.
- **KG Backfill Service**: Implemented an automated agentic backfill that extracts semantic relationships from existing OCR text using Gemini Flash.

## [2.10.2] - 2026-02-11

### Bug Fixes — Database Functions
- **Edge Function "relation processing_queue does not exist"**: All 5 queue functions (`claim_processing_job`, `complete_processing_job`, `fail_processing_job`, `update_job_progress`, `release_stale_locks`) used bare `processing_queue` table references with `SET search_path = ''`, making PostgreSQL unable to resolve the table. Recreated with fully-qualified `public.processing_queue` and double-quoted uppercase column names (`"STATUS"`, `"WORKER_ID"`, etc.) to match the actual table schema.
- **Trigger "record new has no field bundle_id"**: `update_bundle_asset_count` trigger on `historical_documents_global` used unquoted `NEW.BUNDLE_ID` (folded to lowercase by PostgreSQL) but actual column is `"BUNDLE_ID"` (uppercase). Fixed with `NEW."BUNDLE_ID"`.
- **Auto-trigger never firing**: `invoke_processing_worker` trigger on `processing_queue` INSERT silently failed (caught by `EXCEPTION WHEN OTHERS`) because it accessed `NEW.status` instead of `NEW."STATUS"`. Fixed with quoted uppercase column names.
- **Partnership timestamp trigger**: `update_partnership_timestamp` used unquoted `NEW.UPDATED_AT` → fixed to `NEW."UPDATED_AT"`.

### Root Cause
The Supabase linter fix script (`FIX_FUNCTION_SEARCH_PATH.sql`) correctly applied `SET search_path = ''` to all functions for security, but the function bodies were never updated to use schema-qualified table names (`public.tablename`) or double-quoted uppercase column names. This created a systemic mismatch where functions compiled fine but failed at runtime.

### New Files
- **`sql/FIX_FUNCTION_SEARCH_PATH_V2.sql`**: Recreates all 8 affected functions with correct schema qualification and column quoting.

## [2.10.1] - 2026-02-11

### Bug Fixes — Processing Queue
- **Storage Upload Conflict**: Changed `upsert: false` to `upsert: true` in `uploadToStorage()` to prevent "The resource already exists" errors when re-queuing assets. Added 409 fallback to gracefully handle duplicate uploads.
- **Edge Function Silent Failures**: Split `if (error || !data?.length) break` in the claim loop into separate error handling and empty-data checks. RPC errors are now logged (`console.error`) and propagated as `claimError` in the response instead of being silently swallowed.
- **Duplicate Queue Rows**: `insertJob()` now cancels existing PENDING/PROCESSING rows for the same ASSET_ID+USER_ID before inserting a new one. Added optimistic IndexedDB write in `requeueLocalAssets()` to close the partial-success window that created orphaned duplicates.
- **Inflated Queue Counts (157 vs 150)**: `getStats()` now deduplicates PENDING/PROCESSING counts using a `Set<string>` per ASSET_ID so duplicate rows don't inflate the displayed count.
- **Misleading "Check GEMINI_API_KEY" Alert**: `QueueMonitor` now differentiates between claim errors, stuck PROCESSING jobs, and an empty queue — offering a confirm dialog to release stale locks when jobs are stuck.
- **Error Display Noise**: Requeue error alerts now group errors by type with counts instead of listing individual asset UUIDs.

### New Files
- **`sql/FIX_QUEUE_DUPLICATES.sql`**: Idempotent migration that diagnoses/cancels duplicate active rows, adds a partial unique index `idx_pq_active_asset_per_user`, reduces default `LOCK_TIMEOUT_SECONDS` to 120s, and releases stale locks.

## [2.10.0] - 2026-02-11

### Infrastructure & Operations
- **Schema & Trigger Repair**: Introduced `sql/FIX_SCHEMA_AND_TRIGGERS.sql` to verify and repair table column naming consistency, automate avatar initialization for auth users, and ensure RLS policy integrity.
- **Fork Management Implementation**: Deployed automated GitHub workflows, `health-check.sh`, `sync-fork.sh`, and `reset-fork.sh` scripts to streamline remote repository synchronization and troubleshooting.
- **Download Service Implementation**: Added support for binary downloads, real-time progress tracking, and on-the-fly ZIP archive generation for processed datasets.
- **Queue Management Enhancements**: Introduced remote reset RPCs, queue health metrics, and continuous retry logic to ensure reliable long-running OCR processing.

## [2.9.11] - 2026-02-05

### Architecture & Project Organization
- **Dual-Write Database Persistence**: Implemented a mandatory dual-write strategy to ensure all data is persisted to the Loadopoly master database even when users connect their own Supabase instances.
- **Documentation Restructuring**: Organized root-level documentation into a structured `docs/` directory with `investment/`, `technical/`, `product/`, and `legal/` subcategories to improve repository maintainability.
- **Source Code Consolidation**: Merged `src/types.ts` into `src/types/index.ts` to eliminate redundancy and enforce a consistent modular architecture.
- **Root Directory Cleanup**: Reduced clutter by moving non-code assets and historical research documents to appropriate documentation folders.

## [2.9.10] - 2026-02-05

### Critical Fixes & Performance
This release resolves multiple severe regressions introduced in v2.9.8/v2.9.9 that caused the AR Scanner to display a black screen or timeout on many devices.

#### AR Scanner Camera Fixes
- **Reverted Multi-Tier Initialization**: The complex 4K/8K resolution negotiation strategy caused 50-second hardware driver timeouts on devices that couldn't meet the requested constraints. Reverted to simple `facingMode: 'environment'` constraints (v2.1-style) for instant camera acquisition.
- **Absolute Video Positioning**: Changed `<video>` element from relative Tailwind classes to explicit inline styles with `position: absolute` and `z-index: 1` to ensure proper layering.
- **Robust Stream Attachment**: Added a dedicated `useEffect` hook that re-attaches the MediaStream when the video element becomes available or when the Safety Warning is dismissed.
- **Multiple Play Triggers**: Added `onloadedmetadata`, `oncanplay`, `onLoadedData`, and `onPlay` event handlers with automatic retry logic to force video playback across all browsers.
- **Video Ready State**: Added `videoReady` state tracking with a loading indicator ("Initializing camera feed...") while the stream initializes.
- **Legacy iOS Support**: Added `webkit-playsinline` attribute for older Safari versions.

#### UI Performance Fixes
- **Sidebar & Tab Latency**: Fixed a severe 10-second lag when switching tabs or opening the sidebar by wrapping `aggregatedGroups`, `drillDownAssets`, and `paginatedAssets` in `useMemo` hooks in `App.tsx`.
- **Parallel Camera Loading**: Camera initialization now runs immediately on component mount (in parallel with the Safety Warning) rather than waiting for user acknowledgment.

#### Tooling
- **Camera Diagnostics**: Added `public/camera-test.html` standalone diagnostic tool for debugging camera initialization issues outside of React.

## [2.9.9] - 2026-02-04

### Universal Device Compatibility & Optimization
- **Multi-Tier Camera Initialization**: Implemented a robust fallback sequence for `getUserMedia` (Pro -> Standard -> Compatibility).
- **Device Capability Detection**: Added automatic detection of low-memory/low-CPU devices via `navigator.deviceMemory`.
- **Lite Mode UI**: Automatically simplifies AR animations and scanning grids on less capable hardware to preserve battery and maintain frame rate.
- **Throttled AR Simulation**: Reduced node generation frequency and quantity for "Lite" devices.
- **Improved Error Recovery**: Graceful handling of camera negotiation failures across different browser engines.

## [2.9.8] - 2026-02-04

### Hardware Optimization & AR Scanner Pro
- **Google Pixel 10 Pro Support**: Optimized AR Scanner for high-end mobile hardware.
- **4K/8K Resolution**: Enhanced `getUserMedia` constraints to request Ultra-HD video streams (up to 7680x4320).
- **Pro Capture Logic**: Integrated `ImageCapture` API for full sensor-resolution still captures, falling back to 98% quality canvas blobs.
- **Advanced Camera Controls**: 
  - Continuous Focus, White Balance, and Exposure modes.
  - Hardware Zoom range detection and support.
  - Flashlight/Torch toggle for low-light scanning.
- **Enhanced UI**: 
  - "Ultra 4K+" badge for high-resolution active sessions.
  - New Flashlight control in scanner HUD.
  - Optimized viewport utilization for high-aspect ratio mobile displays.

## [2.9.7] - 2026-02-04

### Database Schema Optimization
- **Consolidated Schema**: Created single source of truth `sql/CONSOLIDATED_SCHEMA.sql`.
  - Combines 27 fragmented SQL files into one idempotent schema.
  - Reduces schema size from 4,552 lines across files to 1,007 lines consolidated.
  - All tables, functions, triggers, RLS policies, and indexes in one file.
  - Unified uppercase column naming convention.
- **Repository Cleanup**: Moved 27 redundant SQL files to `sql/legacy/` to reduce clutter and prevent schema confusion.

- **Comprehensive Documentation**: Added `docs/` directory with:
  - [DATA_DICTIONARY.md](docs/DATA_DICTIONARY.md) - Complete table/column reference (523 lines)
  - [DATA_LINEAGE.md](docs/DATA_LINEAGE.md) - Data flow documentation (467 lines)
  - [SEMANTIC_MODEL.md](docs/SEMANTIC_MODEL.md) - Mermaid ERD diagrams (530 lines)

### Improved
- **DATABASE_SETUP.md**: Updated to reference new consolidated schema and documentation.
- **Function Search Paths**: All functions now have `SET search_path = ''` for security.
- **RLS Policy Performance**: All policies use `(select auth.uid())` pattern for better caching.

### Technical Debt Reduction
- **Schema Drift Prevention**: Single file prevents version inconsistencies.
- **Documentation Parity**: Data Dictionary, Lineage, and Semantic Model now synchronized.

## [2.9.6] - 2026-02-05

### Performance
- **3D Force Simulation Throttling**: WorldRenderer now throttles to 30fps instead of uncapped 60fps.
  - Reduces CPU usage by ~50% during knowledge graph visualization.
  - Uses timestamp-based frame skipping for consistent performance.

- **Size-Aware Batch Timeouts**: Batch processor now calculates dynamic timeouts based on file size.
  - Minimum 30s timeout, maximum 5 minutes.
  - Larger files get proportionally more processing time.
  - Prevents premature timeout failures on large documents.

### Network Reliability
- **Exponential Backoff for Realtime Reconnection**: ProcessingQueueService now uses exponential backoff with jitter.
  - Initial delay: 1s, max delay: 30s, max attempts: 10.
  - Adds ±25% jitter to prevent thundering herd on server recovery.
  - Prevents overwhelming server during reconnection storms.

### Fixed
- **Batch Processing Data Loss Prevention**: Added `beforeunload` event handler.
  - Warns users before closing page with active batch processing.
  - Prevents accidental data loss during long-running imports.

- **AR Zoom Error Visibility**: Silent zoom constraint failures now show user-visible toast.
  - Displays warning when camera doesn't support requested zoom level.
  - Toast auto-dismisses after 3 seconds.

- **Camera Memory Leaks**: Improved ARScene cleanup on unmount.
  - Explicitly stops all media tracks with logging.
  - Prevents camera staying active after navigating away.

## [2.9.5] - 2026-02-04

### Performance
- **Lazy Loading for Heavy Components**: Major bundle size reduction (~26KB from main bundle).
  - `GraphVisualizer`, `ARScene`, `SemanticCanvas`, `BatchImporter`, `AnnotationEditor`, and `WorldRenderer` now lazy load.
  - Added `BatchImporterLazy` and `AnnotationEditorLazy` wrappers to `lazyComponents.tsx`.
  - Components only download when user navigates to their respective tabs.

### Fixed
- **AR Scanner Error Handling**: Camera now displays user-friendly error messages.
  - HTTPS requirement check with clear messaging.
  - Permission denied, camera not found, and camera in-use errors now displayed in UI.
  - Added "Try Again" button for camera recovery.
  - Better error state management with `cameraError` state.

### Security
- **SQL Security Improvements**:
  - Added missing function search_path fixes for `update_job_progress`, `complete_processing_job`, `release_stale_locks`, `fail_processing_job`.
  - Fixed extension schema migration for pgvector.
  - Added additional RLS policy fixes for `object_attributes`, `taxonomy`, and `structured_classification_mappings`.
  - Added `password_leaked_protection_enabled` to Supabase auth config.

## [2.9.4] - 2026-01-31

### Added
- **Offline/Background Processing**: Processing now continues even when the app is closed.
  - Edge Function auto-chains: checks for remaining PENDING jobs after each batch and self-invokes.
  - Database trigger (`trg_invoke_processing_worker`) auto-invokes Edge Function on new job inserts.
  - Processing queue clears without user interaction.

- **Upload Progress Separation**: QueueMonitor now clearly separates:
  - Client-side upload progress ("Syncing to Cloud") 
  - Server-side queue stats (Waitlist, Active, Completed, Failed)
  - Contextual status messages explaining background processing state.

- **Production-Safe SQL Trigger**: New Vault-based trigger that reads service_role_key securely.
  - `sql/QUICK_SETUP_AUTO_TRIGGER.sql` - Production-ready trigger using Vault.
  - `supabase/migrations/20260131160000_enable_auto_processing.sql` - Migration file.

### Fixed
- **Column Case Mismatch**: Fixed Edge Function using uppercase `STATUS` when database uses lowercase `status`.
- **Trigger Disabled**: Added `ENABLE TRIGGER` command to SQL setup scripts.

### Security
- Removed embedded service_role_key from SQL files - now uses Supabase Vault.

## [2.9.3] - 2026-01-25

### Added
- **Clear Stuck Assets Feature**: New tools to recover from stuck processing/pending states on mobile.
  - `clearStuckAssets()` - Deletes assets stuck in PROCESSING or PENDING from IndexedDB.
  - `resetStuckAssets()` - Resets PROCESSING assets back to PENDING for retry without data loss.
  - `cancelAllPendingJobs()` - Cancels all PENDING/PROCESSING jobs in Supabase queue.
  - `deleteAllJobs()` - Nuclear option to delete all queue history for a user.
  
- **Queue Monitor UI Enhancements**:
  - **Reset Local Stuck** button - Resets local PROCESSING items to PENDING for retry.
  - **Clear All Stuck** button - Clears all stuck items from both server and local storage (with confirmation).
  - Better visibility of actions when items are stuck.

### Fixed
- **Supabase Configuration**: Fixed `.env.local` having malformed anon key that was overriding correct credentials.
- **Server-side Processing Path**: Batch processing now properly queues to server when online and logged in.
- **Asset Persistence**: Assets are now saved to IndexedDB immediately after creation for reliable re-queueing.

## [2.9.2] - 2026-01-20

### Fixed
- **Assets Reset on Refresh**: Fixed critical bug where pending assets count would reset after page refresh.
  - `requeueLocalAssets()` now updates IndexedDB to mark assets as `PROCESSING` with a `serverJobId` after successful upload.
  - Added `serverJobId` field to `DigitalAsset` interface to track which assets have been sent to the server.
  - Local pending count now excludes assets that have already been uploaded (have `serverJobId`).
  - Re-queue filter now skips assets already sent to server, preventing duplicate uploads.
  - Assets persist their "sent to server" state across page refreshes.

## [2.9.1] - 2026-01-20

### Fixed
- **Queue Stats Not Updating**: Fixed critical bug where processing queue status never updated.
  - `getStats()` was querying a `queue_stats` view that only returned global stats (not user-specific) and excluded COMPLETED items.
  - Now queries `processing_queue` table directly with proper user filtering.
  - Fixed case mismatch: database returns `STATUS` (uppercase) but code expected `status` (lowercase).
  - Added proper null checks before Supabase operations to prevent silent failures.
  - Fixed malformed double-parenthesis casts `( (supabase as any))` throughout the service.
  - Added error handling for Realtime subscription CHANNEL_ERROR status.
  - Realtime subscription now properly validates Supabase is configured before attempting to subscribe.

## [2.9.0] - 2026-01-20

### Added
- **Enhanced Queue Monitor UI**: Complete overhaul of the processing queue monitor component.
  - **Prominent Queue Badge**: Shows total queued items (pending + processing) with animated indicator.
  - **Stage Breakdown Panel**: Collapsible panel showing all processing stages with item counts.
  - **Interactive Filtering**: Click on any stage to filter the job list; status filter buttons (PEND/PROC/COMP/FAIL).
  - **Detailed Job List**: Scrollable list with status indicators, scan type icons, asset IDs, current stage, and progress bars.
  - **Expandable Job Details**: Click to expand job metadata including ID, status, priority, retries, timestamps, and error messages.
  - **Real-time Updates**: Automatic refresh every 30 seconds with manual refresh option.

### Changed
- **Aggressive Bundle Splitting**: Reduced main bundle size by 70% through improved Vite configuration.
  - App chunk: 892KB → 329KB (gzipped: 266KB → 81KB)
  - Visualization libs (D3 + Force Graph) lazy-loaded together
  - Processing UI components (QueueMonitor, BatchProcessing, ClusterSync) in dedicated chunk
  - Metaverse components in separate lazy-loaded chunk
  - No more circular chunk warnings

### Fixed
- **TypeScript Errors**: Fixed type mismatches in BatchItem and DigitalAsset interfaces.
  - Added `FAILED` status and `stage` property to `BatchItem` type.
  - Added `scanType` property to `DigitalAsset` interface.
  - Fixed null check for Supabase client in `processingQueueService`.

### Technical Details
- **Bundle Sizes (gzipped)**:
  - `index.js`: 14KB (entry point)
  - `vendor-icons.js`: 10KB (Lucide icons)
  - `vendor-storage.js`: 32KB (Dexie/IndexedDB)
  - `vendor-supabase.js`: 44KB (Supabase client)
  - `vendor-visualization.js`: 64KB (D3 + Force graph)
  - `chunk-processing-ui.js`: 51KB (Queue/Batch panels)
  - `vendor-ai.js`: 50KB (Google AI)
  - `vendor-web3.js`: 97KB (Ethers.js - optional)
  - `App.js`: 81KB (main app)

## [2.8.2] - 2026-01-14

### Added
- **New Scalable Batch Processing System**: Complete rewrite of batch processing for handling 100s-1000s of documents efficiently.
  - New `BatchProcessorService` ([src/services/batchProcessorService.ts](src/services/batchProcessorService.ts)) - fault-tolerant processing engine.
  - New `BatchProcessingPanel` ([src/components/BatchProcessingPanel.tsx](src/components/BatchProcessingPanel.tsx)) - comprehensive UI with real-time progress.
  - **Pause/Resume/Cancel** capabilities for long-running batch jobs.
  - **Automatic retry** with configurable exponential backoff (3 retries by default).
  - **Processing timeout** protection (60 seconds per item).
  - **Progress persistence** across page reloads (completed items survive refresh).
  - **Real-time stats**: ETA calculation, throughput metrics, completion times.
  - **Drag & drop** file uploads with keyboard shortcuts (Ctrl+P pause/resume, Esc close).
  - **Memory-efficient**: Virtualized list shows first 100 items, chunked file processing.
  - **Mobile-optimized**: Respects `MAX_CONCURRENT_BATCH_JOBS = 3` limit.

### Changed
- **Batch Import Flow**: `handleBatchFiles()` now delegates to the new `BatchProcessorService` singleton.
- **Processing Panel**: Added "Open Large Batch Manager" button to access the new full-featured panel.
- Legacy batch queue (batchQueue state) preserved for backward compatibility but new panel is recommended.

### Technical Details
- **BatchProcessorService** is a singleton with configurable callbacks for UI updates.
- Files are stored in memory Map (can't persist File objects), but item metadata persists to localStorage.
- State machine: IDLE → RUNNING → PAUSED/STOPPING → IDLE.
- Items stuck at PROCESSING status are auto-recovered to QUEUED on component mount.

## [2.8.1] - 2026-01-14

### Fixed
- **Edge Processing Pipeline**: Fixed critical issue where photos were not processing on edge and database was not being updated.
- **Large Batch Processing on Mobile**: Fixed memory and performance issues when processing 100+ items from local cached data.

### Changed
- **Optimized Realtime Architecture**: Replaced inefficient callback chain with direct Supabase Realtime subscription.
  - Now subscribes directly to `historical_documents_global` instead of `processing_queue` for asset updates.
  - Edge function saves `USER_ID` to enable Realtime filter matching.
  - Removed redundant client-side re-sync to global corpus (edge function already handles this).
  - Single Realtime event now delivers complete asset data without re-fetching.

- **Updated SQL Functions**:
  - `claim_processing_job` RPC now returns `user_id` for proper asset attribution in edge function.

- **Processing Queue Service Improvements**:
  - Added `getJobById()` method for direct job lookup.
  - Enhanced Realtime subscription with auto-reconnection on channel close.
  - Simplified callbacks to focus on progress updates only.
  - Added retry logic with exponential backoff for storage uploads on unstable mobile networks.

- **New Supabase Service Export**:
  - Added `subscribeToAssetUpdates()` for efficient direct Realtime subscription to asset table.

- **Mobile Batch Processing Optimizations**:
  - Added concurrency limit (`MAX_CONCURRENT_BATCH_JOBS = 3`) to prevent memory exhaustion.
  - Throttled `processNextBatchItem` with scheduled delays between items for GC and UI responsiveness.
  - Optimized SHA256 hashing for large files (>10MB) using chunked approach instead of full-file read.
  - Added cleanup effect to revoke blob URLs and free memory when component unmounts.
  - Uses `requestIdleCallback` when available for better mobile performance.

### Technical Details
- **Before**: Client → queue → edge → DB → queue notification → client fetches result → client re-syncs → IndexedDB
- **After**: Client → queue → edge → DB (with USER_ID) → direct Realtime notification → IndexedDB

## [2.8.0] - 2026-01-14

### Added
- **PWA Optimization Suite**:
  - Enhanced Service Worker v3.0.0 with multi-cache architecture (static, images, API).
  - Stale-while-revalidate caching strategy for images.
  - Rich push notifications with actions and deep linking.
  - Background sync handlers for offline contributions.
  - New [src/lib/pwaUtils.ts](src/lib/pwaUtils.ts) for install prompts, update management, share API, and wake lock.

- **Performance Monitoring Infrastructure**:
  - Web Vitals tracking (LCP, FID, CLS, FCP, TTFB) in [src/lib/performanceMonitor.ts](src/lib/performanceMonitor.ts).
  - Real-time FPS monitoring for animation performance.
  - Memory usage tracking via Performance API.
  - Device capability detection with automatic tier classification (low/mid/high).
  - Adaptive settings that auto-adjust based on device capability.

- **Lazy Loading System**:
  - Code-split heavy components via [src/lib/lazyComponents.tsx](src/lib/lazyComponents.tsx).
  - Suspense boundaries with branded loading states.
  - Error boundaries with retry capability.
  - Viewport-based lazy loading using IntersectionObserver.
  - Preload hints for route prefetching.

- **Database Schema Management**:
  - [sql/HEALTH_CHECK_V2.8.1.sql](sql/HEALTH_CHECK_V2.8.1.sql) - Comprehensive verification query for all schema requirements.
  - [sql/COMPLETE_SCHEMA_SETUP_V2.8.1.sql](sql/COMPLETE_SCHEMA_SETUP_V2.8.1.sql) - Idempotent setup script covering:
    - pgvector extension for semantic similarity search.
    - `processing_queue` table with RLS policies.
    - `structured_clusters` table with RLS policies.
    - Vector embedding columns (`TEXT_EMBEDDING`, `IMAGE_EMBEDDING`, `COMBINED_EMBEDDING`).
    - Structured classification columns (6 cluster types + 4 LLM attribution fields).
    - GIN indexes for JSONB columns.

### Changed
- **Manifest Enhancements**:
  - Added `display_override` with window-controls-overlay for desktop PWA.
  - Added `handle_links: "preferred"` for link capturing.
  - Added `scope_extensions` for Vercel deployment domains.
  - Updated `orientation: "natural"` for device-adaptive layout.
  - Bumped manifest version to 1.9.0.

- **Build Optimization**:
  - Added manual chunks for vendor-d3 and vendor-three.
  - Set ES2020 target for smaller modern bundles.
  - Switched from terser to esbuild for faster minification.
  - Excluded Three.js from pre-bundling for better code splitting.

### Documentation
- Updated [ARCHITECTURE_IMPROVEMENTS.md](ARCHITECTURE_IMPROVEMENTS.md) with Phase 6: PWA & Performance Optimization.

## [2.7.0] - 2026-01-13

### Added
- **Web3 Architecture Enhancements**:
  - **Oracle Verification**: Chainlink integration for multi-LLM consensus on OCR outputs ([src/services/oracleVerificationService.ts](src/services/oracleVerificationService.ts)).
  - **Batch Processing**: Gas-efficient ERC1155 sharding with semantic clustering and GARD staking ([src/services/batchProcessingService.ts](src/services/batchProcessingService.ts)).
  - **Edge OCR**: Offline pre-processing using Tesseract.js WebAssembly to reduce API costs ([src/services/edgeOCRService.ts](src/services/edgeOCRService.ts)).
  - **ZK Proofs**: Privacy-preserving graph integrity proofs using SnarkJS ([src/services/zkProofService.ts](src/services/zkProofService.ts)).
  - **Zone Sharding**: Voxel-based metaverse partitioning and micro-DAO spatial governance ([src/services/zoneShardingService.ts](src/services/zoneShardingService.ts)).
  - **Hybrid Rendering**: Adaptive WebGL-to-SVG visualization with IPFS lazy loading ([src/plugins/hybridRenderingPlugin.ts](src/plugins/hybridRenderingPlugin.ts)).
  - **Adaptive Royalties**: Utility-based dynamic royalty curves in upgraded GARD contracts ([contracts/GARDDataShardV2.sol](contracts/GARDDataShardV2.sol)).
  - **Cross-Chain Bridge**: HTLC atomic swaps for shard liquidity between Polygon, Optimism, Arbitrum, and Base ([contracts/ShardBridge.sol](contracts/ShardBridge.sol)).
  - **Plugin Security**: EIP-712 signature verification and permission-based sandboxing ([src/services/pluginSecurityService.ts](src/services/pluginSecurityService.ts)).
  - **Web3 Analytics**: Automated metrics for queue health, gas efficiency, and tokenomics sustainability ([src/services/analyticsService.ts](src/services/analyticsService.ts)).
- **Documentation**: New [WEB3_ARCHITECTURE.md](WEB3_ARCHITECTURE.md) master guide for decentralized optimizations.

## [2.6.0] - 2026-01-12

### Added
- **Architectural Improvements for Data Processing**:
  - Implemented background processing queue using Supabase and Postgres.
  - Added [src/services/processingQueueService.ts](src/services/processingQueueService.ts) to manage server-side OCR orchestration.
  - Integrated client-side image compression in [src/lib/imageCompression.ts](src/lib/imageCompression.ts) using Canvas API.
  - Implemented **Circuit Breaker** pattern in [src/lib/circuitBreaker.ts](src/lib/circuitBreaker.ts) for Gemini API fault tolerance.
  - Added **Worker Pool** in [src/lib/workerPool.ts](src/lib/workerPool.ts) and [src/workers/parallelWorker.ts](src/workers/parallelWorker.ts) for off-thread parallel processing.
  - Created [src/components/QueueMonitor.tsx](src/components/QueueMonitor.tsx) for real-time infrastructure health monitoring.
  - Added master roadmap in [ARCHITECTURE_IMPROVEMENTS.md](ARCHITECTURE_IMPROVEMENTS.md).
  - Added SQL schemas for [processing queue](sql/PROCESSING_QUEUE_SCHEMA.sql) and [vector embeddings](sql/VECTOR_EMBEDDINGS_SCHEMA.sql).

### Changed
- **Gemini Integration** - Updated [src/services/geminiService.ts](src/services/geminiService.ts) to use the Circuit Breaker, preventing cascading failures during API outages.
- **Frontend Pipeline** - Refactored [src/App.tsx](src/App.tsx) to support background queuing, real-time status updates, and graceful client-side fallbacks.

## [2.5.9] - 2026-01-12

### Fixed
- **Story Narrator Engine Initialization** - Fixed issue where "Begin Your Journey" action would fail due to stale narrative engine state using `useMemo`.
- **Story Start Fallback** - Added automatic fallback to highest relevance node if narrative suggestion is unavailable.
- **World Rendering Sync** - Added state-stale detection and recovery for node selection in WorldRenderer.
- **Narrative Loading UI** - Added loading state for story chapter generation to improve UX.

### Added
- **AR Safety Warning** - Integrated mandatory safety briefing before initiating AR camera sessions.

## [2.5.8] - 2026-01-11

### Added
- **Cluster Sync Statistics Panel** - Human-in-the-loop comprehension interface:
  - **ClusterSyncStatsPanel.tsx** - Full-featured statistics overview modal:
    - Overview tab with key metrics: Total Assets, Fully Structured, Partially Classified, Unstructured
    - Visual pie chart showing classification distribution with quality score
    - LLM attribution tracking showing which models performed classifications
  - **Clusters tab** - Per-cluster progress visualization:
    - Progress bars for all 6 structured clusters (Temporal, Spatial, Content, Knowledge Graph, Provenance, Discovery)
    - Color-coded completion percentages with threshold indicators
    - Quick reference guide explaining what gets classified in each cluster
  - **Quality tab** - Corpus health metrics:
    - Circular quality indicators for Structured Coverage, Average Confidence, Overall Quality
    - Intelligent recommendations based on corpus state
    - Benefits summary of structured data for discovery
  - Seamless transition to full Cluster Synchronizer from any tab

- **ClusterSyncButton Component** - Easily identifiable button for Curator Mode:
  - Gradient background with primary-to-violet color scheme
  - GitMerge icon for visual recognition
  - Real-time percentage badge showing classification progress
  - Color-coded badge (green ≥80%, amber ≥50%, gray <50%)
  - Hover effects with scale transform

### Changed
- **App.tsx** - Integrated Cluster Sync UI into Curator Mode:
  - Added ClusterSyncButton to Curator Mode header (next to FilterBadge)
  - Button shows live stats calculating fully-structured asset count
  - ClusterSyncStatsPanel modal renders when button clicked

### Fixed
- **ClusterSynchronizer.tsx** - Fixed property access for LLM response:
  - Changed `result.analysis` to `result.rawAnalysis` to match `MetadataExtractionResult` interface

## [2.5.7] - 2026-01-11

### Added
- **Cluster Synchronizer Curator Tool** - LLM-powered structured classification system:
  - **6 Structured Cluster Columns** for synchronized dimension values:
    - `STRUCTURED_TEMPORAL` - Era, Historical Period, Document Age
    - `STRUCTURED_SPATIAL` - Zone, Geographic Scale, Place Type
    - `STRUCTURED_CONTENT` - Category, Scan Type, Media Type, Subject Matter
    - `STRUCTURED_KNOWLEDGE_GRAPH` - Node Type, Connection Density, Narrative Role
    - `STRUCTURED_PROVENANCE` - License, Verification Level, Contested
    - `STRUCTURED_DISCOVERY` - Source, Entity Types, Serendipity Score, Research Potential
  - **LLM Attribution**: `CLASSIFICATION_LLM`, `CLASSIFICATION_DATE`, `CLASSIFICATION_VERSION`, `CLASSIFICATION_CONFIDENCE`

- **ClusterSynchronizer.tsx Component** - Interactive curator tool:
  - Per-cluster LLM classification with custom prompts
  - Bulk sync capability for corpus-wide classification
  - Progress tracking with pause/resume/skip controls
  - Export classification results as JSON
  - Learned mapping panel for similarity-based proxy classification

- **Structured Classification Mappings** - Similarity-based proxy classification:
  - `structured_classification_mappings` table for learned correlations
  - `classification_audit_log` for provenance tracking
  - `cluster_dimension_statistics` for corpus-wide dimension distribution
  - Helper functions: `find_structured_mapping()`, `get_dimension_distribution()`, `upsert_classification_mapping()`

- **Classification Status Filter Dimension** - New filter for structured vs unstructured:
  - `classificationStatus` dimension: structured | partial | unstructured
  - Quick filter presets: `structured_only`, `unstructured_only`, `partially_classified`
  - `getClassificationStatus()` utility function

- **New TypeScript Types** for structured clusters:
  - `StructuredTemporalCluster`, `StructuredSpatialCluster`, `StructuredContentCluster`
  - `StructuredKnowledgeGraphCluster`, `StructuredProvenanceCluster`, `StructuredDiscoveryCluster`
  - Classification fields on `HistoricalDocumentMetadata`

### Changed
- **FilterContext.tsx** - Added 25th filter dimension (`classificationStatus`) and 3 new quick filter presets
- **UnifiedFilterPanel.tsx** - Extended dimension icons and quick filter info for classification status
- **FilterDependencyVisualizer.tsx** - Added classification status node position
- **types.ts** - Extended `HistoricalDocumentMetadata` with 6 structured cluster columns and classification metadata

### Database
- **sql/STRUCTURED_CLUSTER_SCHEMA.sql** - Complete schema for structured classification:
  - ALTER TABLE for 10 new columns on `historical_documents_global`
  - 3 new tables: `structured_classification_mappings`, `classification_audit_log`, `cluster_dimension_statistics`
  - GIN indexes for JSONB columns
  - RLS policies for public read, authenticated write
  - Stored functions for mapping lookup and statistics

## [2.5.6] - 2026-01-11

### Added
- **Historian-Informed Filter System** - Comprehensive expansion of filter dimensions designed by Digital Transformation Public Historians:
  - **24 Filter Dimensions** organized into 6 thematic clusters:
    - *Temporal*: Era, Historical Period, Document Age
    - *Spatial*: GIS Zone, Geographic Scale, Place Type
    - *Content Classification*: Category, Scan Type, Media Type, Subject Matter
    - *Knowledge Graph*: Node Type, Connection Density, Narrative Role
    - *Provenance & Trust*: License, Confidence, Verification Level, Contested
    - *Discovery Modes*: Source, Status, Entities, Relevance, Serendipity Score, Research Potential

- **Historical Period Mapping** - Intelligent era-to-period derivation:
  - Victorian Era, Edwardian Period, Roaring Twenties, Jazz Age, Art Deco
  - Great Depression, Swing Era, WWII Home Front, Atomic Age
  - Mid-Century Modern, Space Age, Counterculture, Civil Rights Era
  - Disco Era, Digital Dawn, Information Age, Social Media Era

- **25+ Quick Filter Presets** - New historian and discovery-focused presets:
  - *Trust & Verification*: Expert Verified, Community Curated
  - *Historical Periods*: Turn of Century (1890s-1910s), Interwar Period (1920s-1930s), Postwar Modern (1950s-1970s)
  - *Discovery Modes*: Serendipity High, Research Goldmine, Hidden Connections, Lonely Artifacts
  - *Subject-Focused*: People Stories, Place Histories, Ephemera Treasures
  - *Narrative Roles*: Narrative Anchors, Context Builders

- **Advanced Utility Functions** for dynamic dimension derivation:
  - `calculateSerendipityScore()` - Measures surprise potential from rare entities, contested status, cross-category links
  - `calculateResearchPotential()` - Scores scholarly value from entity richness, graph connectivity, confidence
  - `getConnectionDensity()` - Classifies graph role as Isolated/Linked/Hub based on connection count
  - `deriveNarrativeRole()` - Identifies story function: Protagonist, Setting, Evidence, Context
  - `deriveMediaType()` - Classifies format: Photograph, Map, Letter, Newspaper, etc.
  - `deriveGeographicScale()` - Determines scope: Local, Regional, National, International

- **Enhanced Dependency Graph** - 25+ filter relationships with historian-informed cascades:
  - Era → Historical Period, Document Age (automatic derivation)
  - Subject Matter → Narrative Role (content-to-story mapping)
  - Connection Density → Research Potential (hub identification)
  - Verification Level → Confidence (trust propagation)

### Changed
- **FilterContext.tsx** - Complete rewrite of dimension metadata with rich descriptions
- **UnifiedFilterPanel.tsx** - Extended to support all 24 dimensions with new icons
- **FilterDependencyVisualizer.tsx** - Reorganized node positions into thematic clusters
- **applyFilterToAsset()** - Context-aware filtering with full asset corpus access

## [2.5.4] - 2026-01-11

### Changed
- **Semantic View Integration** - Semantic Canvas is now a selectable sub-view within 3D World:
  - Removed Semantic View from the main sidebar navigation
  - Added view mode toggle in 3D World header (3D View / Semantic)
  - Streamlined navigation with cleaner sidebar structure
  - Semantic Canvas dynamically loads within the 3D World container

### Removed
- Standalone Semantic View sidebar item (now accessible via 3D World view toggle)
- `semantic` ViewMode type from FilterContext (consolidated into `world` view)

## [2.5.3] - 2026-01-11

### Added
- **Social Hub** - Unified interface condensing Communities, Messaging, and Social Returns (GARD) into a single, curated social experience.
- **Dynamic Filter Dependency System** - Comprehensive interdependent filtering across views:
  - `FilterContext` - Centralized React context managing filter state across all views
  - 12 filter dimensions: category, era, license, nodeType, zone, scanType, status, confidence, entities, relevance, contested, source
  - Dynamic dependency graph defining relationships between dimensions
  - Cross-view synchronization with toggle controls

- **UnifiedFilterPanel Component** - Sophisticated sliding panel UI:
  - Quick filter presets (Public Domain, High Confidence, Documents Only, etc.)
  - View sync toggles showing which views share filters
  - Analytics bar with real-time filter efficiency metrics
  - Expandable dimension cards with dependency constraint badges
  - Import/Export functionality for filter configurations

- **Dynamic LLM Selection & Configuration** - Expanded AI capabilities:
  - New "LLM Options & Credentials" section in Settings for managing multiple AI providers
  - Support for Gemini, GPT-4o, Claude 3.5 Sonnet, and Local (Ollama) configurations
  - Unified credential management (API Keys, Usernames, Logins) stored per-model
  - Real-time LLM status display in the sidebar Geo Location section
  - Updated preservation logs to track specific model agents used per process

- **InlineFilterBar Component** - Compact filter bar for each view:
  - Category, Era, and License dropdowns
  - Active filter count with clear button
  - Integrated into Knowledge Graph, 3D World, Structure DB, and Curator views

- **FilterDependencyVisualizer Component** - Interactive SVG visualization:
  - Circular layout of filter dimensions as nodes
  - Dependency edges with weight indicators
  - "Constrains" vs "Suggests" relationship types
  - Active filter highlighting with glow effects
  - Hover tooltips with dimension metadata

- **FilterInsightsPanel** - Dashboard widget in SmartSuggestions:
  - Collapsed summary bar showing filter stats
  - Cross-view dependency indicators
  - Embedded dependency graph toggle
  - AI-powered filter recommendations

### Changed
- **App.tsx** - Wrapped with FilterProvider, added sidebar toggle for Dynamic Filters
- **Knowledge Graph view** - Added FilterBadge and InlineFilterBar integration
- **3D World view** - Added header with FilterBadge and InlineFilterBar
- **Structure DB view** - Added FilterBadge and InlineFilterBar
- **Curator Mode view** - Added FilterBadge and InlineFilterBar
- **SmartSuggestions** - Added FilterInsightsPanel with dependency visualization

## [2.5.2] - 2026-01-11

### Fixed
- **Sidebar Scrolling** - Implemented `overflow-y-auto` on both desktop and mobile sidebars to ensure all navigation items are accessible on smaller viewports.
- **Custom Scrollbar** - Defined `.custom-scrollbar` utility in `index.css` for a cleaner, unified UI experience across the application.

## [2.5.1] - 2026-01-11

### Fixed
- **Service Worker Caching Issues** - Complete rewrite of `sw.js` (v2.0.0):
  - Fixed blank page issues caused by stale cached JS/CSS bundles
  - Fixed MIME type errors (`text/html` served instead of `text/css`)
  - Service worker now NEVER caches Vite-generated assets (`/assets/*`)
  - Network-first strategy for navigation requests
  - Auto-cleanup of stale assets on SW activation
  - Content-type validation before caching

- **Processing State Consistency** - Fixed mismatch between different views:
  - `handleProcessAllPending` now includes both PENDING and PROCESSING status
  - Assets start as PENDING and transition to PROCESSING when pipeline starts
  - Processing Queue panel shows unified view of batch queue + pending assets
  - Individual "Resume" button for each pending asset in queue panel
  - Real-time progress updates during processing pipeline

- **Bootstrap Race Condition** - Removed auto-initialization in `bootstrap.ts`
  that caused race conditions with explicit `bootstrapModuleSystem()` call

### Added
- **Loading State** - Immediate loading spinner while app initializes (no blank screen)
- **SW Update Detection** - Auto-prompts users when new version is available
- **Cache Recovery UI** - "Clear Cache & Reload" button in error screen for SW issues
- **Build Timestamp** - `__BUILD_TIME__` injection for debugging cache problems
- **Vercel Headers** - Proper MIME types and caching headers:
  - `X-Content-Type-Options: nosniff` prevents MIME sniffing
  - Immutable caching (1 year) for hashed assets
  - No-cache for `index.html` and `sw.js`

### Changed
- **Vite Build Config** - Added manual chunks for better caching:
  - `vendor-react` - React and React DOM
  - `vendor-ui` - Lucide React icons
  - `vendor-data` - Dexie and Supabase client
- Source maps now enabled for production debugging
- Pre-bundled common dependencies for faster dev startup

## [2.5.0] - 2026-01-09

### Added
- **Modular Plugin Architecture** (`src/modules/`):
  - `ModuleRegistry` - Central registry for all pluggable modules
  - `EventEmitter` - Mitt-style pub/sub system for module communication
  - `PluginLoader` - Dynamic loading of plugins from URLs or manifests
  - `PluginBuilder` - Fluent API for creating plugins

- **Abstract Storage Interface** (`src/modules/storage/`):
  - `IDataStorage` interface for swappable backends
  - `BaseStorage` abstract class with common functionality
  - `SupabaseStorage` - Full implementation for Supabase backend
  - `InMemoryStorage` - Testing/offline fallback storage

- **LLM Provider System** (`src/modules/llm/`):
  - `ILLMProvider` interface for AI backend abstraction
  - `BaseLLMProvider` with conflict arbitration defaults
  - `GeminiProvider` - Wraps existing Gemini service
  - `OpenAIProvider` - Alternative GPT-4o integration
  - `MockLLMProvider` - Testing fallback

- **Self-Healing Graph System** (`src/modules/graphHealer.ts`):
  - 4 built-in healing strategies:
    - `deduplication` - Merges duplicate nodes by similarity
    - `orphan-linking` - Links disconnected nodes to main graph
    - `edge-inference` - Infers edges from shared neighbors
    - `conflict-resolution` - LLM-powered metadata arbitration
  - Scheduled healing with configurable intervals
  - Healing history and event tracking

- **Feature Flags System** (`src/modules/featureFlags.ts`):
  - `LocalStorageFeatureFlagProvider` - Persistent browser storage
  - `EnvironmentFeatureFlagProvider` - Environment variable based
  - Rollout percentage support for gradual releases
  - User tier restrictions (novice, intermediate, expert)
  - Flag subscription for reactive UI updates

- **React Integration** (`src/hooks/useModules.ts`, `src/contexts/ModuleContext.tsx`):
  - `useFeatureFlag` - Check feature flag status
  - `useStorage` - Access active storage adapter
  - `useLLMProvider` - Access active LLM provider
  - `useGraphHealer` - Heal graphs on demand
  - `useModuleEvent` - Subscribe to module events
  - `ModuleProvider` - Context provider for module system

- **Example Plugin** (`src/plugins/threejs-renderer.tsx`):
  - Three.js 3D graph renderer with interactive controls
  - Demonstrates plugin architecture patterns
  - WebGL support detection

### Changed
- `src/index.tsx` now bootstraps the module system before app render
- Module system initializes LLM providers and storage adapters on startup

## [2.4.0] - 2026-01-09

### Added
- **Enhanced Theme System** (`useTheme.ts`):
  - Dark/Light mode toggle with system preference auto-detection
  - High contrast mode for accessibility (WCAG AA)
  - Reduced motion support for users who prefer minimal animations
  - CSS custom properties for consistent theming
  - Persistent user preferences via localStorage

- **Global Semantic Search** (`GlobalSearch.tsx`):
  - NLP-powered search with `Cmd+K` / `Ctrl+K` keyboard shortcut
  - Filter by category: GIS locations, entities, documents, dates, keywords
  - Fuzzy matching algorithm for typo-tolerant results
  - Recent searches history
  - Full keyboard navigation (↑↓ to navigate, Enter to select, Esc to close)

- **Enhanced Onboarding Wizard** (`EnhancedOnboarding.tsx`):
  - Multi-step setup: Welcome → Account → API Keys → Demo Tour → Customize
  - Social login integration ready (Supabase auth)
  - Secure API key input with visibility toggle and validation
  - Progressive disclosure based on user level (beginner/intermediate/advanced)
  - Optional step skipping for experienced users
  - Demo tour highlighting key features

- **2D Map Fallback for Metaverse** (`MapView2D.tsx`):
  - Canvas-based 2D alternative to 3D WebGL visualization
  - Touch support with pinch-to-zoom gestures
  - Haptic feedback on mobile devices
  - Pan/zoom controls with smooth transitions
  - Type-based node filtering (Document, Person, Location, etc.)
  - View mode switcher: Map, Grid, List

- **Analytics & Event Tracking** (`useAnalytics.ts`):
  - Comprehensive event tracking for user flows
  - Funnel analysis for drop-off detection (NFT minting, uploads, onboarding)
  - Session management with automatic start/end tracking
  - Performance metrics (Core Web Vitals)
  - In-app survey system for user feedback
  - Batch event queuing with configurable flush intervals

- **Enhanced Error States** (`ErrorState.tsx`):
  - Contextual error messages for OCR, upload, network, wallet failures
  - Actionable suggestions with retry options
  - Manual edit fallback for OCR failures
  - Inline and full-page error variants
  - Copy error details for support tickets
  - Help documentation links

### Changed
- **Tailwind Configuration:**
  - Extended color palette with earth tones for GIS surfaces
  - AI/metadata highlight colors (blue accent)
  - New animations: fade-in, slide-up, slide-down, pulse-glow, bounce-subtle, shimmer
  - Custom glow shadows for interactive elements
  - Font family configuration (Inter for UI, JetBrains Mono for code)
  - High contrast mode utilities

- **CSS Enhancements** (`index.css`):
  - CSS variables for light/dark theme switching
  - Screen reader utilities (`.sr-only`)
  - Focus visible styles for keyboard navigation
  - Reduced motion media query support
  - Custom scrollbar styling
  - Loading skeleton animation
  - Print-friendly styles

- **Accessibility Utilities** (`accessibility.ts`):
  - ARIA live region initialization
  - Color contrast ratio calculation (WCAG 2.1 formula)
  - Contrast requirement validation (4.5:1 normal, 3:1 large text)
  - Accessible text color suggestion based on background
  - Focus trap for modal dialogs
  - Arrow key navigation helpers
  - Screen reader description generators for images and graph nodes
  - Accessibility audit function for Lighthouse-style checks

### Technical
- New hooks: `useTheme`, `useAnalytics`, `useFunnelAnalytics`, `usePerformanceAnalytics`, `useSurveyAnalytics`
- New components: `GlobalSearch`, `EnhancedOnboarding`, `MapView2D`, `ErrorState`, `ProcessingState`, `EmptyState`
- Metaverse index exports updated for new 2D map component

## [2.3.0] - 2026-01-06

### Added
- **Enhanced Deduplication Service V2:** Complete rewrite of duplicate detection with modern NLP techniques:
  - **N-gram similarity:** Character trigrams for order-independent matching ("1950 Opening Day" ↔ "Opening Day 1950")
  - **Shingle similarity:** Word n-grams (1-gram, 2-gram, 3-gram) for semantic phrase matching
  - **Semantic concept extraction:** Prioritizes years (4x weight), dates, proper nouns, and key subjects
  - **Phonetic encoding:** Soundex-like algorithm for OCR error tolerance ("Antonio" ↔ "Antoneo")
  - **Multi-technique scoring:** Combines multiple similarity methods (takes best score)
  - **Research-backed algorithms:** Based on Near-Duplicate Detection (Henzinger 2006), SimHash (Charikar 2002), MinHash (Broder 1997)
  
- **Curator Merge Panel:** New manual curation UI for consolidating assets:
  - **Suggestions Tab:** AI-powered merge suggestions with one-click accept/reject
  - **Manual Merge Tab:** Select multiple assets and merge with custom title
  - **Find Similar Tab:** Search for assets similar to a selected reference
  - Similarity badges showing match confidence (High/Medium/Fair/Low)
  - Match reason tags explaining why items are suggested for merge
  - Expandable detail view showing all items and consolidated metadata
  - Selection-based workflow integrating with existing asset views

### Changed
- **Deduplication Threshold:** Lowered from 0.55 to 0.40 for better recall (catches more similar items)
- **Bundle Service:** Updated to use V2 deduplication with enhanced clustering algorithm
- **Union-Find Optimization:** Added path compression and rank optimization for faster clustering

### Technical
- `deduplicationServiceV2.ts`: New service with modern similarity algorithms (~750 lines)
- `CuratorMergePanel.tsx`: Manual curation component with suggestions, manual merge, and similarity search

### Research References
- M. Henzinger, "Finding Near-Duplicate Web Pages: A Large-Scale Evaluation of Algorithms" (SIGIR 2006)
- M. Charikar, "Similarity Estimation Techniques from Rounding Algorithms" (STOC 2002)
- A. Broder, "On the Resemblance and Containment of Documents" (SEQUENCES 1997)
- G. Navarro, "A Guided Tour to Approximate String Matching" (ACM Computing Surveys 2001)

## [2.2.0] - 2026-01-06

### Added
- **Story Navigator - "Choose Your Own Adventure" Experience:**
  - Narrative Engine generates contextual story chapters as you explore
  - Typewriter text animation for immersive reading
  - Branching story choices with difficulty indicators (easy/medium/challenging)
  - Mood system (mysterious, revelatory, contemplative, exciting, melancholic)
  - Journey summary tracking your exploration path
  - Reading time estimates for each chapter
  - Thematic icons and colors based on node types (Person, Location, Organization, Date, Concept, Document)
  
- **Corpus Photo Display:**
  - Floating thumbnail grid showing your captured images in the World view
  - Chapter-related artifacts shown inline with the narrative
  - Click-to-expand photo gallery with navigation between multiple views
  - Direct asset view integration from story context

- **Narrative Templates:**
  - Rich opening templates for story chapters
  - Connection-specific narratives (CREATED_BY, LOCATED_IN, MENTIONS, etc.)
  - Teaser text for story choices by node type
  - Mood-appropriate chapter transitions

### Changed
- **World Rotation Speed:** Dramatically slowed from ~10 seconds to ~5 minutes per revolution for contemplative exploration
- **Panel System:** Replaced single Knowledge Explorer with switchable Story Narrator / Knowledge Explorer modes
- **Panel Width:** Expandable panels (384px default, 480px expanded)
- **Navigation Hint:** Updated to "Click nodes to start your story"

### New Components
- `StoryNarrator.tsx`: Interactive narrative panel with typewriter effect, photo gallery, and branching choices
- `narrativeService.ts`: NarrativeEngine class for procedural story generation

### Technical
- CSS animations added for fadeIn, slideInRight, and pulse-glow effects

## [2.1.0] - 2026-01-06

### Added
- **Semantic Deduplication Service:** Intelligent detection and consolidation of duplicate/similar assets to prevent data dilution.
  - Jaccard similarity for entity and keyword overlap
  - Levenshtein distance for title/description comparison
  - GPS proximity matching
  - GIS zone correlation
  - Union-Find clustering algorithm for grouping duplicates
- **Consolidated Metadata:** When duplicates are detected, metadata is intelligently merged:
  - Best title preserved with view count (e.g., "Bronze Bust (3 views)")
  - Entities and keywords merged from all variants
  - Most common category selected
  - Descriptions combined with unique details preserved
- **Interactive Knowledge Explorer:** Complete redesign of the 3D World view:
  - Force-directed physics simulation for organic node clustering
  - Sidebar panel showing direct connections, discovery paths, and thematic clusters
  - Relationship type and direction indicators (→ outgoing, ← incoming)
  - Path exploration showing routes between high-relevance nodes
  - Random Discovery feature for serendipitous exploration
  - Exploration history with backtracking
- **Enhanced World Visualization:**
  - Animated particles flowing along highlighted connections
  - Glow effects on hovered/selected nodes
  - Slow world rotation animation
  - Connection highlighting on hover/select
  - Type filter pills to focus on specific entity types
  - Working zoom controls (previously non-functional)
  - Labels and links visibility toggles
  - Subtle grid background for spatial reference

### Changed
- **Bundle Service:** Now performs two-phase bundling:
  1. Semantic deduplication (similarity threshold 0.55)
  2. Traditional key-based bundling for unique assets
- **Asset Display:** Bundled duplicates show image count and consolidated view

### Fixed
- **React 19 Compatibility:** Updated @react-three/fiber to v9.0.0, @react-three/drei to v9.122.0, three to v0.172.0
- **Vercel Deployment:** Added .npmrc with legacy-peer-deps for Expo peer dependency conflicts

### New Services
- `deduplicationService.ts`: Similarity scoring, duplicate clustering, metadata consolidation

### New Components
- `KnowledgeExplorer.tsx`: Interactive sidebar for deep graph exploration

## [2.0.0] - 2025-01-15

### Added
- **Metaverse Foundation:** Complete infrastructure for 3D world navigation and avatar persistence.
- **Avatar Persistence System:** User avatars with customizable appearance, XP progression, and badge system.
- **Real-time Presence Tracking:** Multi-user presence with heartbeat monitoring and activity status (ACTIVE/IDLE/AWAY).
- **3D World Renderer:** Isometric canvas rendering with Three.js-ready architecture for WebGL upgrade path.
- **Sector Navigation:** World divided into semantic zones (archive, research, marketplace, community, personal, special).
- **Exploration Points:** XP rewards for discovering new nodes and contributing data.
- **Database Optimizations:** BRIN indexes for time-series data, GIN indexes for JSONB searches, partial indexes for processing queues.
- **Monitoring Views:** Production-ready observability with index_usage_stats, table_stats, and cache_hit_stats views.

### New SQL Schemas
- `sql/AVATAR_PERSISTENCE_SCHEMA.sql`: Avatar tables, presence tracking, world sectors, RLS policies
- `sql/DATABASE_OPTIMIZATION.sql`: Performance indexes, monitoring views, autovacuum tuning

### New Components
- `WorldRenderer.tsx`: 3D/isometric world visualization with real-time multi-user presence
- `src/components/metaverse/index.ts`: Metaverse component exports

### New Services
- `avatarService.ts`: Avatar initialization, position updates, presence management, exploration rewards

### New Hooks
- `useAvatar`: Avatar state, nearby users, sector tracking, position updates
- `useWorldSectors`: Fetch available world sectors
- `useContributionProgress`: Track contribution milestones

### Changed
- **App Navigation:** Added "3D World" tab with Globe icon (keyboard shortcut: `w`)
- **Mobile Menu:** World tab added to responsive navigation
- **Types:** Extended with UserAvatar, PresenceSession, WorldSector, and METAVERSE_CONFIG
- **Package Version:** Bumped to 2.0.0 with optional three.js dependencies

### Database Tables
- `user_avatars`: Avatar customization, XP, badges, contribution stats
- `presence_sessions`: Real-time position and activity tracking
- `realtime_events`: Event queue for world state changes
- `world_sectors`: Spatial partitioning with zone types and themes

## [1.9.4] - 2025-01-01

### Added
- **GARD Tokenomics System:** Complete integration of the SocialReturnSystem (GARD) framework for self-sustaining data economy.
- **Fractional Shard Ownership:** Each tokenized asset divided into 1,000 tradeable shards with full portfolio tracking.
- **10% Royalty Recycling:** Automatic distribution (50% Community, 30% Holders, 20% Maintenance) on all transactions.
- **DAO Governance Voting:** Weighted voting on community fund proposals based on shard holdings.
- **Social Returns Dashboard:** Real-time sustainability metrics, transaction history, and community fund tracking.
- **GARDDataShard Contract:** ERC1155 smart contract with EIP-2981 royalty standard for on-chain enforcement.
- **GARD Database Schema:** New tables (royalty_transactions, shard_holdings, community_fund, social_return_projects, governance_votes, gard_tokenized_assets, pending_rewards) and PostgreSQL functions.

### New Components
- `RoyaltyDashboard.tsx`: Stats grid, sustainability meter, transaction table
- `ShardPortfolio.tsx`: Holdings table, rewards claiming, unrealized gains
- `GovernanceVoting.tsx`: Proposal list, voting interface, progress visualization

### New Services
- `royaltyEngine.ts`: Core GARD calculations (royalty distribution, liquidity generation, sustainability)
- `communityFund.ts`: Fund management, proposal submission, voting
- `shardMarket.ts`: Portfolio tracking, shard trading, reward claiming

### New Hooks
- `useGARDRoyalties`: Fetch system stats and transaction history
- `useShardPortfolio`: Manage user holdings and rewards
- `useGovernanceVoting`: DAO voting interface

### Changed
- **App Navigation:** Added "Social Returns" tab with Sprout icon in sidebar
- **Database Types:** Extended with GARD table definitions and helper types
- **Types:** Added GARD interfaces and GARD_CONFIG constants

## [1.9.3] - 2025-12-31

### Added
- **Communities System:** Support for creating and joining communities with admission request management.
- **Community Filtering:** Global state integration to filter assets, graphs, and semantic views by community ID.
- **Messaging System:** Real-time chat interface for user-to-user communication.
- **Data Gifting:** Ability to send and claim digital assets and bundles within messages.
- **Processing Panel:** Persistent UI component for monitoring background processing tasks.

### Changed
- **App State:** Integrated `selectedCommunityId` into the global asset memoization.
- **UI:** Added "Communities" and "Messages" tabs to the main navigation.
## [1.9.0] - 2025-12-24

### Added
- **Curator Mode:** New dedicated view for manual asset curation and annotation editing.
- **Manual Bundling:** Support for user-defined bundles that override automatic clustering logic.
- **Annotation Editor:** Component for manual metadata refinement with `IS_USER_ANNOTATED` tracking.
- **Deterministic AI:** Fixed seed (42) for Gemini 2.5 Flash to ensure consistent extractions.
- **Retry Logic:** Manual "Retry" button for assets stuck in the processing state.
- **Schema Migration:** `sql/ADD_CURATOR_COLUMNS.sql` for manual curation support.

### Changed
- **AR UI:** Relocated processing buttons in `ARScene` to prevent shutter obstruction.
- **Master View:** Enabled "Contribute" (processing) functionality for the global corpus.
- **Bundle Service:** Refactored to respect `USER_BUNDLE_ID` and exclude manually bundled assets from auto-clustering.

## [1.8.1] - 2025-12-23

### Fixed
- **UUID Validation Error:** Switched from short random strings to standard UUID v4 for all asset and record identifiers. This resolves `22P02` errors in Supabase when columns are configured as `UUID` type.

## [1.8.0] - 2025-12-23

### Changed
- **Global Schema Standardization:** Migrated all database column names to UPPERCASE to resolve PostgREST case-sensitivity issues and ensure consistent query behavior.
- **TypeScript Refactor:** Updated `database.types.ts` and domain models to strictly use UPPERCASE keys, improving type safety and reducing runtime errors.
- **Supabase Service Optimization:** Refactored `supabaseService.ts` to use standardized UPPERCASE identifiers in all queries and data mappings.

### Fixed
- **Build Stability:** Resolved TypeScript errors in `App.tsx` related to missing `ID` and `CREATED_AT` fields in the initial asset creation logic.
- **Auth Integration:** Fixed lowercase column references in the account deletion and user asset retrieval flows.

## [1.7.1] - 2025-12-20

### Fixed
- **Gemini Engine Connectivity:** Resolved an issue where the Gemini API key was not correctly detected in browser environments by adding support for `VITE_GEMINI_API_KEY`.
- **SDK Integration:** Fixed a schema mismatch in the `@google/genai` SDK by correctly wrapping the request contents in an array.
- **Environment Configuration:** Updated `.env.example` and `README.md` with the correct environment variable naming for client-side exposure.

## [1.7.0] - 2025-12-19

### Added
- **Data Encryption:** Implemented client-side AES-GCM encryption for sensitive OCR text and document descriptions before cloud transmission.
- **Account Deletion:** Added a secure account deletion flow that removes all user-associated data from Supabase and the authentication system.
- **Web3 Transaction Logging:** Encrypted recording of on-chain minting events to the user's private cloud profile.
- **Automatic Cloud Sync:** Local assets are now automatically synchronized to the user's Supabase account upon login.

## [1.6.2] - 2025-12-19

### Added
- **Enhanced UI/UX:** Integrated `Toast` notifications for real-time feedback, `Skeleton` loading states for better perceived performance, and `ErrorBoundary` components with recovery options.
- **Onboarding Flow:** Added a 6-step interactive `Onboarding` guide to help new users navigate the GeoGraph ecosystem.
- **Keyboard Shortcuts:** Implemented a global `KeyboardShortcuts` listener (press `?` to toggle) for power-user navigation.

## [1.6.1] - 2025-12-19

### Added
- **Advanced PWA Features:** Implemented `file_handlers` for opening images/PDFs, `share_target` for receiving content from other apps, and `protocol_handlers` for `web+geograph://` deep links.
- **System Widgets:** Added Adaptive Card widgets (`status.json`) for Windows 11 and Android home screen integration.
- **Window Controls Overlay:** Enabled custom title bar area for a more native desktop application feel.
- **Asset Optimization:** Replaced SVG placeholders with high-quality PNG icons and screenshots in `public/` for better OS compatibility.

### Changed
- **Manifest Architecture:** Moved `manifest.json` and `sw.js` to `public/` root for correct scope resolution.
- **Cache Strategy:** Implemented aggressive cache busting (`v=3`) to ensure immediate propagation of PWA updates.

## [1.6.0] - 2025-01-07

### Added
- **Engine Upgrade:** Migrated to `gemini-2.5-flash` for blazing fast complex text reasoning and better entity extraction in messy scans.
- **Graph Visualizer Panning/Zooming:** Integrated `d3.zoom` into the `GraphVisualizer` component, enabling users to explore dense knowledge graphs via mouse/touch.
- **Structured DB Clusters:** Added a hierarchical "Cluster View" to the database tab, allowing grouping by Source, GIS Zone, Category, or Rights.
- **Cloud Refresh Logic:** Explicit "Refresh Cloud" button in Master View to force-pull latest dataframes from Supabase.
- **Relational Integrity:** Enhanced the Supabase fetching service to reconstruct D3-compatible nodes and links from flattened SQL records.

### Changed
- **Database Default View:** Set "Tabular View" as the default view for the database tab for better data density.
- **Metadata Labels:** Replaced the "Rights" column in the main database table with "Description" to prioritize semantic content visibility.
- **Collection Naming:** Integrated Gemini-suggested collection names to replace the generic "Batch Ingest" label.

### Fixed
- **Image Persistence:** Resolved a race condition where blob URLs were not being converted to permanent storage URLs fast enough for local persistence.
- **TypeScript Strictness:** Added missing types and `@ts-ignore` markers for `import.meta.env` access in non-Vite contexts.

## [1.5.1] - 2025-01-06

### Added
- **PWA Support:** Added `manifest.json` and meta tags to support installation as a standalone app on iOS, Android, and Desktop.
- **Mobile Optimizations:** Updated viewport settings to prevent accidental zooming on mobile inputs.

## [1.5.0] - 2025-01-05

### Added
- **Admin Broadcast Console:** Enabled administrators (and Master View users) to broadcast data to the network as "Public Airdrops".
- **Community Airdrops:** The Marketplace now features a dedicated section for "Community Airdrops (Free)", allowing all nodes to sync broadcasted data without cost.
- **CC0 Licensing Pipeline:** Ingestion pipeline updated to support explicit `CC0` (Public Domain) licensing triggers during broadcast events.

## [1.4.0] - 2024-12-28
- **Universal Data Ingestion:** Automatic background syncing to Supabase global corpus.
- **Anonymous Contributions:** Frictionless guest usage via session-based UUIDs.

## [1.0.0] - 2024-12-01
- Initial public release of the GeoGraph Node.
