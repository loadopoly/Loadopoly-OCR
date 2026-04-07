# 🚀 GeoGraph Node: v2.15.4 Release Notes

## ⚡ v2.15.4 — Eliminate Re-render Storm (2026-04-07)

### 🎯 Overview
v2.15.4 fixes a 10-second freeze when clicking the sidebar during dimension loading. The time-sliced Tier 1 computation now accumulates results in a plain variable and commits them in a single `setState()` call, reducing React re-renders from 18 to 1.

### Key Changes
- **Batched setState** — Tier 1 results accumulate in closure-local Map, commit once at end
- **3 total re-renders** — Down from 21 (Tier 0 + Tier 1 batch + Tier 2)
- **No interaction freeze** — Sidebar, tabs, and all UI interactions respond during dimension loading

---

# 🚀 GeoGraph Node: v2.15.3 Release Notes

## ⚡ v2.15.3 — Time-Sliced Dimensions & Lazy IntegrationsHub (2026-04-07)

### 🎯 Overview
v2.15.3 eliminates the remaining ~13-15 second main-thread freeze after the dashboard renders. Deferred dimension computation is now **time-sliced**: each dimension computes in its own macrotask, yielding to the browser between steps so the UI stays responsive throughout. The IntegrationsHub lazy chunk is no longer eagerly downloaded on every page load.

### Key Changes
- **Time-sliced Tier 1** — 18 dimensions processed one-at-a-time with `setTimeout(0)` yields between each
- **Abort on re-entry** — `sliceAbortRef` cancels in-progress dimension chains when assets change
- **Conditional IntegrationsHub** — `<IntegrationsHub>` only rendered when `showIntegrationsHub` is true; eliminates eager chunk download and "Loading integrations..." spinner
- **Zero main-thread blocking** — no single task exceeds ~50ms (one dimension extraction)

---

# 🚀 GeoGraph Node: v2.15.2 Release Notes

## ⚡ v2.15.2 — Dashboard Interactivity Fix (2026-04-07)

### 🎯 Overview
v2.15.2 eliminates the ~29-second unresponsive period after the dashboard renders. The FilterProvider now uses a 3-tier dimension computation strategy: only 3 trivial field lookups (category, era, license) run synchronously; all other dimensions — including regex-heavy media/place/narrative derivations (~10,449 regex ops) — are fully deferred via `requestIdleCallback`.

### Key Changes
- **3-tier dimension split** — Tier 0 (3 sync), Tier 1 (18 deferred), Tier 2 (3 expensive, chained)
- **Zero regex on critical path** — `deriveMediaType`, `derivePlaceType`, `deriveGeographicScale`, `deriveNarrativeRole` all moved to deferred Tier 1
- **Chained Tier 2** — expensive cross-asset comparisons run after Tier 1 completes (avoids contention)
- **Unified cleanup** — `cancelDeferred()` handles both tier1 and tier2 idle callbacks

---

# 🚀 GeoGraph Node: v2.15.1 Release Notes

## ⚡ v2.15.1 — Filter Engine Startup Performance (2026-04-07)

### 🎯 Overview
v2.15.1 reduces InlineFilterBar (selection bar) load time from ~20 seconds to <2 seconds on fresh app start. The FilterProvider now computes dimensions in two tiers: cheap field lookups render synchronously, while expensive cross-asset comparisons (serendipity scoring, connection density) are deferred to `requestIdleCallback`.

### Key Changes
- **Tiered dimension computation** — 21 cheap dimensions sync, 3 expensive dimensions deferred
- **O(n²) → O(n×m) serendipity scoring** — precomputed entity-frequency and category maps
- **Batch extraction** — shared lookup tables computed once for all Tier 2 dimensions
- **Shallow equality guard** — skips full recomputation when asset set unchanged
- **Static hoisting** — `DIMENSION_LABELS` and `buildDimensionMeta` moved to module scope
- **Precomputed dependency maps** — `DIMENSION_DEPS_ON`/`DIMENSION_AFFECTS` eliminate repeated `.filter()` calls
- **Deduplicated cleanup** — `cancelTier2()` helper replaces 3× duplicated cancel logic

---

# 🚀 GeoGraph Node: v2.14.0 Release Notes

## ⚡ v2.14.0 — Startup Performance Optimization (2026-04-07)

### 🎯 Overview
v2.14.0 dramatically reduces application startup time on mobile devices. Entry blocking JavaScript dropped from ~880 KB to ~76 KB gzip through React.lazy code-splitting, deferred heavy dependencies (Gemini AI, Web3, cluster sync), a branded HTML app shell, and Service Worker bundle caching. The app now shows a branded skeleton within ~1 second while lazily loading the rest.

### Key Changes
- **React.lazy + Suspense** entry point — React mounts immediately with a skeleton fallback
- **vendor-ai (253 KB)** completely removed from startup — loads on-demand for camera/OCR
- **ClusterSyncButton** lazy-loaded — chunk-cluster-sync (138 KB) no longer blocks startup
- **modulePreload disabled** — prevents Vite from eagerly downloading all chunks
- **HTML app shell** — branded skeleton visible instantly before any JS executes
- **Service Worker v3.5.0** — caches content-hashed JS/CSS bundles for instant repeat loads
- **Deferred polyfills** — Buffer/process polyfills load only when Web3 is accessed

---

# 🚀 GeoGraph Node: v2.12.0 Release Notes

## 🌐 v2.12.0 — Adventure Mode, Structured Data Population & PWA Hardening (2026-03-02)

### 🎯 Overview
v2.12.0 delivers three major capability expansions: an immersive **Adventure Mode** AR Walk that surfaces geo-tagged captures from your physical surroundings in the 3D World; comprehensive **structured JSONB field population** in both edge function paths (TOKEN_COUNT, STRUCTURED_CONTENT/TEMPORAL/SPATIAL/PROVENANCE/DISCOVERY); and a **PWA reliability overhaul** that eliminates the lock-screen reload loop and replaces forced-reload SW updates with user-controlled banners.

---

### 🧭 Adventure Mode — AR Walk (3D World)
- Click the **Compass** button in the 3D World toolbar to enter Adventure Mode
- Live GPS tracking via `watchPosition` with 5 s maximum cache age
- Proximity overlay lists up to 5 captures within 1 km, ordered by distance (haversine)
- Each capture card shows thumbnail, document title, and distance in metres
- Clicking a proximity card selects the matching node in the knowledge graph
- Geolocation watch is cleaned up on component unmount
- **Empty state**: 3D World now shows a helpful message when no graph nodes exist

---

### 🗃️ Structured Data Population
Both `api/process-ocr` and `supabase/functions/process-ocr` now populate:

| Field | Description |
|-------|-------------|
| `TOKEN_COUNT` | Approximate token count (~0.75 words/token) |
| `STRUCTURED_CONTENT` | Word/paragraph counts when OCR text present |
| `STRUCTURED_TEMPORAL` | Detected temporal entities (year, month patterns) |
| `STRUCTURED_SPATIAL` | Zone type + device lat/lng when GIS context available |
| `STRUCTURED_PROVENANCE` | Always-present capture provenance metadata |
| `STRUCTURED_DISCOVERY` | Entity + keyword + graph node/link counts |

---

### 🌍 GPS Capture at Ingest
- GPS coordinates are captured at the moment a file is queued (3 s timeout, non-blocking)
- Coordinates are forwarded to the edge function via the processing queue `location` field
- Enables `STRUCTURED_SPATIAL` population and Adventure Mode proximity matching

---

### 🔧 PWA & Service Worker Fixes
- **Removed `skipWaiting()` from SW install** — eliminates the lock-screen reload loop (`clients.claim()` → `controllerchange` → `location.reload()` cycle)
- **Non-blocking update banner** — dispatches `geograph-sw-updated` custom event → React renders a dismissible top bar with "Update Now" button
- **Offline status banner** — amber indicator with queued-capture count when `navigator.onLine === false`
- **Background sync** — `sync-contributions` tag registered when pending assets + connectivity restored; SW dispatches `geograph-sync-requested` → triggers `handleProcessAllPending`
- **SW cache version bumped** to `3.4.0`

---

### 🐛 Bug Fixes
- **Null-safe entities slice** — `ENTITIES_EXTRACTED ?? []` prevents crash when field is null in the drilldown table
- **Dead blob URL cleanup** — `loadAssets` clears stale `blob:` URLs with no backing `imageBlob` to prevent broken icon placeholders
- **Public URL persistence** — HTTPS URLs from cloud sync are saved to IndexedDB immediately, surviving future reloads
- **ErrorBoundary on database tab** — isolated crash recovery with "Reset View" button
- **Batch tab navigation fix** — `handleBatchFiles` no longer forces navigation; callers decide

### 🕸️ Knowledge Graph Enrichment
- `buildGlobalGraphData` merges `STRUCTURED_KNOWLEDGE_GRAPH` server-path nodes alongside client-side `graphData` nodes for richer multi-hop entity graphs

---

### 🧪 Validation Snapshot
- `npm run typecheck` ✅
- `npm run lint` ✅
- `npm run build` ✅ (3288 modules)

---

## ⚡ v2.11.4 — UX Reliability, Download Fallbacks, and QA Drill-Down (2026-02-25)

### 🎯 Overview
This patch focuses on production reliability and operator visibility: image-download failures are now resilient to missing edge URL handlers, Explore behavior aligns with expected user flow, and QA debug now surfaces actionable failed-job context.

### ✅ UX & Flow Improvements
- **Explore Defaults**: `3D World` is now the default Explore sub-tab, with keyboard shortcut alignment for consistent navigation.
- **Node/Edge Access from Structured DB**: The `NODES` column is now clickable and routes directly to the selected asset graph in `Explore → Knowledge Graph`.
- **QA Debug Failure Drill-Down**: Added a dedicated failed-jobs panel that surfaces queue failure stage/error and provides direct navigation to the affected asset context.

### 📥 Download Reliability
- **Alert Removal**: Replaced blocking `alert()` dialogs on image download failures with toast feedback.
- **Automatic Fallback Export**: On image-download failure, JSON export fallback now proceeds with non-blocking UX messaging.
- **Direct Storage Signed URL Fallback**: When edge-function signed URL generation fails, the app now attempts direct Supabase Storage signed URL resolution.

### 🖼️ Asset Card Robustness
- **Bundle Thumbnail Fallback**: Bundle card image tiles now gracefully handle broken image URLs with visual fallback rendering.

### 🧪 Validation Snapshot
- `npm run typecheck` ✅
- `npm run lint` ✅
- `npm run build` ✅

---

## ⚡ v2.11.3 — Edge Function Optimization & Type Safety (2026-02-24)

### 🎯 Overview
This patch modernizes all Supabase edge functions to the native `Deno.serve()` runtime API, improves TypeScript type safety in error-handling paths, cleans up the import map, and removes redundant ESLint suppression comments.

### 🚀 Edge & Performance Changes
- **Native `Deno.serve()` Migration**: `process-ocr`, `download-asset`, `kg-backfill`, and `spatial-coordinates` now use the first-class `Deno.serve()` entrypoint, removing the dependency on the deprecated `std@0.168.0/http/server.ts` module.
- **Pre-initialized Clients**: Supabase client and environment checks are hoisted outside of the request handler to speed up warm-path requests.

### 🔒 Type Safety
- `catch (error: unknown)` with `instanceof Error` guards replaces implicit `any` access in `download-asset` and `process-ocr`.
- Removes the last implicit runtime property access (`error.message`, `error.code`) on untyped caught values.

### 🧹 Housekeeping
- Removed `std/http/server.ts` from `supabase/functions/import_map.json`.
- Pruned three redundant `// eslint-disable-next-line` comments in `src/lib/`.

---

## 🔒 v2.11.2 — Deletion Lockdown & Governance Enforcement (2026-02-22)

### 🎯 Overview
This patch enforces strict deletion governance across the UI and database. Destructive actions are now constrained to local-only operations in Settings for normal users, while server-side deletes are restricted to service-role execution paths for approved requests.

### 🛡️ Security & Governance Changes
- **Settings-Only Local Clear**: The clear-data action now presents an explicit local-only warning and confirms that server records are not affected.
- **Queue Safety Controls**: Removed client-facing `Delete All` and `Reset Server` actions from the processing queue UI.
- **RLS Delete Lockdown**: Added a dedicated migration to harden DELETE policies so mass/server-side deletions are service-role only.
- **Spatial Anchor Protection**: Removed authenticated user DELETE policy for `spatial_anchors` and restricted deletion to service role.

### 📦 Technical Changes
- `src/components/QueueMonitor.tsx`: Removed server-destructive queue controls and related handlers.
- `src/components/SettingsPanel.tsx`: Improved confirmation messaging for local data deletion.
- `supabase/migrations/20260222000000_lockdown_delete_policies.sql`: New policy-hardening migration.
- `supabase/migrations/20260301000000_add_spatial_anchors.sql`: Removed user-level DELETE policy.

## 🔧 v2.11.1 — Cold-Start Elimination & Mobile Interactivity (2026-02-22)

### 🎯 Overview
This patch completes the performance mission by eliminating the 8-second "dead zone" on cold load. By parallelizing the boot sequence and lazily loading the massive Web3 stack, we've reduced the time-to-interactive (TTI) significantly. We've also resolved critical mobile sidebar visibility and touch-response issues.

### ⚡ Performance Improvements
- **Parallelized Boot Chain**: The application now downloads the main UI chunk while the backend module system initializes, instead of waiting for one to finish before starting the other.
- **Web3 Dependency Splitting**: `ethers.js` (a ~400KB parse-bomb) has been moved to a dynamic on-demand chunk. It no longer blocks the initial app load.
- **Phase-0 Instant UI**: The app now displays user data from IndexedDB immediately, reaching an interactive state even before external network connectivity is confirmed.
- **O(1) Deduplication**: Replaced an $O(n^2)$ render-time deduplication loop with a Map-based pair-caching system. This fixes the severe lag when scrolling large asset sidebars.
- **Deferred Workers**: Background OCR workers are no longer spawned on mount, saving CPU cycles for the critical rendering path.

### 📱 Mobile & UI Improvements
- **Sidebar Visibility**: Fixed a CSS containment bug where the `sidebar-mask` was becoming invisible due to `backdrop-blur` on parent elements. The sidebar now correctly portals to the document body.
- **Haptic UI Feedback**: Added active touch states (`scale-95`) to the navigation menu for better physical feedback on mobile devices.
- **Interactive Hamburger**: Fixed a bug where the hamburger menu button was non-responsive for the first 8 seconds of load.

### 📦 Technical Changes
- `src/index.tsx`: Implemented `Promise.all` boot strategy.
- `src/services/web3Service.ts`: Replaced static imports with `getEthers()` dynamic loader.
- `src/App.tsx`: Added `React.lazy` boundaries for performance-heavy modals and panels.
- `src/lib/workerPool.ts`: Optimized worker lifecycle for lower startup overhead.

# 🚀 GeoGraph Node: v2.11.0 Release Notes

## 🌟 v2.11.0 — Performance Refactor & Spatial Tracking (2026-02-22)

### 🎯 Overview
This major release focuses on two critical areas: drastically improving the application's cold-start performance and laying the foundation for advanced spatial tracking and knowledge graph backfilling.

### ⚡ Performance Improvements
- **Lazy Loading Architecture**: Converted 7 heavy components (including `SocialApp`, `IntegrationsHub`, `QueueMonitor`, `ClusterSyncStatsPanel`, `BatchProcessingPanel`, `SmartSuggestions`, and `batchProcessorService`) to lazy imports. This removes massive dependencies like `@google/genai` and `ethers.js` from the initial bundle parse, reducing the cold-start JS burden by over 1MB.
- **Dashboard Optimization**: The `QueueMonitor` component, which makes eager Supabase calls on mount, is now hidden behind an "Expand Queue" button on the Dashboard. This prevents unnecessary network requests during initial load.
- **Tab Consolidation**: Merged the "Knowledge Graph" and "3D World" tabs into a single "Explore" tab with sub-views. This prevents the `WorldRenderer` (Three.js) from eagerly claiming a WebGL context when switching tabs, saving GPU memory and preventing UI freezes.
- **AR Scanner Enhancements**: Added an `isCapturing` lock to prevent duplicate captures, implemented multi-shot staging with a floating "Commit" button, and gated the camera initialization behind a once-per-session Safety Warning to fix a 90-second freeze on low-end devices.

### 🗺️ Spatial Tracking & Knowledge Graph
- **New Database Schema**: Introduced `spatial_anchors`, `graph_nodes`, `graph_edges`, and `asset_graph_nodes` tables to support persistent entity tracking and spatial triangulation.
- **Spatial Coordinates Edge Function**: A new Supabase Edge Function (`spatial-coordinates`) that computes estimated subject GPS coordinates for recognized objects using device GPS, compass heading, device pitch, and haversine bearing raycasts.
- **Knowledge Graph Backfill**: A new idempotent Edge Function (`kg-backfill`) designed to run via `pg_cron`. It retroactively processes existing assets using Gemini Flash to extract named entities and populate the graph tables.

### 🐛 Bug Fixes
- Fixed a bug where the camera would close immediately after committing staged photos.
- Fixed an issue where capturing a photo would forcefully switch the active tab away from the AR Scanner.
- Created `sql/FIX_PROCESSING_UPLOADS_STORAGE_RLS.sql` to resolve Row-Level Security (RLS) violations when uploading to the `processing-uploads` bucket.
- Fixed a syntax error (`NULLS NOT DISTINCT`) in the `graph_nodes` unique constraint migration.

# 🚀 GeoGraph Node: v2.10.2 Release Notes

## 🔧 v2.10.2 — Database Function Search Path Fix (2026-02-11)

### 🎯 Overview
This patch fixes a systemic bug where ALL queue processing functions and triggers were broken due to a mismatch between `SET search_path = ''` (applied by the Supabase linter fix) and unqualified table references / unquoted column names in the function bodies. The Edge Function can now successfully claim, process, complete, and fail jobs.

### 🐛 Issues Fixed
- **"relation processing_queue does not exist"** — 5 queue functions used bare `processing_queue` with `search_path = ''`, making PostgreSQL unable to resolve the table. Fixed with `public.processing_queue`.
- **"record new has no field bundle_id"** — `update_bundle_asset_count` trigger used `NEW.BUNDLE_ID` (PostgreSQL folds to lowercase `bundle_id`) but actual column is `"BUNDLE_ID"` (uppercase). Fixed with `NEW."BUNDLE_ID"`.
- **Auto-trigger silently failing** — `invoke_processing_worker` caught the column casing error via `EXCEPTION WHEN OTHERS`, meaning the DB webhook to invoke the Edge Function never actually fired. Now works correctly.

### ⚙️ Functions Fixed (8 total)
1. `claim_processing_job` — `public.processing_queue` + quoted columns
2. `complete_processing_job` — same
3. `fail_processing_job` — same
4. `update_job_progress` — same (also changed return type VOID → BOOLEAN)
5. `release_stale_locks` — same
6. `update_bundle_asset_count` — `public.digital_asset_bundles` + `NEW."BUNDLE_ID"`
7. `invoke_processing_worker` — `public.processing_queue` + `NEW."STATUS"`
8. `update_partnership_timestamp` — `NEW."UPDATED_AT"`

### 📦 New Files
- `sql/FIX_FUNCTION_SEARCH_PATH_V2.sql` — complete function recreation script

### ✅ Verified
- Edge Function successfully claimed and processed a job end-to-end
- Auto-chaining processed multiple batches after initial trigger
- `processed: 1, succeeded: 1, failed: 0` confirmed via curl

---

## 🔧 v2.10.1 — Queue Processing & Upload Fix (2026-02-11)

### 🎯 Overview
This patch resolves three compounding issues that caused 121/150 asset uploads to fail, Edge Function processing to silently return 0 jobs, and queue counts to be inflated by duplicate rows.

### 🐛 Issues Fixed
- **"The resource already exists" (121 failures)**: `uploadToStorage()` used `upsert: false`, causing re-queued assets to fail on storage upload. Switched to `upsert: true` with a 409 fallback.
- **"Processed 0 jobs" (Edge Function)**: The claim loop merged RPC errors with empty-queue into a single `break`, silently hiding the real error. Now logs errors distinctly and returns `claimError` to the client.
- **157 vs 150 count mismatch**: Duplicate PENDING rows were created when `requeueLocalAssets()` succeeded server-side but failed to update IndexedDB locally, causing the asset to retry and insert again. Fixed with optimistic local writes and cancel-before-insert logic.

### ⚙️ Technical Changes
- `processingQueueService.uploadToStorage()` — `upsert: true`, 409 graceful fallback
- `processingQueueService.insertJob()` — cancels existing active jobs before inserting
- `processingQueueService.requeueLocalAssets()` — writes IndexedDB before server calls
- `processingQueueService.getStats()` — deduplicates by ASSET_ID per status
- `processingQueueService.invokeEdgeFunction()` — returns `claimError` field
- `supabase/functions/process-ocr/index.ts` — split error/empty-data handling, log+propagate claim errors
- `api/process-ocr/index.ts` — same claim loop fix (mirror copy)
- `QueueMonitor.tsx` — actionable error alerts, stale-lock release dialog, grouped error display

### 📦 New Files
- `sql/FIX_QUEUE_DUPLICATES.sql` — run in Supabase SQL Editor to clean existing duplicates, add partial unique index, reduce lock timeout, release stale locks

### 🚀 Deployment Checklist
1. Push to main (Vercel auto-deploys frontend)
2. Run `sql/FIX_QUEUE_DUPLICATES.sql` in Supabase SQL Editor
3. Run `supabase functions deploy process-ocr`
4. Test upload + processing on mobile

---

# 🚀 GeoGraph Node: v2.10.0 Release Notes

## 🧬 v2.10.0 - Fork Management & Download Services (2026-02-11)

### 🎯 Overview
This release focuses on enterprise-readiness with robust fork management tools, a production-grade download service for processed data, and significant enhancements to the background processing queue.

### ✨ New Features
- **Schema Recovery & Verification**: Added `sql/FIX_SCHEMA_AND_TRIGGERS.sql` which provides an idempotent mechanism to verify column naming conventions, repair missing avatar records, and validate RLS policies.
- **Fork Management System**: Automated workflows and scripts for synchronizing user forks with upstream, including remote reset capabilities.
- **Advanced Download Service**: Binary export support with progress tracking and ZIP bundling for exported datasets.
- **Queue Performance Metrics**: New health monitoring for background tasks with automated remote reset functionality.

---

# 🚀 GeoGraph Node: v2.9.11 Release Notes

### 🎯 Overview
This release introduces a critical dual-write architectural layer to guarantee data persistence in the Loadopoly master corpus while supporting user-controlled database repositories. It also marks a significant milestone in repository organization and code modularity.

### ✨ New Features
- **Dual-Write Database Strategy**: Automatic replication of all OCR results, image uploads, and Web3 transactions to the canonical Loadopoly master database, regardless of user-provided Supabase credentials.
- **Fail-Over Protection**: Implementation of a persistent retry mechanism (3x with backoff) for master database writes to prevent data loss due to transient network issues.

### 🧹 Project Refactoring
- **Consolidated Types**: Unified `src/types.ts` and `src/types/index.ts` for better developer experience and type safety.
- **Clean Docs Hierarchy**: Moved sprawl from the root directory into a structured `docs/` hierarchy (Technical, Legal, Investment, Product).
- **Service Decoupling**: Extracted database replication logic into a dedicated `dualWriteService.ts`.

---

# 🚀 GeoGraph Node: v2.9.10 Release Notes

### 🎯 Overview
This hotfix release resolves critical regressions in the AR Scanner that caused black screens, 50-second timeouts, and video rendering failures introduced in v2.9.8/v2.9.9.

### 🐛 Issues Fixed
- **Black Screen on Camera**: The `<video>` element was not rendering frames despite the camera being active (LED on). Fixed by using absolute positioning with inline styles and adding robust stream re-attachment logic.
- **50-Second Timeout**: The multi-tier 4K/8K resolution negotiation caused hardware driver hangs on devices that couldn't meet the constraints. Reverted to simple, instant camera acquisition.
- **10-Second UI Lag**: Sidebar and tab switching were frozen due to expensive un-memoized calculations running on every render. Fixed with `useMemo` optimizations.

### ⚙️ Technical Changes
- Reverted `getUserMedia` constraints to v2.1-style simplicity: `{ video: { facingMode: 'environment' } }`
- Added `videoReady` state with loading indicator
- Multiple play triggers (`onloadedmetadata`, `oncanplay`, `onLoadedData`) with retry logic
- Stream re-attachment `useEffect` for cases where video ref isn't ready when stream arrives
- Memoized `aggregatedGroups`, `drillDownAssets`, `paginatedAssets` in App.tsx

### 📦 New Files
- `public/camera-test.html` - Standalone camera diagnostic tool

---

# 🚀 GeoGraph Node: v2.9.9 Release Notes

## 🧬 v2.9.9 - Universal Compatibility & Lite Mode (2026-02-04)

### 🎯 Overview
Following the "Pro" hardware optimizations, this release ensures that GeoGraph Node remains accessible and performant on older or less capable devices. It introduces "Lite Mode" auto-detection and multi-tier camera fallbacks.

### ⚙️ Key Improvements
- **Adaptive Camera Pipeline**: Gracefully falls back from 4K/8K to 1080p and basic streams if hardware constraints aren't met.
- **Lite Mode UI**: Throttles complex AR animations and scanning overlays on devices with <4GB RAM or weak CPUs.
- **Power Efficiency**: Reduced background processing for "Standard" devices to prevent overheating during long scanning sessions.

---

# 🚀 GeoGraph Node: v2.9.8 Release Notes

## 🧬 v2.9.8 - Hardware Optimization & AR Pro (2026-02-04)

### 🎯 Overview
Optimized the platform for high-end mobile hardware, specifically the Google Pixel 10 Pro. This release enables full sensor utilization for the AR Scanner, 4K/8K video streaming, and advanced hardware-level camera controls.

### ⚙️ Key Improvements
- **Ultra-HD Scanning**: Requests 4K/8K resolution constraints by default on supported devices.
- **ImageCapture API**: Real-time high-resolution still capture bypassing standard canvas limitations.
- **Advanced Controls**: Integrated continuous hardware focus, white balance, and torch support.
- **Fluid UI**: Improved viewport scaling and "Pro Mode" indicators for high-res sessions.

---

# 🚀 GeoGraph Node: v2.9.7 Release Notes

## 🧬 v2.9.7 - Schema Consolidation & Documentation (2026-02-04)

### 🎯 Overview
A massive maintenance release focusing on database stability and developer experience. Consolidated dozens of fragmented SQL scripts into a single, unified, and documented source of truth.

### ⚙️ Key Improvements
- **Consolidated Schema**: Unified 27 legacy SQL files into `sql/CONSOLIDATED_SCHEMA.sql`.
- **Architectural Docs**: Added comprehensive Data Dictionary, Lineage, and Semantic Models.
- **Convention Audit**: Applied universal UPPERCASE column naming across the entire database.

---

# 🚀 GeoGraph Node: v2.8.1 Release Notes

## 🧬 v2.8.1 - Optimized Realtime Feedback Loop (2026-01-14)

### 🎯 Overview
This release resolves a critical bottleneck in the OCR processing pipeline by implementing a direct, server-to-client Realtime feedback loop. It eliminates redundant API calls and ensures the UI reflects processing results instantly as they are written to the database.

### 💡 The Philosophy
> *"The user's time is the most valuable asset. Every millisecond between data being ready and data being visible is a failure of architecture."*

### 🛠️ Key Architectural Pillars

*   **Direct Asset Observation**: Shifted from monitoring metadata (queue status) to monitoring primary data (asset table). This bypasses the multi-step polling/fetching routine used in previous versions.
*   **User-Scoped Subscriptions**: Implemented Realtime filters on the backend to ensure clients only receive updates for their own assets, maintaining privacy and reducing network overhead.
*   **Decentralized Asset Hydration**: The Edge Function now handles the heavy lifting of global corpus synchronization, allowing the client to simply receive the final resulting object.

### ⚙️ Improvements
- **Realtime**: Replaced `processing_queue` subscription with direct `historical_documents_global` monitoring.
- **Backend**: Updated `claim_processing_job` to include `user_id` in its return payload for edge worker attribution.
- **Client**: Streamlined `App.tsx` and `processingQueueService` to handle asset arrival as a single event.

---

# 🚀 GeoGraph Node: v2.8.0 Release Notes

## 🧬 v2.8.0 - High-Concurrency PWA Suite (2026-01-14)

### 🎯 Overview
A major architectural overhaul of the data processing pipeline, introducing server-side background queues, fault-tolerant API consumption, and client-side performance optimizations.

### 💡 The Philosophy
> *"Scalability is not just about doing things faster, but about doing them correctly, resiliently, and without blocking the user's path."*

This release transforms the GeoGraph processing engine from a sequential, blocking model to a high-concurrency, asynchronous infrastructure.

### 🛠️ Key Architectural Pillars

*   **Asynchronous Processing Queue**: Offloads OCR and NLP analysis to a server-side Supabase/Edge Function worker pool. This enables large batch uploads without UI freezing.
*   **Circuit Breaker Logic**: Protects against cascading failures in external LLM providers (Gemini). The system automatically detects outages and falls back to queued retries.
*   **Intelligent Image Compression**: Reduces upload latency and storage costs by pre-compressing images on the client using the Canvas API before transmission.
*   **Web Worker Parallelism**: Dedicated Worker Pool for similarity matching and text analysis, keeping the main UI thread at a smooth 60fps.
*   **Real-time Monitoring**: A new Queue Monitor interface providing live feedback on the status of server infrastructure and job progress.

---

# 🧬 v2.5.7 - Cluster Synchronizer Curator Tool (2026-01-11)

### 🎯 Overview
A powerful LLM-powered curator tool for **synchronizing dimension values** across thematic clusters, enabling corpus improvement through **structured classification** and **similarity-based proxy learning**.

### 💡 The Philosophy
> *"Structured data enables corpus improvement by proxy—as we classify new documents, the accumulated knowledge refines future classifications through learned correlations."*

This release introduces a feedback loop where:
1. **LLM classifies** individual documents into structured dimension values
2. **Mappings are learned** between raw/derived values and structured classifications
3. **Similarity matching** enables proxy classification for new data
4. **Corpus improves** through accumulated datum correlations

---

### 🗄️ 6 Structured Cluster Columns

New JSONB columns for storing synchronized, LLM-classified dimension values:

| Column | Dimensions | Purpose |
|--------|------------|---------|
| `STRUCTURED_TEMPORAL` | Era, Historical Period, Document Age | Normalized time classification |
| `STRUCTURED_SPATIAL` | Zone, Geographic Scale, Place Type | Geographic harmonization |
| `STRUCTURED_CONTENT` | Category, Scan Type, Media Type, Subject Matter | Content standardization |
| `STRUCTURED_KNOWLEDGE_GRAPH` | Node Type, Connection Density, Narrative Role | Graph structure classification |
| `STRUCTURED_PROVENANCE` | License, Verification Level, Contested | Trust normalization |
| `STRUCTURED_DISCOVERY` | Source, Entity Types, Serendipity, Research Potential | Discovery scoring |

### 📋 Classification Metadata

Each classified asset tracks:

| Field | Description |
|-------|-------------|
| `CLASSIFICATION_LLM` | Which LLM performed classification (Gemini, GPT-4o, Claude, Ollama) |
| `CLASSIFICATION_DATE` | When classification occurred |
| `CLASSIFICATION_VERSION` | Schema version (v1.0.0) |
| `CLASSIFICATION_CONFIDENCE` | Overall confidence score |

---

### 🔧 ClusterSynchronizer Component

Interactive curator tool for structured classification:

**Features:**
- 🧠 **Per-cluster LLM classification** with tailored prompts
- 📦 **Bulk sync** for corpus-wide batch processing
- ⏸️ **Progress controls** (pause, resume, skip)
- 📊 **Classification status** per asset
- 📤 **Export** results as JSON
- 🔗 **Learned mappings** panel for proxy classification insights

**Workflow:**
```
Select Asset → Expand Cluster → Classify with LLM → Review → Save
                    ↓
              Learn Mapping → Apply to Similar Documents
```

---

### 🔄 Similarity-Based Proxy Classification

New tables for corpus improvement through accumulated correlations:

| Table | Purpose |
|-------|---------|
| `structured_classification_mappings` | Raw value → Structured value correlations |
| `classification_audit_log` | Provenance tracking for all classifications |
| `cluster_dimension_statistics` | Corpus-wide dimension distributions |

**Helper Functions:**
- `find_structured_mapping(cluster, dimension, raw_value)` → Similar structured values
- `get_dimension_distribution(cluster, dimension)` → Value frequency analysis
- `upsert_classification_mapping(...)` → Learn new correlations

---

### 🔍 Classification Status Filter

New filter dimension to separate structured from unstructured data:

| Status | Description |
|--------|-------------|
| `structured` | All 6 clusters classified |
| `partial` | Some clusters classified |
| `unstructured` | No structured classification |

**Quick Filter Presets:**
- **Structured Only** - Fully classified corpus
- **Unstructured Only** - Assets needing classification
- **Partially Classified** - In-progress classification

---

### 📊 Database Schema

New SQL file: `sql/STRUCTURED_CLUSTER_SCHEMA.sql`

```sql
-- 10 new columns on historical_documents_global
ALTER TABLE historical_documents_global
ADD COLUMN STRUCTURED_TEMPORAL JSONB,
ADD COLUMN STRUCTURED_SPATIAL JSONB,
ADD COLUMN STRUCTURED_CONTENT JSONB,
ADD COLUMN STRUCTURED_KNOWLEDGE_GRAPH JSONB,
ADD COLUMN STRUCTURED_PROVENANCE JSONB,
ADD COLUMN STRUCTURED_DISCOVERY JSONB,
ADD COLUMN CLASSIFICATION_LLM TEXT,
ADD COLUMN CLASSIFICATION_DATE TIMESTAMPTZ,
ADD COLUMN CLASSIFICATION_VERSION TEXT,
ADD COLUMN CLASSIFICATION_CONFIDENCE NUMERIC(4,3);
```

**Indexes:** GIN indexes on all JSONB columns for fast querying.
**RLS:** Public read, authenticated write policies.

---

### 📝 Technical Notes
- New TypeScript types: `StructuredTemporalCluster`, `StructuredSpatialCluster`, etc.
- `getClassificationStatus()` utility function
- 25th filter dimension: `classificationStatus`
- 3 new quick filter presets for classification workflow

---

## 📜 v2.5.6 - Historian-Informed Discovery Filters (2026-01-11)

### 🎯 Overview
A comprehensive expansion of the filter system designed by Digital Transformation Public Historians to enable **serendipitous discovery** and **creative associations** while maintaining scholarly rigor and data integrity.

### 🔬 The Philosophy
> *"The best archival discoveries come not from knowing exactly what you're looking for, but from following unexpected connections across time and space."*

This release transforms the filtering system from a technical constraint tool into a **discovery engine** that respects the qualitative nature of historical research while providing guardrails for data quality.

### ✨ 24 Filter Dimensions (Organized by Theme)

| Category | Dimensions | Purpose |
|----------|------------|---------|
| **Temporal** | Era, Historical Period, Document Age | Navigate time with historian-familiar period names |
| **Spatial** | GIS Zone, Geographic Scale, Place Type | Explore from local to international scope |
| **Content** | Category, Scan Type, Media Type, Subject Matter | Classify by format and focus |
| **Knowledge Graph** | Node Type, Connection Density, Narrative Role | Understand story structures |
| **Provenance** | License, Confidence, Verification Level, Contested | Trust and attribution |
| **Discovery** | Source, Status, Entities, Relevance, Serendipity, Research Potential | Find the unexpected |

### 🏛️ Historical Period Mapping

Automatic derivation of culturally meaningful period names from decade-based eras:

| Era | Derived Periods |
|-----|-----------------|
| 1890s-1900s | Victorian Era, Gilded Age, Edwardian Period |
| 1920s-1930s | Roaring Twenties, Jazz Age, Art Deco, Great Depression, Swing Era |
| 1940s-1950s | WWII Home Front, Atomic Age, Mid-Century Modern |
| 1960s-1970s | Space Age, Counterculture, Civil Rights Era, Disco Era |
| 1980s-2000s | Digital Dawn, Information Age, Social Media Era |

### 🎲 Discovery-First Presets

New quick filter presets designed for **exploration** rather than just retrieval:

| Preset | Description |
|--------|-------------|
| **Serendipity High** | Documents with rare entities and unexpected cross-connections |
| **Research Goldmine** | High entity density + strong graph connectivity |
| **Hidden Connections** | Hub nodes that bridge disparate collections |
| **Lonely Artifacts** | Isolated items awaiting their story connections |
| **People Stories** | Person-focused documents for biographical research |
| **Place Histories** | Location-centered content for geographic study |
| **Ephemera Treasures** | Tickets, menus, ads, receipts—the everyday past |
| **Narrative Anchors** | Key focal points that center historical narratives |
| **Context Builders** | Supporting evidence that enriches understanding |

### 🧮 Smart Scoring Functions

| Function | Calculation Basis |
|----------|-------------------|
| **Serendipity Score** | Rare entity frequency × contested status × cross-category connections |
| **Research Potential** | Entity richness + graph connectivity + confidence + description depth |
| **Connection Density** | Graph edge count → Isolated / Linked / Hub classification |
| **Narrative Role** | Person count → Setting vs Evidence vs Protagonist |

### 🔗 Enhanced Dependency Graph

25+ filter relationships that cascade intelligently:

```
Era ─────────► Historical Period ─► Document Age
              │
Subject Matter ──────────────────► Narrative Role
              │
Connection Density ──────────────► Research Potential
              │
Verification Level ──────────────► Confidence
```

### 📝 Technical Notes
- `FilterContext.tsx` expanded from 12 to 24 dimensions
- `applyFilterToAsset()` now receives full asset corpus for context-aware scoring
- `FilterDependencyVisualizer` reorganized with thematic node clusters
- All new dimensions have rich metadata labels and descriptions

---

## 🔎 v2.5.5 - Precision Camera Zoom & Device Settings (2026-01-11)

### 🎯 Overview
Introduces native camera zoom support for mobile and desktop devices, allowing curators to capture high-precision data from a distance or focus on small artifact details.

### ✨ New Features
- **Native Zoom Controls**: Integrated zoom slider in both AR Scanner and Instant Capture modes.
- **Device Capability Detection**: Automatically detects and exposes hardware zoom ranges (min, max, step) supported by the device camera.
- **Configurable Persistence**: New "Camera & Scanning" section in Settings to enable/disable advanced zoom functions.
- **AR Precision**: Improved target acquisition in AR mode by allowing magnification of distant nodes.

### 📝 Technical Specifications
- Utilizes `MediaTrackCapabilities.zoom` and `ImageCapture` API (where supported).
- Advanced track constraints applied via `applyConstraints({ advanced: [{ zoom: X }] })`.
- Global settings persistence in `localStorage` for `loadopoly-zoom-enabled`.

---

## 🔀 v2.5.4 - Semantic View Integration (2026-01-11)

This patch consolidates the Semantic Canvas as a **dependent sub-view** within 3D World, streamlining navigation.

### 🎯 Changes

| Before | After |
|--------|-------|
| Semantic View as standalone sidebar item | Integrated as toggle within 3D World |
| 5 primary visualization views | 4 primary views (cleaner sidebar) |
| Separate navigation context | Unified world exploration context |

### 🔄 3D World View Modes

The 3D World now supports two visualization modes:

| Mode | Icon | Description |
|------|------|-------------|
| **3D View** | 🌐 | Immersive WebGL metaverse navigation |
| **Semantic** | ⚡ | 2D semantic canvas for NLP clustering |

Toggle between modes using the header buttons in 3D World.

### 📝 Technical Notes

- Removed `semantic` from `ViewMode` type in FilterContext
- Added `worldViewMode` state (`'3d' | 'semantic'`) to App.tsx
- SemanticCanvas component now renders conditionally within WorldRenderer container

---

## 🎛️ v2.5.3 - Dynamic Filter Dependency System (2026-01-12)

This release introduces a sophisticated **cross-view dynamic filtering system** with dependency-aware propagation across Knowledge Graph, 3D World, Structure DB, and Curator Mode.

### 🎯 Unified Filter Architecture

**Social Hub** - A consolidated social ecosystem for content curators, integrating communities, messaging, and GARD returns into a single ergonomic workspace.
- **Curated Social Dashboard:** Unified view of social impact, rewards, and communication.
- **Ergonomic Sub-navigation:** Quick access to Communities, Messaging, and Returns via a consolidated hub.
- **Active Status Integration:** Real-time indicators for pending requests and unread messages within the hub.

**FilterContext** - Centralized state management with dependency engine:

| Component | Purpose |
|-----------|---------|
| `FilterProvider` | Root context provider with asset/graph data |
| `useFilterContext` | Access all filter state and actions |
| `useFilteredAssets` | Get filtered asset results |
| `useFilteredGraphData` | Get filtered graph nodes/edges |
| `useFilterAnalytics` | Access filter impact analytics |

### 📊 12 Filter Dimensions

---

## 🤖 v2.5.4 - Dynamic LLM Orchestration & Credential Vault

Expanding the AI core to support a broader range of vision-language models with enterprise-grade credential management.

### 🧠 Multi-Provider AI Selection

Users can now swap their extraction engine on-the-fly without restarting the node:
- **Google Gemini 1.5/2.5** - Optimized for high-speed OCR/NLP
- **GPT-4o** - Industry standard for complex entity extraction
- **Claude 3.5 Sonnet** - Superior nuance for historical document analysis
- **Local (Ollama)** - Private, air-gapped processing via local inference

### 🔐 Options & Credentials
Integrated a new "LLM Options" vault within the Settings panel:
- **Unique Store**: Each model maintains its own API Key, Username, and Login credentials.
- **Auto-Sync**: Switching the model in the UI automatically swaps the active API context.
- **Visibility**: The active model and its connection health are now continuously monitored in the sidebar Geo Location display.

| Dimension | Type | Description |
|-----------|------|-------------|
| `confidence` | range | OCR/AI confidence thresholds |
| `dateRange` | range | Temporal filtering (min/max dates) |
| `assetTypes` | multi | IMAGE, VIDEO, AUDIO, TEXT, 3D |
| `licenseTypes` | multi | PUBLIC_DOMAIN, CC_BY, etc. |
| `tags` | multi | Free-form tag selection |
| `sources` | multi | Data source filtering |
| `processingStatus` | multi | PENDING, PROCESSING, MINTED |
| `graphConnectivity` | range | Node connection thresholds |
| `spatialBounds` | range | Geographic bounding box |
| `semanticClusters` | multi | NLP-derived clusters |
| `verificationStatus` | multi | VERIFIED, PENDING, FLAGGED |
| `curatorStatus` | multi | APPROVED, REJECTED, REVIEW |

### 🔗 Dependency Graph

```
confidence ──────────► graphConnectivity
     │                       │
     ▼                       ▼
assetTypes ◄──────── semanticClusters
     │                       │
     ▼                       ▼
licenseTypes         curatorStatus
     │                       │
     └───────► sources ◄─────┘
               │
               ▼
          dateRange ──────► spatialBounds
                                │
                                ▼
                      processingStatus
                                │
                                ▼
                      verificationStatus
```

### 🎨 UI Components

- **UnifiedFilterPanel** - Sliding panel with all filter controls
- **InlineFilterBar** - Compact toolbar for quick access
- **FilterBadge** - Active filter count indicator
- **FilterDependencyVisualizer** - SVG dependency graph
- **FilterInsightsPanel** - Analytics and suggestions

### ⚡ Quick Filter Presets

| Preset | Description |
|--------|-------------|
| `public_domain` | Only public domain licensed items |
| `high_confidence` | OCR confidence ≥ 80% |
| `recent_era` | Items from last 50 years |
| `historic_era` | Items over 100 years old |
| `documents_only` | Text/document assets |
| `items_only` | Physical item assets |
| `needs_review` | Pending verification |
| `graph_ready` | High connectivity items |

### 🔄 Cross-View Synchronization

Filters now propagate intelligently across views:
- **Knowledge Graph**: Highlights filtered nodes/edges
- **3D World**: Shows/hides objects based on filters
- **Structure DB**: Applies SQL-like filtering
- **Curator Mode**: Focuses review queue

---

## 🔧 v2.5.2 - Sidebar Responsiveness Fix (2026-01-11)

This patch resolves the navigation issue where the sidebar was not scrollable on smaller screens or when many view items were present.

### 📱 Layout and Navigation
- **Sidebar Scrolling**: Added `overflow-y-auto` to the desktop and mobile navigation sidebars.
- **Custom Scrollbar**: Implemented a unified `.custom-scrollbar` utility for a better visual experience when scrolling sidebar navigation.
- **Mobile Experience**: Fixed overflow-y in the mobile menu overlay to ensure all tabs (Marketplace, Gardening, Settings) are reachable.

---

## 🔧 v2.5.1 - Stability & Caching Fixes (2026-01-11)

This hotfix release addresses critical issues with service worker caching that caused blank pages and MIME type errors in production.

### 🛠️ Service Worker v2.0.0

Complete rewrite of the PWA service worker to prevent caching issues:

| Issue Fixed | Solution |
|-------------|----------|
| Blank pages after deploy | JS/CSS bundles are NEVER cached |
| MIME type errors | Content-type validation + Vercel headers |
| Stale cache poisoning | Auto-cleanup on activation |
| Module load failures | Skip cache for `/assets/*` entirely |

### 🔄 Processing State Consistency

Fixed state synchronization across all views:
- Dashboard, Batch tab, and Processing Queue now show consistent status
- Assets properly transition: `PENDING` → `PROCESSING` → `MINTED`
- Individual "Resume" buttons in the Processing Queue panel
- Real-time progress bar updates during AI processing

### ⚡ Build Improvements

```
dist/
├── vendor-react-[hash].js   # React core (cached long-term)
├── vendor-ui-[hash].js      # UI components (cached long-term)
├── vendor-data-[hash].js    # Data layer (cached long-term)
├── index-[hash].js          # App entry
└── App-[hash].js            # Main app bundle
```

### 🆘 Recovery UX

New error handling for cache-related failures:
- Loading spinner shown immediately (no blank screen)
- "Clear Cache & Reload" button in error UI
- Auto-prompt when new version is available
- Build timestamp in console for debugging

---

# 🚀 GeoGraph Node: v2.5.0 Release Notes

This release delivers a **comprehensive UX/UI overhaul** focusing on accessibility, user experience, progressive disclosure, and design polish.

## 🎨 Theme System

### Dark/Light Mode
New `useTheme` hook provides seamless theme switching:

```tsx
import { useTheme } from './hooks/useTheme';

const { theme, resolvedTheme, setTheme, toggleTheme } = useTheme();
```

| Feature | Description |
|---------|-------------|
| **System Detection** | Auto-detects OS preference (`prefers-color-scheme`) |
| **Manual Toggle** | User can override with light/dark/system |
| **Persistent Storage** | Preference saved to localStorage |
| **CSS Variables** | Theme tokens applied via custom properties |

### High Contrast Mode
- Toggle for users with visual impairments
- Meets WCAG AA contrast requirements (4.5:1 for text)
- Enhanced border visibility

### Reduced Motion
- Respects `prefers-reduced-motion` media query
- Animations disabled or minimized for accessibility

## 🔍 Global Semantic Search

New `GlobalSearch` component provides NLP-powered search across your corpus:

### Keyboard Shortcuts
- `Cmd+K` (Mac) / `Ctrl+K` (Windows) to open
- `↑↓` Arrow keys to navigate results
- `Enter` to select
- `Esc` to close

### Filter Categories
| Filter | Icon | Description |
|--------|------|-------------|
| All | 🔍 | Search everything |
| Locations | 📍 | GIS zones, coordinates |
| People & Orgs | 👤 | Entities extracted from OCR |
| Documents | 📄 | Titles, collections |
| Dates | 📅 | Historical dates |
| Keywords | 🏷️ | Tags, concepts |

### Fuzzy Matching
- Typo-tolerant search ("Antoneo" matches "Antonio")
- Word-order independent ("1950 Opening" matches "Opening 1950")
- Relevance scoring with percentage display

## 📖 Enhanced Onboarding Wizard

New multi-step onboarding flow replaces the simple intro:

### Steps
1. **Welcome** - Introduction to GeoGraph features
2. **Account** (Optional) - Sign up/login with email or skip
3. **API Keys** (Optional) - Configure Gemini API with secure input
4. **Demo Tour** - Interactive feature highlights
5. **Customize** - Set experience level and preferences

### Progressive Disclosure
| Level | Features Shown |
|-------|----------------|
| Beginner | Core upload, OCR, basic graph |
| Intermediate | + GIS, communities, sync |
| Advanced | + Web3, NFT minting, advanced GIS |

### User Preferences Hook
```tsx
import { useUserPreferences } from './components/EnhancedOnboarding';

const { preferences, updatePreferences } = useUserPreferences();
// preferences.level, preferences.showWeb3Features, etc.
```

## 🗺️ 2D Map Fallback

New `MapView2D` component for devices that struggle with WebGL:

### Features
- **Canvas Rendering:** Lightweight 2D alternative to Three.js
- **Touch Gestures:** Pinch-to-zoom, pan with finger/mouse
- **Haptic Feedback:** Vibration on node selection (mobile)
- **Type Filtering:** Show/hide node types (Person, Location, etc.)
- **View Modes:** Map (default), Grid, List

### Integration
```tsx
import { MapView2D } from './components/metaverse';

<MapView2D
  graphData={graphData}
  assets={assets}
  onNodeSelect={handleNodeSelect}
/>
```

## 📊 Analytics & Tracking

New analytics system for understanding user behavior:

### Event Types
- `upload_started`, `upload_completed`, `upload_failed`
- `ocr_processed`
- `nft_flow_started`, `nft_minted`, `nft_flow_abandoned`
- `onboarding_step`, `onboarding_completed`, `onboarding_skipped`
- `error_occurred`

### Funnel Analysis
```tsx
import { useFunnelAnalytics } from './hooks/useAnalytics';

const funnel = useFunnelAnalytics('nft-minting', [
  'select-assets',
  'connect-wallet',
  'confirm-mint',
  'complete'
]);

funnel.enterFunnel();
funnel.advanceStep(1);
funnel.abandonFunnel('wallet-rejected');
```

### In-App Surveys
```tsx
import { useSurveyAnalytics } from './hooks/useAnalytics';

const { openSurvey, completeSurvey, submitFeedback } = useSurveyAnalytics();
```

## ⚠️ Enhanced Error States

New `ErrorState` component with contextual error handling:

### Error Types
| Type | Use Case | Actions |
|------|----------|--------|
| `ocr_failed` | Text extraction failed | Retry, Edit Manually |
| `upload_failed` | File upload error | Try Again, Choose Different |
| `network_error` | Offline/connection lost | Retry, Work Offline |
| `wallet_error` | Web3 connection failed | Reconnect Wallet |
| `file_not_supported` | Invalid format | Choose Different File |
| `api_error` | Service unavailable | Retry, Check Status |

### Usage
```tsx
import { ErrorState } from './components/ErrorState';

<ErrorState
  type="ocr_failed"
  context={{
    message: "Image too blurry",
    onRetry: () => processAgain(),
    onManualEdit: () => openEditor()
  }}
/>
```

## ♿ Accessibility Improvements

### WCAG AA Compliance
- Color contrast ratios ≥4.5:1 for normal text
- Focus visible indicators on all interactive elements
- Screen reader announcements via ARIA live regions
- Keyboard navigation throughout

### New Utilities
```tsx
import {
  getContrastRatio,
  meetsContrastRequirements,
  trapFocus,
  runAccessibilityAudit
} from './lib/accessibility';

// Check if colors meet WCAG AA
meetsContrastRequirements('#ffffff', '#0f172a', 'normal'); // true

// Run audit
const { issues, warnings } = runAccessibilityAudit();
```

## 📦 New Files

```
src/
├── hooks/
│   ├── useTheme.ts          # Theme management
│   └── useAnalytics.ts      # Event tracking
├── components/
│   ├── GlobalSearch.tsx     # Semantic search modal
│   ├── EnhancedOnboarding.tsx # Multi-step wizard
│   ├── ErrorState.tsx       # Error handling UI
│   └── metaverse/
│       └── MapView2D.tsx    # 2D fallback renderer
├── lib/
│   └── accessibility.ts     # Enhanced a11y utilities
├── index.css                # Theme variables, animations
└── tailwind.config.js       # Extended design tokens
```

---

# 🚀 GeoGraph Node: v2.3.0 Release Notes

This release dramatically improves **duplicate detection** using modern NLP research and adds **manual curation tools** for intuitive asset consolidation.

## 🧠 Enhanced Deduplication V2

### Modern NLP Techniques
The new `deduplicationServiceV2.ts` implements research-backed algorithms:

| Technique | Purpose | Example |
|-----------|---------|---------|
| **N-gram Similarity** | Order-independent matching | "1950 Opening Day" ↔ "Opening Day 1950" |
| **Word Shingles** | Semantic phrase overlap | "Bronze Bust by Antonio" ↔ "Bust Sculpture Antonio Bronze" |
| **Semantic Concepts** | Prioritizes key data (years 4x weight) | Years, dates, proper nouns extracted |
| **Phonetic Encoding** | OCR error tolerance | "Antonio" ↔ "Antoneo", "Photograph" ↔ "Photogragh" |

### Research Foundation
Based on peer-reviewed algorithms:
- **Henzinger (2006):** Near-Duplicate Detection
- **Charikar (2002):** SimHash fingerprinting
- **Broder (1997):** MinHash for Jaccard estimation
- **Navarro (2001):** Fuzzy String Matching

### Improved Recall
- Threshold lowered from `0.55` to `0.40`
- Multi-technique scoring (takes best match)
- Union-Find with path compression and rank optimization

## 🎨 Curator Merge Panel

New UI component for manual asset consolidation:

### Suggestions Tab
- AI-powered merge suggestions
- One-click Accept/Reject actions
- Similarity badges: High (80%+), Medium (60%+), Fair (40%+)
- Match reason tags explaining why items are suggested

### Manual Merge Tab
- Multi-select assets from main view
- Custom title override option
- Preview consolidated metadata before merge

### Find Similar Tab
- Select a reference asset
- Search for similar items in your corpus
- Add matches to selection for bulk merge

## 📦 New Files
```
src/
├── services/deduplicationServiceV2.ts  # Modern NLP algorithms (~750 lines)
├── components/CuratorMergePanel.tsx    # Manual curation UI
```

## ⚙️ Technical Changes
- **Bundle Service:** Updated to use V2 deduplication
- **Clustering:** Union-Find with path compression and rank optimization
- **Scoring:** Best-of multiple techniques for higher recall

---

# 🚀 GeoGraph Node: v2.2.0 Release Notes

This release transforms the Knowledge World into an immersive **narrative exploration experience**, guiding users through their corpus like a "choose your own adventure" story.

## 📖 Story Navigator

### Narrative Engine
The new `narrativeService.ts` generates contextual stories as you explore:
- **Procedural Chapters:** Each node becomes a story chapter with dynamic narrative
- **Mood System:** Chapters adopt moods (mysterious, revelatory, contemplative, exciting, melancholic)
- **Thematic Templates:** Rich narrative templates for openings, connections, and transitions
- **Journey Tracking:** Your exploration path creates a unique story

### Interactive Story Experience
- **Typewriter Animation:** Text reveals gradually for immersive reading
- **Branching Choices:** 1-3 paths per chapter with difficulty indicators
- **Teasers & Consequences:** Hints about what awaits down each path
- **Skip & Reset:** Control your pace through the narrative

### Corpus Photo Integration
- **Floating Thumbnails:** Preview grid of your captured photos in World view
- **Chapter Artifacts:** Related photos displayed inline with narratives
- **Photo Gallery:** Navigate multiple views of bundled assets

## 🐢 Contemplative World Movement
- World rotation slowed from ~10s to ~5 minutes per revolution
- Encourages thoughtful exploration over rapid scanning

## 🎛️ Panel System
- **Story Navigator (📖):** Narrative exploration mode
- **Knowledge Explorer (🗺️):** Deep graph analysis mode
- **Expandable:** 384px default, 480px expanded width

## 📦 New Files
```
src/
├── services/narrativeService.ts  # NarrativeEngine class
├── components/metaverse/
│   └── StoryNarrator.tsx         # Story panel UI
```

## 🎨 CSS Additions
- `animate-fadeIn` - Smooth content transitions
- `animate-slideInRight` - Panel animations
- `animate-pulse-glow` - Selection effects

---

# 🚀 GeoGraph Node: v2.1.0 Release Notes

This update introduces **Semantic Deduplication** to prevent data dilution and a completely redesigned **Interactive Knowledge Explorer**.

## 🔄 Semantic Deduplication
Multiple photos of the same subject are automatically detected and bundled:
- Jaccard similarity for entity/keyword overlap
- Levenshtein distance for title comparison
- GPS proximity matching (~100m threshold)
- GIS zone correlation
- Union-Find clustering at 55% similarity threshold

## 🌐 Knowledge Explorer Redesign
- Force-directed physics layout
- Discovery paths and thematic clusters
- Animated particles on connections
- Exploration history with backtracking

---

# 🚀 GeoGraph Node: v2.0.0 Release Notes

This major release introduces the **Metaverse Foundation** with 3D world navigation and avatar persistence.

## 🌐 3D World Navigation
- Avatar persistence with XP progression
- Real-time presence for multi-user exploration
- Sector-based world partitioning
- Three.js ready with canvas fallback

## ⚡ Database Optimizations
- BRIN indexes for time-series queries
- GIN indexes for JSONB searches
- Partial indexes for workflow queues
- Monitoring views for performance tracking

---

# 🚀 GeoGraph Node: v1.9.4 Release Notes

This major update introduces the **GARD (SocialReturnSystem) Tokenomics Framework**, transforming GeoGraph from a document digitization tool into a **self-sustaining data economy** with measurable social returns.

## 🌱 GARD Tokenomics Integration

### Fractional Shard Ownership
- **1,000 Shards per Asset:** Each tokenized data asset is divided into 1,000 tradeable shards
- **Micro-Investments:** Enables fractional ownership of high-quality datasets
- **Portfolio Tracking:** View holdings, acquisition prices, unrealized gains, and current values

### 10% Royalty Recycling
Every transaction (sale, license, gift) triggers automatic royalty distribution:
- **50% Community Fund:** Allocated to DAO-governed social return projects
- **30% Shard Holders:** Proportional rewards based on holdings
- **20% Platform Maintenance:** Ensures operational sustainability

### DAO Governance
- **Weighted Voting:** Vote weight = (user_shards / total_shards) × 100
- **Proposal System:** Submit social return project proposals for community funding
- **Voting Periods:** 7-day default voting windows with real-time progress tracking

### Self-Sustainability Metrics
- **GARD Formula:** G_t = R_t + L_collateral,t + ROA_t
- **Sustainability Indicator:** Real-time meter showing G_t ≥ N_t compliance
- **70% LTV:** Loan-to-value ratio for asset-backed liquidity

## 🎯 New Features

### Social Returns Tab
Access via the **Sprout (🌱) icon** in the sidebar:
1. **Royalty Dashboard:** System stats, sustainability meter, transaction history
2. **Shard Portfolio:** View holdings, track gains, claim pending rewards
3. **Governance Voting:** Browse proposals, cast votes, view results

### Smart Contract
- **GARDDataShard.sol:** ERC1155 contract with EIP-2981 royalty standard
- **On-Chain Enforcement:** Royalty distribution on Polygon (Chain ID: 137)
- **Genesis Multiplier:** 1.5x rewards for early contributors

### Database Schema
Run `sql/GARD_SCHEMA.sql` to add:
- `royalty_transactions` - Transaction history
- `shard_holdings` - User portfolios
- `community_fund` - Fund balances
- `social_return_projects` - DAO proposals
- `governance_votes` - Voting records
- `gard_tokenized_assets` - Asset metadata
- `pending_rewards` - Unclaimed rewards

## 📦 New Code Structure
```
src/
├── services/gard/
│   ├── royaltyEngine.ts     # Core calculations
│   ├── communityFund.ts     # Fund management
│   ├── shardMarket.ts       # Trading & portfolios
│   └── index.ts             # Exports
├── hooks/
│   ├── useGARDRoyalties.ts  # Stats & transactions
│   ├── useShardPortfolio.ts # Holdings management
│   └── useGovernanceVoting.ts # DAO interface
├── components/gard/
│   ├── RoyaltyDashboard.tsx # Stats visualization
│   ├── ShardPortfolio.tsx   # Portfolio UI
│   ├── GovernanceVoting.tsx # Voting interface
│   └── index.ts             # Exports
contracts/
└── GARDDataShard.sol        # ERC1155 contract
sql/
└── GARD_SCHEMA.sql          # Database setup
```

---

# 🚀 GeoGraph Node: v1.9.3 Release Notes

This update introduces **Communities**, **Messaging**, **Data Gifting**, and a **Processing Visibility Panel**.

## 🏘️ Communities & Social Layer
- **Community System:** Create and join public or private communities with admission request management.
- **Community Data Baselines:** Filter Knowledge Graph and Semantic View by community data for collaborative research.

## 💬 Messaging & Data Gifting
- **User-to-User Messaging:** Secure real-time chat interface for curator communication.
- **Data Gifting:** Send Digital Assets and Data Bundles as gifts within messages.

## 👁️ Processing Visibility
- **Processing Panel:** Global, persistent UI component for monitoring background AI tasks (Zap icon).

---

# 🚀 GeoGraph Node: v1.9.2 Release Notes

This update introduces **Intelligent Data Aggregation** and a streamlined **Quick Processing** workflow.

## 🧠 Intelligent Data Aggregation
*   **Visual Associative Tagging:** The Gemini 2.5 Flash model now generates a unique `ASSOCIATIVE_ITEM_TAG` for physical objects. This allows the system to recognize the same item across different photos, angles, and sequences.
*   **Automatic Bundling:** Assets sharing the same associative tag are automatically grouped into data bundles, creating a more organized and searchable database.

## ⚡ Streamlined Ingestion
*   **Quick Processing UI:** Replaced the multi-step upload process with a single "Upload Documents" button. The AI now automatically categorizes items, eliminating the need for manual scan type selection.
*   **Process All Pending:** Added a "Process All Pending" button to both Quick Processing and Structured DB views, allowing for efficient batch processing of large datasets.

## 🛠️ UX Refinements
*   **AR Scanner Workflow:** Improved the AR Scanner's "Process Captures" confirmation. If a user cancels, they are now returned to the scanner view instead of losing their session queue.
*   **Type Safety:** Expanded the `DigitalAsset` and `SQLRecord` types to support the new aggregation metadata.

# 🚀 GeoGraph Node: v1.9.1 Release Notes

This update introduces **Full Offline Support**, enabling data collection in remote environments without internet connectivity.

## 📶 Offline Capabilities
*   **Robust Service Worker:** Updated caching strategy to include all external dependencies (React, Lucide, Gemini SDK), ensuring the app loads reliably offline.
*   **Offline Ingestion:** Assets captured via the AR Scanner or Camera while offline are now saved locally to IndexedDB with a `PENDING` status.
*   **Auto-Resume Pipeline:** The AI processing pipeline automatically detects when the device is back online and resumes processing for all pending assets.
*   **Offline UI Indicators:** New visual badges and status messages in the AR Scanner and Camera interfaces provide clear feedback on connection status.

## 🛠️ Reliability Improvements
*   **Auth Fallback:** Improved application startup logic to gracefully handle authentication failures when the Supabase backend is unreachable.
*   **PWA Hardening:** Optimized the manifest and service worker for better "Add to Home Screen" performance on mobile devices.

# 🚀 GeoGraph Node: v1.9.0 Release Notes

This patch fixes a critical database synchronization error where short random IDs were rejected by Supabase's UUID validation.

## 🛠️ Bug Fixes (v1.8.1)
*   **Standardized UUIDs:** Replaced legacy short-string ID generation with `uuidv4()`. This ensures that all asset identifiers are valid UUIDs, satisfying PostgreSQL's strict type checking and preventing `400 Bad Request` errors during cloud synchronization.
*   **Improved Sync Reliability:** All new uploads and batch imports now use globally unique identifiers that are compatible with both `TEXT` and `UUID` database columns.

# 🚀 GeoGraph Node: v1.8.0 Release Notes

This major update standardizes the entire database schema and application codebase to use **UPPERCASE** column names, resolving long-standing case-sensitivity issues with Supabase/PostgREST.

## 🏗️ Schema Standardization (v1.8.0)
*   **Global UPPERCASE Migration:** All database columns in the `historical_documents_global` table have been converted to UPPERCASE. This eliminates `PGRST204` errors and ensures that queries are always interpreted correctly by the backend.
*   **Strict Type Safety:** The `database.types.ts` file has been completely refactored to match the new schema. All interface keys now use UPPERCASE, providing compile-time validation for all database interactions.
*   **Unified Data Mapping:** The application's internal data models now align perfectly with the database schema, removing the need for complex case-conversion logic in the service layer.

## 🛠️ Bug Fixes & Improvements
*   **Ingestion Pipeline:** Fixed a critical bug where `ID` and `CREATED_AT` were missing from initial asset records, causing build failures and runtime sync issues.
*   **Auth Reliability:** Standardized authentication-related queries to use `USER_ID` (uppercase), ensuring that account deletion and private asset retrieval work reliably.
*   **Build Optimization:** Cleaned up redundant type definitions and improved the overall stability of the TypeScript build process.

# 🚀 GeoGraph Node: v1.7.3 Release Notes

## 🔒 Privacy & Security (v1.7.0+)
*   **End-to-End Encryption:** Sensitive OCR data and document descriptions are now encrypted client-side using AES-GCM before being sent to the cloud. Only you can decrypt your data.
*   **Right to be Forgotten:** A new "Delete Account" feature allows users to permanently wipe their entire cloud footprint, including all assets and transaction logs.
*   **Encrypted Web3 Logs:** On-chain transaction metadata is now stored in an encrypted state within your private Supabase profile.

## 🤖 AI Engine Reliability (v1.7.1)
*   **Gemini Flash 2.5 Optimization:** Fixed a critical connectivity issue where the API key was not being correctly exposed to the browser.
*   **SDK Hardening:** Updated the `@google/genai` integration to handle structured JSON responses more reliably with the latest schema requirements.
*   **Environment Readiness:** Standardized environment variable naming to `VITE_GEMINI_API_KEY` for seamless deployment on Vercel and other CI/CD platforms.

## 📱 Marketplace & Device Readiness
*   **Google Play Store Optimization:** Fully compliant `manifest.json` and high-resolution assets prepared for Android TWA (Trusted Web Activity) submission.
*   **Mobile-First Refinements:** Optimized touch targets and responsive layouts for field research on mobile and tablet devices.
*   **Marketplace Checklist:** Comprehensive guide for Chrome Web Store and Google Play Store submission added to the repository.

## 🎨 UI/UX & Accessibility
*   **Interactive Onboarding:** A new 6-step [Onboarding.tsx](src/components/Onboarding.tsx) guide helps new users master the GeoGraph ecosystem.
*   **Power-User Navigation:** Global [KeyboardShortcuts.tsx](src/components/KeyboardShortcuts.tsx) implemented; press `?` at any time to view the shortcut map.
*   **Polished Feedback:** Integrated [Toast.tsx](src/components/Toast.tsx) notifications and [Skeleton.tsx](src/components/Skeleton.tsx) loading states for smoother transitions.
*   **Resilience:** Added [ErrorBoundary.tsx](src/components/ErrorBoundary.tsx) to catch and recover from runtime issues gracefully.

## 🧠 Engine & Data Intelligence
*   **Gemini 2.5 Flash Upgrade:** Migrated to the latest `gemini-2.5-flash` model for faster reasoning and superior entity extraction from complex scans.
*   **Graph Exploration:** Enhanced [GraphVisualizer.tsx](src/components/GraphVisualizer.tsx) with `d3.zoom` for fluid panning and zooming in dense knowledge graphs.
*   **Structured DB Clusters:** New hierarchical "Cluster View" in the database tab allows grouping by Source, GIS Zone, or Category.
*   **Cloud Sync:** Added explicit "Refresh Cloud" logic to force-pull the latest dataframes from Supabase.

## 🔧 Technical Improvements
*   **Relational Integrity:** Reconstructed D3-compatible nodes and links from flattened SQL records in the Supabase service.
*   **Cache Strategy:** Implemented aggressive cache busting (`v=3`) to ensure immediate PWA updates.
*   **TypeScript:** Hardened the codebase with stricter types and resolved race conditions in image persistence.

---
*For a full list of granular changes, see the [CHANGELOG.md](CHANGELOG.md).*
