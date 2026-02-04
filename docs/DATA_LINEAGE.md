# Loadopoly-OCR Data Lineage

> **Version:** 3.0.0  
> **Last Updated:** 2026-02-04  
> **Related:** [Data Dictionary](DATA_DICTIONARY.md) | [Semantic Model](SEMANTIC_MODEL.md)

## Overview

This document describes how data flows through the Loadopoly-OCR system, from initial capture to tokenization and display.

---

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                              LOADOPOLY-OCR DATA LINEAGE                              │
└─────────────────────────────────────────────────────────────────────────────────────┘

┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   CAPTURE   │ -> │  PROCESSING │ -> │   STORAGE   │ -> │   DISPLAY   │
│   LAYER     │    │   LAYER     │    │   LAYER     │    │   LAYER     │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
      │                  │                  │                  │
      ▼                  ▼                  ▼                  ▼
┌───────────┐      ┌───────────┐      ┌───────────┐      ┌───────────┐
│ Camera    │      │ Gemini    │      │ Supabase  │      │ 3D World  │
│ Import    │      │ Vision    │      │ Postgres  │      │ View      │
│ Bluetooth │      │ OCR       │      │ Storage   │      │ Structured│
│ Upload    │      │ NLP       │      │ Realtime  │      │ DB        │
└───────────┘      │ GIS       │      └───────────┘      └───────────┘
                   │ LLM Class │
                   └───────────┘
```

---

## 1. Capture Layer

### 1.1 Data Sources

| Source | Input Type | Trigger | Initial Data |
|--------|-----------|---------|--------------|
| **Camera Capture** | Image | User action | Image blob, GPS coords, timestamp |
| **Batch Import** | Multiple images | User action | Image files, optional metadata CSV |
| **Bluetooth Scanner** | Image stream | Device event | Image blob, device ID |
| **Manual Upload** | Image file | User action | Image blob, user metadata |

### 1.2 Initial Transformation

```
User Action → Image Capture → Local Processing
                    ↓
         ┌─────────────────────┐
         │ createProcessingJob │
         │   - Generate UUID   │
         │   - Upload image    │
         │   - Extract GPS     │
         │   - Queue job       │
         └─────────────────────┘
                    ↓
           processing_queue
```

**Data Created:**
- `ASSET_ID`: Generated UUID
- `IMAGE_PATH`: Supabase storage path
- `LATITUDE/LONGITUDE`: Device GPS or EXIF extraction
- `SCAN_TYPE`: User-selected or auto-detected
- `USER_ID`: Auth context (nullable for anonymous)

---

## 2. Processing Layer

### 2.1 OCR Pipeline

```
processing_queue (STATUS='PENDING')
         ↓
┌─────────────────────────────────┐
│     Edge Function: process-ocr  │
│  ┌────────────────────────────┐ │
│  │ 1. claim_processing_job()  │ │
│  │ 2. Download image          │ │
│  │ 3. Gemini Vision API       │ │
│  │ 4. NLP entity extraction   │ │
│  │ 5. GIS zone mapping        │ │
│  │ 6. Write to HDG table      │ │
│  │ 7. complete_processing_job │ │
│  └────────────────────────────┘ │
└─────────────────────────────────┘
         ↓
historical_documents_global (new row)
```

**Data Transformations:**

| Stage | Input | Output | Stored In |
|-------|-------|--------|-----------|
| OCR | Image | Text content | `OCR_EXTRACTED_TEXT` |
| NLP | Text | Entities, keywords | `ENTITIES_EXTRACTED`, `KEYWORDS_TAGS` |
| GIS | GPS coords | Zone, address | `LOCAL_GIS_ZONE`, `OCR_DERIVED_GIS_ZONE` |
| Timestamp | Text/EXIF | Date estimate | `OCR_DERIVED_TIMESTAMP` |
| Classification | All above | Category | `NLP_NODE_CATEGORIZATION` |

### 2.2 Classification Pipeline

```
historical_documents_global (newly created)
         ↓
┌─────────────────────────────────┐
│    LLM Classification Worker    │
│  ┌────────────────────────────┐ │
│  │ 1. Read unstructured data  │ │
│  │ 2. LLM dimension mapping   │ │
│  │ 3. Confidence scoring      │ │
│  │ 4. Write structured cols   │ │
│  │ 5. Update mappings table   │ │
│  └────────────────────────────┘ │
└─────────────────────────────────┘
         ↓
┌────────────────────────────────────────────────┐
│ STRUCTURED_TEMPORAL   → {era, period, age}     │
│ STRUCTURED_SPATIAL    → {zone, scale, place}   │
│ STRUCTURED_CONTENT    → {category, mediaType}  │
│ STRUCTURED_KNOWLEDGE_GRAPH → {nodeType, edges} │
│ STRUCTURED_PROVENANCE → {license, verification}│
│ STRUCTURED_DISCOVERY  → {source, potential}    │
└────────────────────────────────────────────────┘
         ↓
structured_classification_mappings (learning)
cluster_dimension_statistics (aggregation)
```

### 2.3 Embedding Pipeline

```
historical_documents_global
         ↓
┌─────────────────────────────────┐
│      Embedding Generation       │
│  ┌────────────────────────────┐ │
│  │ 1. Extract text content    │ │
│  │ 2. Gemini embedding API    │ │
│  │ 3. Image embedding (CLIP)  │ │
│  │ 4. Weighted fusion         │ │
│  │ 5. Store vector columns    │ │
│  └────────────────────────────┘ │
└─────────────────────────────────┘
         ↓
┌──────────────────────────────────┐
│ TEXT_EMBEDDING     → vector(768) │
│ IMAGE_EMBEDDING    → vector(512) │
│ COMBINED_EMBEDDING → vector(768) │
│ EMBEDDING_MODEL    → model name  │
│ EMBEDDING_UPDATED_AT → timestamp │
└──────────────────────────────────┘
```

---

## 3. Storage Layer

### 3.1 Data Stores

| Store | Type | Purpose | Access Pattern |
|-------|------|---------|----------------|
| **Supabase Storage** | Object | Image files | Direct URL, signed URLs |
| **Supabase Postgres** | Relational | Structured data | REST API, RLS |
| **Supabase Realtime** | PubSub | Live updates | WebSocket subscriptions |
| **pgvector** | Vector | Similarity search | Cosine distance queries |

### 3.2 Table Relationships

```
auth.users
    │
    ├──< processing_queue (USER_ID)
    │         │
    │         └── RESULT_DATA ──> historical_documents_global
    │
    ├──< historical_documents_global (USER_ID)
    │         │
    │         ├── BUNDLE_ID ──> digital_asset_bundles
    │         └── ASSET_ID ──> gard_tokenized_assets
    │
    ├──< user_avatars (USER_ID)
    │
    ├──< presence_sessions (USER_ID)
    │
    ├──< shard_holdings (USER_ID)
    │
    └──< pending_rewards (USER_ID)
```

### 3.3 Data Flow: Queue → Document

```
processing_queue                    historical_documents_global
┌─────────────────┐                ┌─────────────────────────────┐
│ ID              │                │ ASSET_ID ◄──────────────────│
│ ASSET_ID ───────┼───creates─────>│ USER_ID                     │
│ USER_ID         │                │ OCR_EXTRACTED_TEXT          │
│ IMAGE_PATH      │                │ ENTITIES_EXTRACTED          │
│ RESULT_DATA ────┼───contains────>│ KEYWORDS_TAGS               │
│ STATUS          │                │ STRUCTURED_* columns        │
│ COMPLETED_AT    │                │ TEXT_EMBEDDING              │
└─────────────────┘                │ CREATED_AT                  │
                                   └─────────────────────────────┘
```

---

## 4. Display Layer

### 4.1 3D World View Data Flow

```
historical_documents_global
         ↓
┌─────────────────────────────────┐
│       World Renderer            │
│  ┌────────────────────────────┐ │
│  │ 1. Spatial clustering      │ │
│  │ 2. Force-directed layout   │ │
│  │ 3. Node geometry creation  │ │
│  │ 4. Level-of-detail         │ │
│  └────────────────────────────┘ │
└─────────────────────────────────┘
         ↓
     3D World (Three.js)
         │
         ├── world_sectors (generated)
         │
         └── presence_sessions (realtime)
                    ↓
              User Avatars (realtime)
```

### 4.2 Structured Database View

```
historical_documents_global + structured_clusters
         ↓
┌─────────────────────────────────┐
│      Structured DB Component    │
│  ┌────────────────────────────┐ │
│  │ 1. JSONB cluster grouping  │ │
│  │ 2. Dimension filtering     │ │
│  │ 3. Faceted search          │ │
│  │ 4. Table/Grid rendering    │ │
│  └────────────────────────────┘ │
└─────────────────────────────────┘
         ↓
     UI Components
```

---

## 5. Tokenization Layer (GARD)

### 5.1 Asset Tokenization Flow

```
historical_documents_global (high-quality asset)
         ↓
┌─────────────────────────────────┐
│       Tokenization Request      │
│  ┌────────────────────────────┐ │
│  │ 1. Quality score check     │ │
│  │ 2. Smart contract mint     │ │
│  │ 3. Create 1000 shards      │ │
│  │ 4. Record in registry      │ │
│  └────────────────────────────┘ │
└─────────────────────────────────┘
         ↓
┌────────────────────────────────────────┐
│ gard_tokenized_assets                  │
│   - NFT_TOKEN_ID                       │
│   - SHARD_COUNT = 1000                 │
│   - CONTRIBUTOR_WALLET                 │
│   - Quality scores                     │
└────────────────────────────────────────┘
         ↓
     Polygon Blockchain (ERC-1155)
```

### 5.2 Royalty Distribution Flow

```
Secondary Sale (Blockchain Event)
         ↓
┌─────────────────────────────────┐
│    record_royalty_transaction   │
│  ┌────────────────────────────┐ │
│  │ 1. Calculate 10% royalty   │ │
│  │ 2. Split distribution:     │ │
│  │    - 50% Community Fund    │ │
│  │    - 30% Shard Holders     │ │
│  │    - 20% Maintenance       │ │
│  │ 3. Update balances         │ │
│  └────────────────────────────┘ │
└─────────────────────────────────┘
         ↓
┌───────────────────────────────────────────┐
│ royalty_transactions (audit record)       │
│ community_fund (balance update)           │
│ pending_rewards (holder rewards)          │
└───────────────────────────────────────────┘
```

### 5.3 DAO Governance Flow

```
pending_rewards (accumulated)
         ↓
social_return_projects (proposed)
         ↓
┌─────────────────────────────────┐
│        Voting Period            │
│  ┌────────────────────────────┐ │
│  │ governance_votes            │ │
│  │   - VOTE_WEIGHT from shards│ │
│  │   - VOTE_DIRECTION          │ │
│  └────────────────────────────┘ │
└─────────────────────────────────┘
         ↓
social_return_projects (STATUS='FUNDED')
         ↓
community_fund (balance withdrawal)
```

---

## 6. Realtime Data Flows

### 6.1 Presence Synchronization

```
User joins sector
         ↓
presence_sessions (INSERT)
         ↓
Supabase Realtime broadcast
         ↓
Other users in sector receive update
         ↓
user_avatars (DISPLAY_NAME, AVATAR_COLOR)
         ↓
Render avatar in 3D world
```

### 6.2 Queue Status Updates

```
processing_queue (STATUS change)
         ↓
Supabase Realtime broadcast
         ↓
Client subscription receives update
         ↓
UI progress indicator updated
```

---

## 7. Data Retention & Archival

### 7.1 Retention Policies

| Data Type | Retention | Archival Strategy |
|-----------|-----------|-------------------|
| `processing_queue` (COMPLETED) | 30 days | Delete after 30 days |
| `processing_queue` (FAILED) | 90 days | Archive to cold storage |
| `presence_sessions` | 5 minutes | Auto-cleanup via trigger |
| `realtime_events` (PROCESSED) | 24 hours | Delete after processing |
| `classification_audit_log` | Indefinite | Immutable audit trail |
| `historical_documents_global` | Indefinite | Core data, never delete |
| `royalty_transactions` | Indefinite | Financial audit trail |

### 7.2 Cleanup Functions

| Function | Trigger | Action |
|----------|---------|--------|
| `cleanup_stale_presence()` | Scheduled (5 min) | Delete old presence_sessions |
| `release_stale_locks()` | Scheduled (1 min) | Reset abandoned processing jobs |

---

## 8. Data Quality Controls

### 8.1 Validation Points

| Stage | Validation | Action on Failure |
|-------|------------|-------------------|
| Image Upload | Size < 20MB, valid format | Reject with error |
| OCR Processing | Confidence > 0.5 | Mark low confidence |
| Classification | LLM confidence > 0.6 | Skip classification |
| Embedding | Valid vector dimensions | Retry or skip |
| Tokenization | Quality scores > thresholds | Reject tokenization |

### 8.2 Audit Trail

All classification changes are recorded in `classification_audit_log`:

```sql
classification_audit_log
├── ASSET_ID        -- What was changed
├── PREVIOUS_VALUE  -- Old classification
├── NEW_VALUE       -- New classification
├── CHANGE_TYPE     -- CREATE, UPDATE, DELETE, BULK_SYNC
├── LLM_USED        -- Which model made the change
├── PROMPT_HASH     -- For reproducibility
├── BATCH_ID        -- For bulk operations
├── CREATED_BY      -- User who triggered
└── CREATED_AT      -- When it happened
```

---

## Appendix: Complete Data Flow Sequence

```
1. USER ACTION
   └── Camera/Upload/Import

2. INGESTION
   ├── Image → Supabase Storage
   └── Job → processing_queue (PENDING)

3. PROCESSING (Edge Function)
   ├── Claim job (PROCESSING)
   ├── Gemini Vision OCR
   ├── NLP entity extraction
   ├── GIS zone mapping
   └── Complete job → historical_documents_global

4. ENRICHMENT
   ├── LLM Classification → STRUCTURED_* columns
   ├── Embedding generation → *_EMBEDDING columns
   └── Mapping learning → structured_classification_mappings

5. DEDUPLICATION (Optional)
   ├── Vector similarity search
   └── Bundle creation → digital_asset_bundles

6. DISPLAY
   ├── 3D World (force-directed graph)
   ├── Structured DB (faceted search)
   └── Realtime presence (avatars)

7. TOKENIZATION (Optional)
   ├── Quality validation
   ├── NFT minting → Polygon
   └── Registry → gard_tokenized_assets

8. ROYALTIES
   ├── Secondary sale event
   ├── Distribution calculation
   └── Fund updates → community_fund, pending_rewards

9. GOVERNANCE
   ├── Project proposals
   ├── Shard-weighted voting
   └── Fund disbursement
```
