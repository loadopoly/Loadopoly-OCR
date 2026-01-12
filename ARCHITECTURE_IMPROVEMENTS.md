# Architectural Improvements Implementation Plan

## Executive Summary

Based on the analysis of the Loadopoly-OCR codebase, this document outlines actionable architectural improvements to address bottlenecks in data processing. The current system processes images client-side sequentially, which limits throughput. These improvements will achieve **5-10x speedup** for batch operations.

## Current Architecture Analysis

### Existing Strengths ✅
- **Modular LLM providers** (`src/modules/llm/`) with abstraction layer
- **Comprehensive database optimization** (`sql/DATABASE_OPTIMIZATION.sql`) with BRIN/GIN indexes
- **Client-side persistence** via IndexedDB for offline support
- **Deduplication service v2** using n-gram/shingle similarity algorithms

### Identified Bottlenecks 🚧
1. **Sequential Gemini API calls** in `processNextBatchItem()`
2. **Client-side processing** limits concurrency to single-threaded
3. **No server-side queue** for background processing
4. **Full-size image uploads** before compression
5. **O(n²) deduplication** for large batches

---

## Implementation Roadmap

### Phase 1: Server-Side Processing Queue (Priority: HIGH)

#### 1.1 Create Processing Queue Schema

```sql
-- Add to sql/PROCESSING_QUEUE_SCHEMA.sql
```

**Key Features:**
- `processing_queue` table with status, priority, retry logic
- Database trigger for Edge Function invocation
- Queue statistics view for monitoring

#### 1.2 Supabase Edge Function for OCR

```typescript
// api/process-ocr/index.ts
// Serverless function triggered by queue inserts
```

**Benefits:**
- Auto-scaling workers
- Background processing (user can close app)
- 3-5x faster batch processing

---

### Phase 2: Parallel Processing (Priority: HIGH)

#### 2.1 Client-Side Web Workers

Implement dedicated Web Workers for:
- Image compression (parallel preprocessing)
- Gemini API calls (concurrent requests)
- Deduplication calculations

#### 2.2 Server-Side Worker Pool

For Supabase Edge Functions:
- Use `Promise.all()` with chunked batches
- Implement circuit breaker pattern
- Rate limiting with exponential backoff

---

### Phase 3: Image Optimization (Priority: MEDIUM)

#### 3.1 Client-Side Compression

```typescript
// src/lib/imageCompression.ts
// Compress images before upload using browser-image-compression
```

**Target:** Reduce upload size by 60-80%

#### 3.2 Progressive Image Loading

- Generate thumbnails immediately
- Show low-res placeholders during processing
- Replace with full analysis when complete

---

### Phase 4: Vector-Based Deduplication (Priority: MEDIUM)

#### 4.1 pgvector Integration

```sql
-- Enable pgvector extension in Supabase
-- Add embedding column to historical_documents_global
```

#### 4.2 Embedding Generation

- Use Gemini embeddings or Sentence Transformers
- Store embeddings during OCR processing
- Query via cosine similarity (`<->` operator)

**Result:** O(n log n) deduplication vs current O(n²)

---

### Phase 5: Caching & Sync Optimization (Priority: MEDIUM)

#### 5.1 Differential Sync

- Hash-based change detection
- Only sync modified metadata
- Batch upserts in chunks of 500

#### 5.2 Redis/Upstash Cache

- Cache frequently accessed assets
- Cache deduplication results for geo-clusters
- TTL-based invalidation

---

## File Structure for New Components

```
api/
├── process-ocr/
│   ├── index.ts              # Edge Function entry
│   └── geminiWorker.ts       # Worker thread logic
├── batch-status/
│   └── index.ts              # Queue status endpoint
sql/
├── PROCESSING_QUEUE_SCHEMA.sql
├── VECTOR_EMBEDDINGS_SCHEMA.sql
src/
├── workers/
│   ├── imageCompressionWorker.ts
│   ├── geminiWorker.ts
│   └── deduplicationWorker.ts
├── lib/
│   ├── imageCompression.ts
│   ├── workerPool.ts
│   └── circuitBreaker.ts
├── services/
│   └── processingQueueService.ts
```

---

## Implementation Priority Matrix

| Improvement | Impact | Effort | Priority |
|-------------|--------|--------|----------|
| Server-side queue | 5x speedup | Medium | 🔴 HIGH |
| Parallel Gemini calls | 4x speedup | Low | 🔴 HIGH |
| Image compression | 2x upload speed | Low | 🟡 MEDIUM |
| Web Workers | 2x client perf | Medium | 🟡 MEDIUM |
| pgvector dedup | 3x dedup speed | Medium | 🟡 MEDIUM |
| Redis caching | 2x query speed | Medium | 🟢 LOW |

---

## Monitoring & Observability

### Queue Metrics
- Queue depth (pending count)
- Processing rate (items/minute)
- Error rate by failure type
- P95 latency per processing stage

### Dashboard Views
```sql
-- Queue health view
CREATE VIEW queue_health AS
SELECT 
    status,
    COUNT(*) as count,
    AVG(EXTRACT(EPOCH FROM (NOW() - created_at))) as avg_age_seconds
FROM processing_queue
GROUP BY status;
```

---

## Rollback Strategy

Each phase is independently deployable and can be rolled back:

1. **Phase 1:** Delete Edge Function, drop queue table
2. **Phase 2:** Remove worker imports, revert to sequential
3. **Phase 3:** Remove compression step (transparent to users)
4. **Phase 4:** Keep text-based dedup as fallback
5. **Phase 5:** Disable cache, fall back to direct DB queries

---

## Next Steps

1. ✅ Create this architecture document
2. ✅ Implement processing queue schema (`sql/PROCESSING_QUEUE_SCHEMA.sql`)
3. ✅ Create image compression utility (`src/lib/imageCompression.ts`)
4. ✅ Add Web Worker for parallel processing (`src/workers/parallelWorker.ts`)
5. ✅ Create processing queue service (`src/services/processingQueueService.ts`)
6. ✅ Build Edge Function for server-side OCR (`api/process-ocr/index.ts`)
7. ✅ Add Worker Pool manager (`src/lib/workerPool.ts`)
8. ✅ Implement circuit breaker pattern (`src/lib/circuitBreaker.ts`)
9. ✅ Create vector embeddings schema (`sql/VECTOR_EMBEDDINGS_SCHEMA.sql`)
10. 🔲 Integrate queue service into App.tsx
11. 🔲 Add monitoring dashboards
12. 🔲 Deploy Edge Function to Supabase

---

## Implementation Files Created

| File | Description | Status |
|------|-------------|--------|
| [sql/PROCESSING_QUEUE_SCHEMA.sql](sql/PROCESSING_QUEUE_SCHEMA.sql) | Server-side job queue with RLS | ✅ Complete |
| [sql/VECTOR_EMBEDDINGS_SCHEMA.sql](sql/VECTOR_EMBEDDINGS_SCHEMA.sql) | pgvector embeddings for dedup | ✅ Complete |
| [src/lib/imageCompression.ts](src/lib/imageCompression.ts) | Client-side image optimization | ✅ Complete |
| [src/lib/workerPool.ts](src/lib/workerPool.ts) | Web Worker pool manager | ✅ Complete |
| [src/lib/circuitBreaker.ts](src/lib/circuitBreaker.ts) | Fault tolerance pattern | ✅ Complete |
| [src/workers/parallelWorker.ts](src/workers/parallelWorker.ts) | Parallel similarity calculations | ✅ Complete |
| [src/services/processingQueueService.ts](src/services/processingQueueService.ts) | Queue management client | ✅ Complete |
| [api/process-ocr/index.ts](api/process-ocr/index.ts) | Supabase Edge Function | ✅ Complete |

---

*Document Version: 1.1.0*
*Last Updated: January 12, 2026*
