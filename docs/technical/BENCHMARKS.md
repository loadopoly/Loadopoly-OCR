# Loadopoly-OCR Benchmark Report

**Version:** 3.3.0  
**Date:** 2026-04-16  
**Schema:** `sql/CONSOLIDATED_SCHEMA.sql` v3.3.0

---

## 1. Build & Bundle Benchmarks

| Metric | Value |
|---|---|
| TypeScript compilation (`tsc --noEmit`) | **0 errors** |
| Vite production build time | **~7.5 s** |
| Total bundle size (dist/) | **2.8 MB** |
| Total output chunks | **46 files** |
| Largest chunk | `vendor-web3` — 395 KB (gzip: 146 KB) |
| Entry bundle (`index`) | 28 KB (gzip: 8.6 KB) |
| App shell (`App`) | 119 KB (gzip: 30 KB) |

### Code-Split Chunks

| Chunk | Size | gzip |
|---|---|---|
| vendor-react | 193 KB | 60 KB |
| vendor-visualization | 194 KB | 64 KB |
| vendor-ai | 253 KB | 50 KB |
| vendor-web3 | 395 KB | 146 KB |
| vendor-supabase | 169 KB | 44 KB |
| vendor-storage (Dexie) | 96 KB | 32 KB |
| vendor-icons (Lucide) | 55 KB | 11 KB |
| chunk-cluster-sync | 120 KB | 34 KB |
| chunk-queue-monitor | 64 KB | 17 KB |
| chunk-metaverse | 71 KB | 20 KB |
| chunk-gemini | 21 KB | 7 KB |

---

## 2. Source Code Metrics

| Metric | Count |
|---|---|
| TypeScript/TSX source files | 136 |
| Total lines of source code | 25,320 |
| Service files | 28 |
| Component files | 35+ |
| Largest service | `processingQueueService.ts` — 2,180 lines |

---

## 3. Database Schema Benchmarks

### Consolidated Schema (`CONSOLIDATED_SCHEMA.sql` v3.3.0)

| Metric | Count |
|---|---|
| Total SQL lines | 1,995 |
| Tables (CREATE TABLE) | 26 |
| Indexes (CREATE INDEX) | 54 |
| RLS Policies (CREATE POLICY) | 61 |
| Functions (CREATE OR REPLACE FUNCTION) | 19 |
| Supabase migrations | 6 |

### Core Tables

| Table | Primary Key | Key Columns | RLS |
|---|---|---|---|
| `historical_documents_global` | `ID` (UUID) | `ASSET_ID`, `USER_ID`, `LATITUDE`, `LONGITUDE`, `PROCESSING_STATUS` | ✅ owner + master_user_access |
| `processing_queue` | `ID` (UUID) | `ASSET_ID`, `USER_ID`, `LATITUDE`, `LONGITUDE`, `STATUS` | ✅ owner + service_role |
| `digital_asset_bundles` | `ID` (UUID) | `USER_ID`, `TITLE`, `ASSET_COUNT` | ✅ owner |
| `master_user_access` | `USER_ID` (UUID) | `CAN_ACCESS_CORPUS`, `CAN_MANAGE_ACCESS` | ✅ self + service_role |
| `user_credits` | `id` (UUID) | `user_id`, `credits_remaining`, `total_purchased` | ✅ owner + service_role |
| `credit_transactions` | `id` (UUID) | `user_id`, `amount`, `type`, `stripe_session_id` | ✅ owner + service_role |

### LATITUDE/LONGITUDE Verification

LATITUDE and LONGITUDE columns are present in the relational database at:

| Location | Type | Nullable |
|---|---|---|
| `historical_documents_global."LATITUDE"` | `DOUBLE PRECISION` | Yes |
| `historical_documents_global."LONGITUDE"` | `DOUBLE PRECISION` | Yes |
| `processing_queue."LATITUDE"` | `DOUBLE PRECISION` | Yes |
| `processing_queue."LONGITUDE"` | `DOUBLE PRECISION` | Yes |
| `database.types.ts` — `historical_documents_global.Row` | `number \| null` | ✅ |
| `database.types.ts` — `processing_queue.Row` | `number \| null` | ✅ |
| `seedDatasetService.ts` — GIS bounds query | `SELECT LATITUDE, LONGITUDE` | ✅ |
| `processingQueueService.ts` — job insert | `LATITUDE: params.location?.lat` | ✅ |
| `api/process-ocr/index.ts` — Edge Function | `latitude`, `longitude` fields | ✅ |

**Composite Index:** `idx_documents_lat_lng ON historical_documents_global("LATITUDE", "LONGITUDE") WHERE "LATITUDE" IS NOT NULL AND "LONGITUDE" IS NOT NULL`

---

## 4. Relational Sizing Benchmarks

The relational sizing system (migration `20260412000000_relational_sizing.sql`) adds physical dimension tracking to `graph_nodes`:

| Column | Type | Purpose |
|---|---|---|
| `PHYSICAL_HEIGHT_M` | `DOUBLE PRECISION` | Real-world height in meters |
| `PHYSICAL_WIDTH_M` | `DOUBLE PRECISION` | Real-world width in meters |
| `PHYSICAL_DEPTH_M` | `DOUBLE PRECISION` | Real-world depth in meters |
| `IS_REFERENCE_OBJECT` | `BOOLEAN` | Standard reference for scale calibration |
| `REFERENCE_UNIT` | `TEXT` | Unit of measurement (meters) |
| `DESCRIPTION` | `TEXT` | Human-readable object description |

Seed reference objects (from `20260412000100_seed_sizing_references.sql`):
- Standard water bottle, credit card, US dollar bill, tennis ball, basketball, etc.
- Each with verified real-world dimensions for scale calibration

**Sizing calculation flow:**
1. Gemini identifies reference objects + target objects in the image
2. `RELATIVE_SCALE` is computed as `target_height / reference_height`
3. Scale factors are stored as graph edge metadata (`relativeScale` field)
4. Physical dimensions are resolved via `graph_nodes.PHYSICAL_HEIGHT_M`

---

## 5. Stripe Payment Integration Benchmarks

### Architecture

| Component | Location | Function |
|---|---|---|
| Checkout session creator | `api/create-checkout-session.ts` | Creates Stripe Checkout sessions |
| Webhook handler | `api/stripe-webhook.ts` | Fulfills credit purchases on `checkout.session.completed` |
| Client credit service | `src/services/creditService.ts` | Client-side balance checks, consumption, BYOK bypass |
| Credit gate UI | `src/components/CreditGate.tsx` | Blocks processing when credits exhausted |

### Credit Packs

| Pack | Credits | Price | Stripe Price (cents) |
|---|---|---|---|
| Starter | 50 | $9 | 900 |
| Pro | 200 | $29 | 2,900 |
| Bulk | 1,000 | $99 | 9,900 |

### Credit Flow Verification

- [x] `create-checkout-session.ts` validates `packId` against known packs
- [x] `create-checkout-session.ts` verifies user exists in Supabase before creating session
- [x] `stripe-webhook.ts` verifies Stripe signature via `constructEvent`
- [x] Webhook upserts `user_credits` (existing row: update; new user: insert)
- [x] Webhook logs transaction to `credit_transactions`
- [x] `creditService.ts` checks BYOK (user's own API key) → unlimited credits
- [x] Free tier: 5 credits, tracked in `user_credits.free_credits_used`
- [x] Guest users: credits tracked in `localStorage`

---

## 6. Power User / Admin Control Benchmarks

### Master User Access

| Feature | Implementation |
|---|---|
| Access control table | `master_user_access` — `CAN_ACCESS_CORPUS`, `CAN_MANAGE_ACCESS` |
| RLS enforcement | `docs_read_owner_or_master` policy checks `master_user_access` for corpus read |
| Service role | Full access via `service_role` for all admin operations |
| Data sharing | `data_sharing_windows` + `seed_datasets` + `seed_adoptions` tables |

### Data Sharing Windows (migration `20260415000000_data_sharing_windows.sql`)

Power users can:
- Define time-bound data sharing windows with `SHARING_TYPE` (open, restricted, locked)
- Create seed datasets for community contribution
- Track adoption of seed datasets via `seed_adoptions`
- All protected by RLS: owner-only write, configurable read access

### Associated User Views

| View/Query | Purpose |
|---|---|
| `queue_stats` | Aggregated queue status counts |
| `queue_health` | Pending/processing/completed/failed metrics |
| `get_sector_presence` | Real-time user presence by world sector |
| `get_queue_health` | Function returning health JSON |
| `claim_processing_job` | Atomic job claim with lock (returns user's job) |

---

## 7. Deployment Benchmarks

| Target | Status | Domain |
|---|---|---|
| Vercel (main app) | ✅ Deployed | `loadopoly-ocr.vercel.app` |
| GitHub Pages (marketing) | ✅ Configured | `www.loadopoly.com` |
| Cloudflare Workers | 🔧 `wrangler.toml` added | `geograph` service |
| Supabase Edge Functions | ✅ `process-ocr` deployed | Server-side OCR |

---

## 8. Migration Inventory

| Migration | Purpose |
|---|---|
| `20260409000000_vault_and_storage_policies.sql` | Vault secret + storage bucket policies |
| `20260410000000_user_credits.sql` | Credit system tables (Stripe integration) |
| `20260412000000_relational_sizing.sql` | Physical dimension columns on graph_nodes |
| `20260412000100_seed_sizing_references.sql` | Standard reference objects (water bottle, etc.) |
| `20260415000000_data_sharing_windows.sql` | Data sharing windows + seed datasets |
| `20260416000000_historical_documents_global.sql` | Core document table with LATITUDE/LONGITUDE |

---

## 9. Test Coverage

### Existing Test Scripts

| Script | Purpose |
|---|---|
| `headless-test.cjs` | Headless browser test v1 |
| `headless-test-v2.cjs` | Headless browser test v2 |
| `headless-test-v3.cjs` | Headless browser test v3 |
| `test-db-interactive.cjs` | Interactive database testing |
| `test-mobile-db.cjs` | Mobile database flow testing |
| `test-navigation.cjs` | Navigation flow testing |
| `test-structured-db.cjs` | Structured classification DB testing |
| `scripts/health-check.sh` | Runtime health check |

### Schema Validation Checklist

- [x] All 26 tables have `CREATE TABLE IF NOT EXISTS` (idempotent)
- [x] All tables have RLS enabled
- [x] All 61 RLS policies use `(select auth.uid())` / `(select auth.role())` pattern
- [x] 54 performance indexes cover primary query patterns
- [x] LATITUDE/LONGITUDE present in both `processing_queue` and `historical_documents_global`
- [x] Credit tables match deployed migration column names (lowercase)
- [x] `database.types.ts` matches SQL schema for all table Row/Insert/Update types
- [x] Stripe webhook uses correct column names for `user_credits` upsert
- [x] Edge function (`process-ocr`) writes LATITUDE/LONGITUDE from job to asset
