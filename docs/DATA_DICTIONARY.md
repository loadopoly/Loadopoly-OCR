# Loadopoly-OCR Data Dictionary

> **Version:** 3.0.0  
> **Last Updated:** 2026-02-04  
> **Source of Truth:** [CONSOLIDATED_SCHEMA.sql](sql/CONSOLIDATED_SCHEMA.sql)

## Overview

This document provides comprehensive documentation of all database tables, columns, and their purposes in the Loadopoly-OCR system.

---

## Table of Contents

1. [Core Tables](#1-core-tables)
2. [Classification System](#2-classification-system)
3. [Avatar & Presence System](#3-avatar--presence-system)
4. [GARD Tokenization System](#4-gard-tokenization-system)
5. [Monitoring Views](#5-monitoring-views)

---

## 1. Core Tables

### 1.1 `processing_queue`

Server-side queue for OCR processing jobs. Enables background processing and auto-scaling.

| Column | Type | Default | Nullable | Description |
|--------|------|---------|----------|-------------|
| `ID` | UUID | `gen_random_uuid()` | NO | Primary key |
| `USER_ID` | UUID | - | YES | Reference to auth.users, nullable for anonymous uploads |
| `ASSET_ID` | TEXT | - | NO | Unique identifier for the asset being processed |
| `IMAGE_PATH` | TEXT | - | NO | Storage path to the image file |
| `SCAN_TYPE` | TEXT | `'DOCUMENT'` | NO | Type of scan: DOCUMENT, SCENERY, OBJECT, etc. |
| `PRIORITY` | INTEGER | `5` | NO | Job priority 1-10 (higher = more urgent) |
| `LATITUDE` | DOUBLE PRECISION | - | YES | GPS latitude for GIS extraction |
| `LONGITUDE` | DOUBLE PRECISION | - | YES | GPS longitude for GIS extraction |
| `STATUS` | TEXT | `'PENDING'` | NO | PENDING, PROCESSING, COMPLETED, FAILED, CANCELLED |
| `PROGRESS` | INTEGER | `0` | YES | Percentage complete (0-100) |
| `STAGE` | TEXT | `'QUEUED'` | YES | Current processing stage description |
| `RETRY_COUNT` | INTEGER | `0` | YES | Number of retry attempts |
| `MAX_RETRIES` | INTEGER | `3` | YES | Maximum retry attempts allowed |
| `LAST_ERROR` | TEXT | - | YES | Last error message if failed |
| `ERROR_CODE` | TEXT | - | YES | Structured error code |
| `WORKER_ID` | TEXT | - | YES | ID of worker processing this job |
| `LOCKED_AT` | TIMESTAMPTZ | - | YES | When the job was locked by a worker |
| `LOCK_TIMEOUT_SECONDS` | INTEGER | `300` | YES | Lock expiry duration |
| `CREATED_AT` | TIMESTAMPTZ | `NOW()` | YES | Job creation timestamp |
| `STARTED_AT` | TIMESTAMPTZ | - | YES | Processing start timestamp |
| `COMPLETED_AT` | TIMESTAMPTZ | - | YES | Processing completion timestamp |
| `UPDATED_AT` | TIMESTAMPTZ | `NOW()` | YES | Last update timestamp |
| `RESULT_DATA` | JSONB | - | YES | Processing results stored as JSON |
| `METADATA` | JSONB | `'{}'` | YES | Additional job metadata |

**Indexes:**
- `idx_queue_fetch` - Partial index on STATUS='PENDING' for fast job claims
- `idx_queue_stale_locks` - For detecting abandoned locks
- `idx_queue_user` - User's queue view
- `idx_queue_retry` - Failed jobs needing retry

---

### 1.2 `digital_asset_bundles`

Consolidated metadata for deduplicated assets. Supports semantic deduplication and manual curation.

| Column | Type | Default | Nullable | Description |
|--------|------|---------|----------|-------------|
| `ID` | UUID | `gen_random_uuid()` | NO | Primary key |
| `USER_ID` | UUID | - | YES | Owner reference to auth.users |
| `TITLE` | TEXT | - | NO | Bundle display title |
| `DESCRIPTION` | TEXT | - | YES | Bundle description |
| `CONSOLIDATED_METADATA` | JSONB | `'{}'` | YES | Merged metadata from all assets |
| `IMAGE_URLS` | TEXT[] | `'{}'` | YES | Array of image URLs in bundle |
| `ASSET_COUNT` | INTEGER | `1` | YES | Number of assets in bundle |
| `IS_AUTO_GENERATED` | BOOLEAN | `false` | YES | True if created by deduplication |
| `CREATED_AT` | TIMESTAMPTZ | `NOW()` | YES | Creation timestamp |
| `UPDATED_AT` | TIMESTAMPTZ | `NOW()` | YES | Last update timestamp |

---

### 1.3 `historical_documents_global` (Extended Columns)

The core asset table. These columns are added by the schema to extend existing table:

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `TEXT_EMBEDDING` | vector(768) | - | Text semantic embedding for similarity search |
| `IMAGE_EMBEDDING` | vector(512) | - | Image embedding for visual similarity |
| `COMBINED_EMBEDDING` | vector(768) | - | Weighted fusion of text + image embeddings |
| `EMBEDDING_MODEL` | TEXT | `'gemini-embedding-001'` | Model used for embeddings |
| `EMBEDDING_UPDATED_AT` | TIMESTAMPTZ | - | When embeddings were last generated |
| `STRUCTURED_TEMPORAL` | JSONB | - | Temporal classification (era, period, age) |
| `STRUCTURED_SPATIAL` | JSONB | - | Spatial classification (zone, scale, place type) |
| `STRUCTURED_CONTENT` | JSONB | - | Content classification (category, media type) |
| `STRUCTURED_KNOWLEDGE_GRAPH` | JSONB | - | Graph metadata (node type, connections) |
| `STRUCTURED_PROVENANCE` | JSONB | - | Provenance (license, verification level) |
| `STRUCTURED_DISCOVERY` | JSONB | - | Discovery metadata (source, status) |
| `CLASSIFICATION_LLM` | TEXT | - | LLM model that performed classification |
| `CLASSIFICATION_DATE` | TIMESTAMPTZ | - | When classification was performed |
| `CLASSIFICATION_VERSION` | TEXT | - | Version of classification schema |
| `CLASSIFICATION_CONFIDENCE` | NUMERIC(4,3) | - | Overall confidence score 0.000-1.000 |
| `BUNDLE_ID` | UUID | - | Reference to digital_asset_bundles |

---

## 2. Classification System

### 2.1 `structured_clusters`

Stores learned classification mappings for LLM-synchronized dimensions.

| Column | Type | Default | Nullable | Description |
|--------|------|---------|----------|-------------|
| `ID` | UUID | `gen_random_uuid()` | NO | Primary key |
| `CLUSTER_TYPE` | TEXT | - | NO | TEMPORAL, SPATIAL, CONTENT, KNOWLEDGE_GRAPH, PROVENANCE, DISCOVERY |
| `DIMENSION_NAME` | TEXT | - | NO | Dimension within cluster (e.g., "era", "zone") |
| `STRUCTURED_VALUE` | TEXT | - | NO | Canonical structured value |
| `VALUE_DESCRIPTION` | TEXT | - | YES | Human-readable description |
| `SAMPLE_ASSET_IDS` | TEXT[] | `'{}'` | YES | Sample assets with this value |
| `ASSET_COUNT` | INTEGER | `0` | YES | Count of assets with this value |
| `CREATED_AT` | TIMESTAMPTZ | `NOW()` | YES | Creation timestamp |
| `UPDATED_AT` | TIMESTAMPTZ | `NOW()` | YES | Last update timestamp |

**Unique Constraint:** `(CLUSTER_TYPE, DIMENSION_NAME, STRUCTURED_VALUE)`

---

### 2.2 `structured_classification_mappings`

Stores learned correlations between unstructured (raw) values and structured classifications.

| Column | Type | Default | Nullable | Description |
|--------|------|---------|----------|-------------|
| `ID` | UUID | `gen_random_uuid()` | NO | Primary key |
| `CLUSTER_TYPE` | TEXT | - | NO | Cluster type |
| `DIMENSION_NAME` | TEXT | - | NO | Dimension name |
| `RAW_VALUE` | TEXT | - | NO | Original unstructured value |
| `RAW_VALUE_NORMALIZED` | TEXT | - | NO | Lowercase, trimmed for matching |
| `STRUCTURED_VALUE` | TEXT | - | NO | Mapped structured value |
| `MAPPING_TYPE` | TEXT | `'LEARNED'` | YES | EXACT, SYNONYM, PARENT, CHILD, RELATED, LEARNED |
| `CONFIDENCE` | NUMERIC(4,3) | - | NO | Mapping confidence 0.000-1.000 |
| `OCCURRENCE_COUNT` | INTEGER | `1` | YES | Times this mapping was observed |
| `FIRST_OBSERVED` | TIMESTAMPTZ | `NOW()` | YES | First observation |
| `LAST_OBSERVED` | TIMESTAMPTZ | `NOW()` | YES | Most recent observation |
| `CREATED_BY_LLM` | TEXT | - | NO | LLM that created mapping |
| `CREATED_AT` | TIMESTAMPTZ | `NOW()` | YES | Creation timestamp |
| `IS_VALIDATED` | BOOLEAN | `false` | YES | Human validation flag |
| `VALIDATED_BY` | UUID | - | YES | Validator user reference |
| `VALIDATED_AT` | TIMESTAMPTZ | - | YES | Validation timestamp |

---

### 2.3 `classification_audit_log`

Tracks all classification operations for provenance and rollback.

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `ID` | UUID | `gen_random_uuid()` | Primary key |
| `ASSET_ID` | TEXT | - | Asset being classified |
| `CLUSTER_TYPE` | TEXT | - | Cluster type |
| `PREVIOUS_VALUE` | JSONB | - | Previous classification value |
| `NEW_VALUE` | JSONB | - | New classification value |
| `CHANGE_TYPE` | TEXT | - | CREATE, UPDATE, DELETE, BULK_SYNC |
| `LLM_USED` | TEXT | - | LLM model used |
| `PROMPT_HASH` | TEXT | - | Hash of prompt for reproducibility |
| `BATCH_ID` | UUID | - | For bulk operations |
| `CREATED_BY` | UUID | - | User who triggered |
| `CREATED_AT` | TIMESTAMPTZ | `NOW()` | Timestamp |

---

### 2.4 `cluster_dimension_statistics`

Tracks dimension value distributions for corpus analysis.

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `ID` | UUID | `gen_random_uuid()` | Primary key |
| `CLUSTER_TYPE` | TEXT | - | Cluster type |
| `DIMENSION_NAME` | TEXT | - | Dimension name |
| `STRUCTURED_VALUE` | TEXT | - | Structured value |
| `OCCURRENCE_COUNT` | INTEGER | `0` | Usage count |
| `PERCENTAGE_OF_CORPUS` | NUMERIC(5,2) | `0` | Percentage of total |
| `CO_OCCURS_WITH` | JSONB | `'{}'` | Co-occurrence patterns |
| `FIRST_USED` | TIMESTAMPTZ | `NOW()` | First usage |
| `LAST_USED` | TIMESTAMPTZ | `NOW()` | Last usage |
| `USAGE_TREND` | TEXT | - | INCREASING, STABLE, DECREASING |
| `UPDATED_AT` | TIMESTAMPTZ | `NOW()` | Last update |

---

## 3. Avatar & Presence System

### 3.1 `user_avatars`

User avatar state and progression. Persists across sessions.

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `ID` | UUID | `gen_random_uuid()` | Primary key |
| `USER_ID` | UUID | - | Reference to auth.users (UNIQUE) |
| `DISPLAY_NAME` | TEXT | - | User display name |
| `AVATAR_MODEL` | TEXT | `'default_explorer'` | 3D model identifier |
| `AVATAR_COLOR` | TEXT | `'#6366f1'` | Avatar color hex |
| `LAST_POSITION` | FLOAT[3] | `'{0,0,0}'` | Last 3D position [x,y,z] |
| `LAST_ROTATION` | FLOAT[4] | `'{0,0,0,1}'` | Last rotation quaternion [x,y,z,w] |
| `LAST_SECTOR` | TEXT | `'ORIGIN'` | Last visited sector |
| `CONTRIBUTION_LEVEL` | INTEGER | `1` | User contribution level |
| `TOTAL_NODES_CREATED` | INTEGER | `0` | Total nodes contributed |
| `TOTAL_SHARDS_EARNED` | NUMERIC(18,8) | `0` | Total GARD shards earned |
| `EXPLORATION_POINTS` | INTEGER | `0` | Exploration score |
| `BADGES` | JSONB | `'[]'` | Earned badges array |
| `CREATED_AT` | TIMESTAMPTZ | `NOW()` | Account creation |
| `LAST_SEEN` | TIMESTAMPTZ | `NOW()` | Last activity |

---

### 3.2 `presence_sessions`

Ephemeral presence for real-time "who's online" tracking.

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `ID` | UUID | `gen_random_uuid()` | Primary key |
| `USER_ID` | UUID | - | Reference to auth.users |
| `SESSION_ID` | TEXT | - | Unique session identifier |
| `SECTOR` | TEXT | `'ORIGIN'` | Current sector |
| `WORLD_POSITION` | FLOAT[3] | `'{0,0,0}'` | Current 3D position |
| `STATUS` | TEXT | `'ACTIVE'` | ACTIVE, IDLE, AWAY |
| `HEARTBEAT_AT` | TIMESTAMPTZ | `NOW()` | Last heartbeat |
| `CREATED_AT` | TIMESTAMPTZ | `NOW()` | Session start |

---

### 3.3 `world_sectors`

World sectors procedurally generated from graph clusters.

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `ID` | UUID | `gen_random_uuid()` | Primary key |
| `SECTOR_CODE` | TEXT | - | Unique sector identifier |
| `DISPLAY_NAME` | TEXT | `'Sector'` | Display name |
| `CENTER_X/Y/Z` | FLOAT | `0` | Center coordinates |
| `RADIUS` | FLOAT | `100` | Sector radius |
| `AESTHETIC_THEME` | TEXT | `'DIGITAL_NEON'` | Visual theme |
| `ZONE_TYPE` | TEXT | `'URBAN_CORE'` | Zone classification |
| `SOURCE_CLUSTER_ID` | TEXT | - | Origin cluster |
| `NODE_COUNT` | INTEGER | `0` | Nodes in sector |
| `ASSET_COUNT` | INTEGER | `0` | Assets in sector |
| `CREATED_AT` | TIMESTAMPTZ | `NOW()` | Creation time |
| `UPDATED_AT` | TIMESTAMPTZ | `NOW()` | Last update |

**Aesthetic Themes:** VICTORIAN_LIBRARY, BRUTALIST_ARCHIVE, DIGITAL_NEON, ORGANIC_GROWTH, INDUSTRIAL_HERITAGE, ACADEMIC_QUADRANGLE, SACRED_GEOMETRY, CYBERPUNK_FRONTIER

**Zone Types:** URBAN_CORE, KNOWLEDGE_DISTRICT, DATA_SUBURBS, FRONTIER_ZONE, ARCHIVE_RUINS, INSTITUTIONAL_HQ, MARKETPLACE, COMMUNITY_PLAZA

---

### 3.4 `realtime_events`

Realtime events log for world mutations.

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `ID` | UUID | `gen_random_uuid()` | Primary key |
| `EVENT_TYPE` | TEXT | - | Event type identifier |
| `PAYLOAD` | JSONB | `'{}'` | Event data |
| `SOURCE_USER_ID` | UUID | - | User who triggered |
| `AFFECTED_CHUNKS` | TEXT[] | `'{}'` | Affected world chunks |
| `PRIORITY` | TEXT | `'MEDIUM'` | LOW, MEDIUM, HIGH, CRITICAL |
| `PROCESSED` | BOOLEAN | `false` | Processing flag |
| `CREATED_AT` | TIMESTAMPTZ | `NOW()` | Event timestamp |

---

### 3.5 `archive_partnerships`

Archive partnerships for district spawning.

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `ID` | UUID | `gen_random_uuid()` | Primary key |
| `PARTNER_NAME` | TEXT | - | Partner organization name |
| `PARTNER_TYPE` | TEXT | - | LIBRARY, MUSEUM, UNIVERSITY, GOVERNMENT, PRIVATE |
| `AESTHETIC_THEME` | TEXT | - | District visual theme |
| `DISTRICT_SECTOR_CODE` | TEXT | - | Reference to world_sectors |
| `ASSET_COUNT` | INTEGER | `0` | Assets contributed |
| `SIGNED_AT` | TIMESTAMPTZ | `NOW()` | Partnership date |
| `IS_ACTIVE` | BOOLEAN | `true` | Active status |
| `LOGO_URL` | TEXT | - | Partner logo |
| `DESCRIPTION` | TEXT | - | Partnership description |
| `WEBSITE_URL` | TEXT | - | Partner website |
| `CONTACT_EMAIL` | TEXT | - | Contact email |

---

## 4. GARD Tokenization System

### 4.1 `royalty_transactions`

Tracks all royalty-generating transactions.

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `ID` | UUID | `gen_random_uuid()` | Primary key |
| `ASSET_ID` | TEXT | - | Reference to asset |
| `TOKEN_ID` | TEXT | - | NFT token ID |
| `TRANSACTION_TYPE` | TEXT | - | SALE, LICENSE, GIFT |
| `SALE_PRICE` | NUMERIC(18,8) | - | Transaction price |
| `ROYALTY_AMOUNT` | NUMERIC(18,8) | - | Total royalty |
| `COMMUNITY_SHARE` | NUMERIC(18,8) | - | Community fund portion |
| `HOLDER_SHARE` | NUMERIC(18,8) | - | Shard holder portion |
| `MAINTENANCE_SHARE` | NUMERIC(18,8) | - | Platform portion |
| `SELLER_WALLET` | TEXT | - | Seller address |
| `BUYER_WALLET` | TEXT | - | Buyer address |
| `TX_HASH` | TEXT | - | Blockchain transaction hash |
| `BLOCK_NUMBER` | BIGINT | - | Block number |
| `CHAIN_ID` | INTEGER | `137` | Chain ID (default: Polygon) |
| `CREATED_AT` | TIMESTAMPTZ | `NOW()` | Transaction timestamp |

---

### 4.2 `shard_holdings`

Shard ownership ledger.

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `ID` | UUID | `gen_random_uuid()` | Primary key |
| `USER_ID` | UUID | - | Owner reference |
| `ASSET_ID` | TEXT | - | Asset reference |
| `TOKEN_ID` | TEXT | - | Token ID |
| `SHARD_COUNT` | INTEGER | - | Number of shards owned |
| `ACQUISITION_PRICE` | NUMERIC(18,8) | - | Purchase price |
| `ACQUISITION_DATE` | TIMESTAMPTZ | `NOW()` | Purchase date |
| `CURRENT_VALUE` | NUMERIC(18,8) | - | Current market value |
| `UNREALIZED_GAIN` | NUMERIC(18,8) | - | Unrealized profit/loss |

**Unique Constraint:** `(USER_ID, TOKEN_ID)`

---

### 4.3 `community_fund`

Community fund balance tracking.

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `ID` | UUID | `gen_random_uuid()` | Primary key |
| `BALANCE` | NUMERIC(18,8) | `0` | Current balance |
| `LAST_DEPOSIT_AT` | TIMESTAMPTZ | - | Last deposit time |
| `LAST_WITHDRAWAL_AT` | TIMESTAMPTZ | - | Last withdrawal time |
| `TOTAL_DEPOSITED` | NUMERIC(18,8) | `0` | Lifetime deposits |
| `TOTAL_WITHDRAWN` | NUMERIC(18,8) | `0` | Lifetime withdrawals |

---

### 4.4 `social_return_projects`

DAO-governed social return projects.

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `ID` | UUID | `gen_random_uuid()` | Primary key |
| `TITLE` | TEXT | - | Project title |
| `DESCRIPTION` | TEXT | - | Project description |
| `REQUESTED_AMOUNT` | NUMERIC(18,8) | - | Funding requested |
| `APPROVED_AMOUNT` | NUMERIC(18,8) | - | Funding approved |
| `STATUS` | TEXT | `'PROPOSED'` | PROPOSED, VOTING, APPROVED, FUNDED, COMPLETED, REJECTED |
| `VOTES_FOR` | INTEGER | `0` | Positive votes |
| `VOTES_AGAINST` | INTEGER | `0` | Negative votes |
| `VOTING_DEADLINE` | TIMESTAMPTZ | - | Voting end date |
| `PROPOSER_ID` | UUID | - | Proposer reference |
| `COMMUNITY_ID` | UUID | - | Community reference |
| `CREATED_AT` | TIMESTAMPTZ | `NOW()` | Creation time |
| `FUNDED_AT` | TIMESTAMPTZ | - | Funding time |
| `COMPLETED_AT` | TIMESTAMPTZ | - | Completion time |

---

### 4.5 `governance_votes`

DAO voting records.

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `ID` | UUID | `gen_random_uuid()` | Primary key |
| `PROJECT_ID` | UUID | - | Reference to project |
| `VOTER_ID` | UUID | - | Voter reference |
| `VOTE_WEIGHT` | NUMERIC(18,8) | - | Voting power (based on holdings) |
| `VOTE_DIRECTION` | BOOLEAN | - | true=for, false=against |
| `VOTED_AT` | TIMESTAMPTZ | `NOW()` | Vote timestamp |

**Unique Constraint:** `(PROJECT_ID, VOTER_ID)`

---

### 4.6 `gard_tokenized_assets`

Registry of tokenized assets.

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `ID` | UUID | `gen_random_uuid()` | Primary key |
| `ASSET_ID` | TEXT | - | Reference to asset (UNIQUE) |
| `NFT_TOKEN_ID` | TEXT | - | NFT token ID (UNIQUE) |
| `SHARD_COUNT` | INTEGER | `1000` | Total shards |
| `SHARD_PRICE_BASE` | NUMERIC(18,8) | - | Base shard price |
| `ROYALTY_RATE` | NUMERIC(5,4) | `0.1000` | Royalty rate (10%) |
| `CONTRIBUTOR_WALLET` | TEXT | - | Original contributor |
| `AI_QUALITY_SCORE` | NUMERIC(5,4) | - | AI-assessed quality |
| `GIS_PRECISION_SCORE` | NUMERIC(5,4) | - | GIS accuracy |
| `HISTORICAL_SIGNIFICANCE` | NUMERIC(5,4) | - | Historical value |
| `IS_GENESIS_ASSET` | BOOLEAN | `false` | Genesis collection flag |
| `RETAIL_DEMAND_DRIVEN` | BOOLEAN | `false` | Retail demand flag |
| `TOKENIZED_AT` | TIMESTAMPTZ | `NOW()` | Tokenization time |
| `LAST_TRADED_AT` | TIMESTAMPTZ | - | Last trade time |

---

### 4.7 `pending_rewards`

Pending rewards for shard holders.

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `ID` | UUID | `gen_random_uuid()` | Primary key |
| `USER_ID` | UUID | - | User reference (UNIQUE) |
| `PENDING_AMOUNT` | NUMERIC(18,8) | `0` | Unclaimed rewards |
| `LAST_CLAIMED_AT` | TIMESTAMPTZ | - | Last claim time |
| `TOTAL_CLAIMED` | NUMERIC(18,8) | `0` | Lifetime claimed |

---

## 5. Monitoring Views

### 5.1 `queue_stats`

Real-time queue statistics by status.

| Column | Type | Description |
|--------|------|-------------|
| `STATUS` | TEXT | Job status |
| `count` | BIGINT | Number of jobs |
| `avg_age_seconds` | NUMERIC | Average job age |
| `oldest_job` | TIMESTAMPTZ | Oldest job timestamp |
| `newest_job` | TIMESTAMPTZ | Newest job timestamp |
| `retry_attempts` | BIGINT | Jobs with retries |

---

### 5.2 `queue_health`

Queue health metrics for monitoring.

| Column | Type | Description |
|--------|------|-------------|
| `pending_count` | BIGINT | Pending jobs |
| `processing_count` | BIGINT | Processing jobs |
| `completed_last_hour` | BIGINT | Completed in last hour |
| `failed_last_hour` | BIGINT | Failed in last hour |
| `queue_status` | TEXT | HEALTHY, WARNING, CRITICAL |

---

### 5.3 `index_usage_stats`

Index usage monitoring for optimization.

| Column | Type | Description |
|--------|------|-------------|
| `schemaname` | TEXT | Schema name |
| `table_name` | TEXT | Table name |
| `index_name` | TEXT | Index name |
| `index_scans` | BIGINT | Number of scans |
| `tuples_read` | BIGINT | Tuples read |
| `tuples_fetched` | BIGINT | Tuples fetched |
| `index_size` | TEXT | Size (pretty) |

---

### 5.4 `cache_hit_stats`

Cache hit ratios for performance monitoring.

| Column | Type | Description |
|--------|------|-------------|
| `schemaname` | TEXT | Schema name |
| `table_name` | TEXT | Table name |
| `heap_blks_read` | BIGINT | Blocks read from disk |
| `heap_blks_hit` | BIGINT | Blocks read from cache |
| `cache_hit_ratio` | NUMERIC | Hit ratio percentage |

---

## Functions Reference

| Function | Parameters | Returns | Description |
|----------|------------|---------|-------------|
| `claim_processing_job` | `p_worker_id TEXT` | TABLE | Atomically claim next pending job |
| `complete_processing_job` | `p_job_id UUID, p_result_data JSONB` | BOOLEAN | Mark job as completed |
| `fail_processing_job` | `p_job_id UUID, p_error_message TEXT, p_error_code TEXT` | BOOLEAN | Mark job as failed/retry |
| `update_job_progress` | `p_job_id UUID, p_progress INTEGER, p_stage TEXT` | BOOLEAN | Update job progress |
| `release_stale_locks` | - | INTEGER | Release expired worker locks |
| `get_sector_presence` | `p_sector TEXT` | TABLE | Get online users in sector |
| `cleanup_stale_presence` | - | INTEGER | Remove stale presence sessions |
| `find_structured_mapping` | `p_cluster_type TEXT, p_dimension_name TEXT, p_raw_value TEXT, p_min_confidence NUMERIC` | TABLE | Find structured value for raw input |
| `update_bundle_asset_count` | - | TRIGGER | Auto-update bundle asset counts |
| `initialize_user_avatar` | - | TRIGGER | Auto-create avatar on user signup |

---

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| 3.0.0 | 2026-02-04 | Consolidated schema, unified column naming (uppercase), comprehensive documentation |
| 2.8.1 | 2025-12-XX | Added structured cluster columns, vector embeddings |
| 2.8.0 | 2025-11-XX | Added processing queue, GARD tokenization |
