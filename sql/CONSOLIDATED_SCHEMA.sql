-- =============================================
-- LOADOPOLY-OCR CONSOLIDATED DATABASE SCHEMA
-- =============================================
-- Version: 3.1.0
-- Last Updated: 2026-02-22
--
-- This is the SINGLE SOURCE OF TRUTH for the Loadopoly-OCR database schema.
-- Run this script to set up a fresh Supabase project or verify existing schema.
--
-- This script is IDEMPOTENT - safe to run multiple times.
--
-- MODULES:
--   1.  Extensions (vector, PostGIS, pg_net, pg_cron)
--   2.  Core Tables (historical_documents_global, processing_queue)
--   3.  Classification System (structured_clusters, mappings)
--   4.  Avatar & Presence (user_avatars, presence_sessions, world_sectors)
--   5.  GARD Tokenization (royalty_transactions, shard_holdings, etc.)
--   6.  Bundles (digital_asset_bundles)
--   7.  Spatial Anchors (GPS + compass captures)
--   8.  Knowledge Graph (graph_nodes, graph_edges, asset_graph_nodes)
--   9.  Functions & Triggers
--   10. Row Level Security Policies (incl. DELETE lockdown)
--   11. Performance Indexes
--   12. Monitoring Views
--   13. Storage Bucket Policies
-- =============================================

BEGIN;

-- ============================================
-- 1. EXTENSIONS
-- ============================================

CREATE EXTENSION IF NOT EXISTS vector;

-- Create extensions schema for cleaner organization
CREATE SCHEMA IF NOT EXISTS extensions;

-- Move vector to extensions schema if in public
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_extension e 
    JOIN pg_namespace n ON e.extnamespace = n.oid 
    WHERE e.extname = 'vector' AND n.nspname = 'public'
  ) THEN
    ALTER EXTENSION vector SET SCHEMA extensions;
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL; -- Ignore if can't move
END $$;

-- PostGIS for geospatial operations (spatial anchors, graph nodes)
CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA extensions;

-- pg_net for async HTTP calls (auto-processing trigger)
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

GRANT USAGE ON SCHEMA extensions TO authenticated, service_role, anon;

-- ============================================
-- 2. CORE TABLES
-- ============================================

-- 2.1 Processing Queue
-- Server-side queue for OCR processing jobs
CREATE TABLE IF NOT EXISTS processing_queue (
    "ID" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Job Identification
    "USER_ID" UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    "ASSET_ID" TEXT NOT NULL,
    "IMAGE_PATH" TEXT NOT NULL,
    
    -- Processing Configuration
    "SCAN_TYPE" TEXT NOT NULL DEFAULT 'DOCUMENT',
    "PRIORITY" INTEGER NOT NULL DEFAULT 5 CHECK ("PRIORITY" BETWEEN 1 AND 10),
    
    -- Location Data
    "LATITUDE" DOUBLE PRECISION,
    "LONGITUDE" DOUBLE PRECISION,
    
    -- Status Management
    "STATUS" TEXT NOT NULL DEFAULT 'PENDING' CHECK (
        "STATUS" IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED')
    ),
    
    -- Progress Tracking
    "PROGRESS" INTEGER DEFAULT 0 CHECK ("PROGRESS" BETWEEN 0 AND 100),
    "STAGE" TEXT DEFAULT 'QUEUED',
    
    -- Error Handling & Retries
    "RETRY_COUNT" INTEGER DEFAULT 0,
    "MAX_RETRIES" INTEGER DEFAULT 3,
    "LAST_ERROR" TEXT,
    "ERROR_CODE" TEXT,
    
    -- Worker Assignment
    "WORKER_ID" TEXT,
    "LOCKED_AT" TIMESTAMPTZ,
    "LOCK_TIMEOUT_SECONDS" INTEGER DEFAULT 120,
    
    -- Timestamps
    "CREATED_AT" TIMESTAMPTZ DEFAULT NOW(),
    "STARTED_AT" TIMESTAMPTZ,
    "COMPLETED_AT" TIMESTAMPTZ,
    "UPDATED_AT" TIMESTAMPTZ DEFAULT NOW(),
    
    -- Result Storage
    "RESULT_DATA" JSONB,
    "METADATA" JSONB DEFAULT '{}'::jsonb
);

-- 2.2 Digital Asset Bundles
-- Consolidated metadata for deduplicated assets
CREATE TABLE IF NOT EXISTS digital_asset_bundles (
    "ID" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "USER_ID" UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    "TITLE" TEXT NOT NULL,
    "DESCRIPTION" TEXT,
    "CONSOLIDATED_METADATA" JSONB DEFAULT '{}',
    "IMAGE_URLS" TEXT[] DEFAULT '{}',
    "ASSET_COUNT" INTEGER DEFAULT 1,
    "IS_AUTO_GENERATED" BOOLEAN DEFAULT false,
    "CREATED_AT" TIMESTAMPTZ DEFAULT NOW(),
    "UPDATED_AT" TIMESTAMPTZ DEFAULT NOW()
);

  -- 2.3 Master User Access Control
  -- Users listed here can access the shared/master corpus and graph datasets.
  CREATE TABLE IF NOT EXISTS master_user_access (
    "USER_ID" UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    "CAN_ACCESS_CORPUS" BOOLEAN NOT NULL DEFAULT true,
    "CAN_MANAGE_ACCESS" BOOLEAN NOT NULL DEFAULT false,
    "CREATED_AT" TIMESTAMPTZ DEFAULT NOW(),
    "UPDATED_AT" TIMESTAMPTZ DEFAULT NOW()
  );

-- ============================================
-- 3. CLASSIFICATION SYSTEM
-- ============================================

-- 3.1 Structured Clusters
-- Stores learned classification mappings for LLM-synchronized dimensions
CREATE TABLE IF NOT EXISTS structured_clusters (
    "ID" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "CLUSTER_TYPE" TEXT NOT NULL CHECK ("CLUSTER_TYPE" IN (
        'TEMPORAL', 'SPATIAL', 'CONTENT', 
        'KNOWLEDGE_GRAPH', 'PROVENANCE', 'DISCOVERY'
    )),
    "DIMENSION_NAME" TEXT NOT NULL,
    "STRUCTURED_VALUE" TEXT NOT NULL,
    "VALUE_DESCRIPTION" TEXT,
    "SAMPLE_ASSET_IDS" TEXT[] DEFAULT '{}',
    "ASSET_COUNT" INTEGER DEFAULT 0,
    "CREATED_AT" TIMESTAMPTZ DEFAULT NOW(),
    "UPDATED_AT" TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE("CLUSTER_TYPE", "DIMENSION_NAME", "STRUCTURED_VALUE")
);

-- 3.2 Classification Mappings
-- Stores learned correlations between unstructured and structured values
CREATE TABLE IF NOT EXISTS structured_classification_mappings (
    "ID" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "CLUSTER_TYPE" TEXT NOT NULL CHECK ("CLUSTER_TYPE" IN (
        'TEMPORAL', 'SPATIAL', 'CONTENT', 
        'KNOWLEDGE_GRAPH', 'PROVENANCE', 'DISCOVERY'
    )),
    "DIMENSION_NAME" TEXT NOT NULL,
    "RAW_VALUE" TEXT NOT NULL,
    "RAW_VALUE_NORMALIZED" TEXT NOT NULL,
    "STRUCTURED_VALUE" TEXT NOT NULL,
    "MAPPING_TYPE" TEXT CHECK ("MAPPING_TYPE" IN (
        'EXACT', 'SYNONYM', 'PARENT', 'CHILD', 'RELATED', 'LEARNED'
    )) DEFAULT 'LEARNED',
    "CONFIDENCE" NUMERIC(4,3) NOT NULL,
    "OCCURRENCE_COUNT" INTEGER DEFAULT 1,
    "FIRST_OBSERVED" TIMESTAMPTZ DEFAULT NOW(),
    "LAST_OBSERVED" TIMESTAMPTZ DEFAULT NOW(),
    "CREATED_BY_LLM" TEXT NOT NULL,
    "CREATED_AT" TIMESTAMPTZ DEFAULT NOW(),
    "IS_VALIDATED" BOOLEAN DEFAULT FALSE,
    "VALIDATED_BY" UUID REFERENCES auth.users(id),
    "VALIDATED_AT" TIMESTAMPTZ,
    
    UNIQUE("CLUSTER_TYPE", "DIMENSION_NAME", "RAW_VALUE_NORMALIZED", "STRUCTURED_VALUE")
);

-- 3.3 Classification Audit Log
CREATE TABLE IF NOT EXISTS classification_audit_log (
    "ID" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "ASSET_ID" TEXT,
    "CLUSTER_TYPE" TEXT NOT NULL,
    "PREVIOUS_VALUE" JSONB,
    "NEW_VALUE" JSONB,
    "CHANGE_TYPE" TEXT CHECK ("CHANGE_TYPE" IN ('CREATE', 'UPDATE', 'DELETE', 'BULK_SYNC')),
    "LLM_USED" TEXT NOT NULL,
    "PROMPT_HASH" TEXT,
    "BATCH_ID" UUID,
    "CREATED_BY" UUID REFERENCES auth.users(id),
    "CREATED_AT" TIMESTAMPTZ DEFAULT NOW()
);

-- 3.4 Cluster Dimension Statistics
CREATE TABLE IF NOT EXISTS cluster_dimension_statistics (
    "ID" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "CLUSTER_TYPE" TEXT NOT NULL,
    "DIMENSION_NAME" TEXT NOT NULL,
    "STRUCTURED_VALUE" TEXT NOT NULL,
    "OCCURRENCE_COUNT" INTEGER DEFAULT 0,
    "PERCENTAGE_OF_CORPUS" NUMERIC(5,2) DEFAULT 0,
    "CO_OCCURS_WITH" JSONB DEFAULT '{}',
    "FIRST_USED" TIMESTAMPTZ DEFAULT NOW(),
    "LAST_USED" TIMESTAMPTZ DEFAULT NOW(),
    "USAGE_TREND" TEXT CHECK ("USAGE_TREND" IN ('INCREASING', 'STABLE', 'DECREASING')),
    "UPDATED_AT" TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE("CLUSTER_TYPE", "DIMENSION_NAME", "STRUCTURED_VALUE")
);

-- ============================================
-- 4. AVATAR & PRESENCE SYSTEM
-- ============================================

-- 4.1 User Avatars
CREATE TABLE IF NOT EXISTS user_avatars (
    "ID" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "USER_ID" UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
    "DISPLAY_NAME" TEXT,
    "AVATAR_MODEL" TEXT DEFAULT 'default_explorer',
    "AVATAR_COLOR" TEXT DEFAULT '#6366f1',
    "LAST_POSITION" FLOAT[3] DEFAULT '{0, 0, 0}',
    "LAST_ROTATION" FLOAT[4] DEFAULT '{0, 0, 0, 1}',
    "LAST_SECTOR" TEXT DEFAULT 'ORIGIN',
    "CONTRIBUTION_LEVEL" INTEGER DEFAULT 1,
    "TOTAL_NODES_CREATED" INTEGER DEFAULT 0,
    "TOTAL_SHARDS_EARNED" NUMERIC(18,8) DEFAULT 0,
    "EXPLORATION_POINTS" INTEGER DEFAULT 0,
    "BADGES" JSONB DEFAULT '[]',
    "CREATED_AT" TIMESTAMPTZ DEFAULT NOW(),
    "LAST_SEEN" TIMESTAMPTZ DEFAULT NOW()
);

-- 4.2 Presence Sessions
CREATE TABLE IF NOT EXISTS presence_sessions (
    "ID" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "USER_ID" UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    "SESSION_ID" TEXT NOT NULL UNIQUE,
    "SECTOR" TEXT DEFAULT 'ORIGIN',
    "WORLD_POSITION" FLOAT[3] DEFAULT '{0, 0, 0}',
    "STATUS" TEXT CHECK ("STATUS" IN ('ACTIVE', 'IDLE', 'AWAY')) DEFAULT 'ACTIVE',
    "HEARTBEAT_AT" TIMESTAMPTZ DEFAULT NOW(),
    "CREATED_AT" TIMESTAMPTZ DEFAULT NOW()
);

-- 4.3 World Sectors
CREATE TABLE IF NOT EXISTS world_sectors (
    "ID" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "SECTOR_CODE" TEXT UNIQUE NOT NULL,
    "DISPLAY_NAME" TEXT NOT NULL DEFAULT 'Sector',
    "CENTER_X" FLOAT DEFAULT 0,
    "CENTER_Y" FLOAT DEFAULT 0,
    "CENTER_Z" FLOAT DEFAULT 0,
    "RADIUS" FLOAT DEFAULT 100,
    "AESTHETIC_THEME" TEXT CHECK ("AESTHETIC_THEME" IN (
        'VICTORIAN_LIBRARY', 'BRUTALIST_ARCHIVE', 'DIGITAL_NEON',
        'ORGANIC_GROWTH', 'INDUSTRIAL_HERITAGE', 'ACADEMIC_QUADRANGLE',
        'SACRED_GEOMETRY', 'CYBERPUNK_FRONTIER'
    )) DEFAULT 'DIGITAL_NEON',
    "ZONE_TYPE" TEXT CHECK ("ZONE_TYPE" IN (
        'URBAN_CORE', 'KNOWLEDGE_DISTRICT', 'DATA_SUBURBS',
        'FRONTIER_ZONE', 'ARCHIVE_RUINS', 'INSTITUTIONAL_HQ',
        'MARKETPLACE', 'COMMUNITY_PLAZA'
    )) DEFAULT 'URBAN_CORE',
    "SOURCE_CLUSTER_ID" TEXT,
    "NODE_COUNT" INTEGER DEFAULT 0,
    "ASSET_COUNT" INTEGER DEFAULT 0,
    "CREATED_AT" TIMESTAMPTZ DEFAULT NOW(),
    "UPDATED_AT" TIMESTAMPTZ DEFAULT NOW()
);

-- 4.4 Realtime Events
CREATE TABLE IF NOT EXISTS realtime_events (
    "ID" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "EVENT_TYPE" TEXT NOT NULL,
    "PAYLOAD" JSONB NOT NULL DEFAULT '{}',
    "SOURCE_USER_ID" UUID REFERENCES auth.users(id),
    "AFFECTED_CHUNKS" TEXT[] DEFAULT '{}',
    "PRIORITY" TEXT CHECK ("PRIORITY" IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')) DEFAULT 'MEDIUM',
    "PROCESSED" BOOLEAN DEFAULT FALSE,
    "CREATED_AT" TIMESTAMPTZ DEFAULT NOW()
);

-- 4.5 Archive Partnerships
CREATE TABLE IF NOT EXISTS archive_partnerships (
    "ID" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "PARTNER_NAME" TEXT NOT NULL,
    "PARTNER_TYPE" TEXT CHECK ("PARTNER_TYPE" IN ('LIBRARY', 'MUSEUM', 'UNIVERSITY', 'GOVERNMENT', 'PRIVATE')),
    "AESTHETIC_THEME" TEXT,
    "DISTRICT_SECTOR_CODE" TEXT REFERENCES world_sectors("SECTOR_CODE"),
    "ASSET_COUNT" INTEGER DEFAULT 0,
    "SIGNED_AT" TIMESTAMPTZ DEFAULT NOW(),
    "IS_ACTIVE" BOOLEAN DEFAULT TRUE,
    "LOGO_URL" TEXT,
    "DESCRIPTION" TEXT,
    "WEBSITE_URL" TEXT,
    "CONTACT_EMAIL" TEXT
);

-- ============================================
-- 5. GARD TOKENIZATION SYSTEM
-- ============================================

-- 5.1 Royalty Transactions
CREATE TABLE IF NOT EXISTS royalty_transactions (
    "ID" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "ASSET_ID" TEXT,
    "TOKEN_ID" TEXT NOT NULL,
    "TRANSACTION_TYPE" TEXT CHECK ("TRANSACTION_TYPE" IN ('SALE', 'LICENSE', 'GIFT')),
    "SALE_PRICE" NUMERIC(18,8) NOT NULL,
    "ROYALTY_AMOUNT" NUMERIC(18,8) NOT NULL,
    "COMMUNITY_SHARE" NUMERIC(18,8),
    "HOLDER_SHARE" NUMERIC(18,8),
    "MAINTENANCE_SHARE" NUMERIC(18,8),
    "SELLER_WALLET" TEXT NOT NULL,
    "BUYER_WALLET" TEXT NOT NULL,
    "TX_HASH" TEXT,
    "BLOCK_NUMBER" BIGINT,
    "CHAIN_ID" INTEGER DEFAULT 137,
    "CREATED_AT" TIMESTAMPTZ DEFAULT NOW()
);

-- 5.2 Shard Holdings
CREATE TABLE IF NOT EXISTS shard_holdings (
    "ID" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "USER_ID" UUID REFERENCES auth.users(id),
    "ASSET_ID" TEXT,
    "TOKEN_ID" TEXT NOT NULL,
    "SHARD_COUNT" INTEGER NOT NULL,
    "ACQUISITION_PRICE" NUMERIC(18,8),
    "ACQUISITION_DATE" TIMESTAMPTZ DEFAULT NOW(),
    "CURRENT_VALUE" NUMERIC(18,8),
    "UNREALIZED_GAIN" NUMERIC(18,8),
    
    UNIQUE("USER_ID", "TOKEN_ID")
);

-- 5.3 Community Fund
CREATE TABLE IF NOT EXISTS community_fund (
    "ID" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "BALANCE" NUMERIC(18,8) DEFAULT 0,
    "LAST_DEPOSIT_AT" TIMESTAMPTZ,
    "LAST_WITHDRAWAL_AT" TIMESTAMPTZ,
    "TOTAL_DEPOSITED" NUMERIC(18,8) DEFAULT 0,
    "TOTAL_WITHDRAWN" NUMERIC(18,8) DEFAULT 0
);

-- Initialize community fund
INSERT INTO community_fund ("ID", "BALANCE", "TOTAL_DEPOSITED", "TOTAL_WITHDRAWN")
VALUES (gen_random_uuid(), 0, 0, 0)
ON CONFLICT DO NOTHING;

-- 5.4 Social Return Projects
CREATE TABLE IF NOT EXISTS social_return_projects (
    "ID" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "TITLE" TEXT NOT NULL,
    "DESCRIPTION" TEXT,
    "REQUESTED_AMOUNT" NUMERIC(18,8) NOT NULL,
    "APPROVED_AMOUNT" NUMERIC(18,8),
    "STATUS" TEXT CHECK ("STATUS" IN ('PROPOSED', 'VOTING', 'APPROVED', 'FUNDED', 'COMPLETED', 'REJECTED')) DEFAULT 'PROPOSED',
    "VOTES_FOR" INTEGER DEFAULT 0,
    "VOTES_AGAINST" INTEGER DEFAULT 0,
    "VOTING_DEADLINE" TIMESTAMPTZ,
    "PROPOSER_ID" UUID REFERENCES auth.users(id),
    "COMMUNITY_ID" UUID,
    "CREATED_AT" TIMESTAMPTZ DEFAULT NOW(),
    "FUNDED_AT" TIMESTAMPTZ,
    "COMPLETED_AT" TIMESTAMPTZ
);

-- 5.5 Governance Votes
CREATE TABLE IF NOT EXISTS governance_votes (
    "ID" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "PROJECT_ID" UUID REFERENCES social_return_projects("ID"),
    "VOTER_ID" UUID REFERENCES auth.users(id),
    "VOTE_WEIGHT" NUMERIC(18,8) NOT NULL,
    "VOTE_DIRECTION" BOOLEAN NOT NULL,
    "VOTED_AT" TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE("PROJECT_ID", "VOTER_ID")
);

-- 5.6 GARD Tokenized Assets
CREATE TABLE IF NOT EXISTS gard_tokenized_assets (
    "ID" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "ASSET_ID" TEXT UNIQUE,
    "NFT_TOKEN_ID" TEXT NOT NULL UNIQUE,
    "SHARD_COUNT" INTEGER DEFAULT 1000,
    "SHARD_PRICE_BASE" NUMERIC(18,8) NOT NULL,
    "ROYALTY_RATE" NUMERIC(5,4) DEFAULT 0.1000,
    "CONTRIBUTOR_WALLET" TEXT NOT NULL,
    "AI_QUALITY_SCORE" NUMERIC(5,4),
    "GIS_PRECISION_SCORE" NUMERIC(5,4),
    "HISTORICAL_SIGNIFICANCE" NUMERIC(5,4),
    "IS_GENESIS_ASSET" BOOLEAN DEFAULT FALSE,
    "RETAIL_DEMAND_DRIVEN" BOOLEAN DEFAULT FALSE,
    "TOKENIZED_AT" TIMESTAMPTZ DEFAULT NOW(),
    "LAST_TRADED_AT" TIMESTAMPTZ
);

-- 5.7 Pending Rewards
CREATE TABLE IF NOT EXISTS pending_rewards (
    "ID" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "USER_ID" UUID REFERENCES auth.users(id) UNIQUE,
    "PENDING_AMOUNT" NUMERIC(18,8) DEFAULT 0,
    "LAST_CLAIMED_AT" TIMESTAMPTZ,
    "TOTAL_CLAIMED" NUMERIC(18,8) DEFAULT 0
);

-- ============================================
-- 6. SPATIAL ANCHORS
-- ============================================
-- GPS + compass data captured at photo time for each recognized object.
-- Enables cross-session triangulation and GIS-based Knowledge Graph enrichment.

CREATE TABLE IF NOT EXISTS spatial_anchors (
  "ID"                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "CREATED_AT"            TIMESTAMPTZ NOT NULL DEFAULT now(),
  "USER_ID"               UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  "ASSET_ID"              UUID,
  "CAPTURE_SESSION_ID"    TEXT,
  "DEVICE_LAT"            DOUBLE PRECISION NOT NULL,
  "DEVICE_LNG"            DOUBLE PRECISION NOT NULL,
  "DEVICE_ALT_M"          DOUBLE PRECISION DEFAULT 0,
  "DEVICE_ACCURACY_M"     DOUBLE PRECISION,
  "COMPASS_HEADING_DEG"   DOUBLE PRECISION NOT NULL,
  "DEVICE_PITCH_DEG"      DOUBLE PRECISION DEFAULT 0,
  "DEVICE_ROLL_DEG"       DOUBLE PRECISION DEFAULT 0,
  "FOV_HORIZONTAL_DEG"    DOUBLE PRECISION DEFAULT 60,
  "FOV_VERTICAL_DEG"      DOUBLE PRECISION DEFAULT 45,
  "IMAGE_WIDTH_PX"        INTEGER DEFAULT 1920,
  "IMAGE_HEIGHT_PX"       INTEGER DEFAULT 1080,
  "BBOX_X"                DOUBLE PRECISION,
  "BBOX_Y"                DOUBLE PRECISION,
  "BBOX_W"                DOUBLE PRECISION,
  "BBOX_H"                DOUBLE PRECISION,
  "RECOGNIZED_TEXT"        TEXT,
  "RECOGNIZED_LABEL"       TEXT,
  "RECOGNITION_CONFIDENCE" DOUBLE PRECISION,
  "SUBJECT_LAT"           DOUBLE PRECISION,
  "SUBJECT_LNG"           DOUBLE PRECISION,
  "SUBJECT_ALT_M"         DOUBLE PRECISION,
  "SUBJECT_BEARING_DEG"   DOUBLE PRECISION,
  "SUBJECT_DISTANCE_M"    DOUBLE PRECISION,
  "TRIANGULATION_COUNT"   INTEGER DEFAULT 0,
  "TRIANGULATION_RMSE_M"  DOUBLE PRECISION,
  "GRAPH_NODE_ID"         UUID,
  "PROCESSING_STATUS"     TEXT DEFAULT 'pending'
                          CHECK ("PROCESSING_STATUS" IN ('pending', 'processed', 'triangulated', 'failed'))
);

-- PostGIS geometry columns (conditional — table works without PostGIS)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'postgis') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'spatial_anchors' AND column_name = 'DEVICE_POINT'
    ) THEN
      ALTER TABLE spatial_anchors ADD COLUMN "DEVICE_POINT" extensions.geometry(Point, 4326);
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'spatial_anchors' AND column_name = 'SUBJECT_POINT'
    ) THEN
      ALTER TABLE spatial_anchors ADD COLUMN "SUBJECT_POINT" extensions.geometry(Point, 4326);
    END IF;
  END IF;
END $$;

COMMENT ON TABLE spatial_anchors IS
  'GPS + compass + FOV data captured per recognized object. Subject coordinates computed by spatial-coordinates Edge Function.';

-- ============================================
-- 7. KNOWLEDGE GRAPH
-- ============================================
-- Persistent entity graph derived from OCR content and spatial anchors.

CREATE TABLE IF NOT EXISTS graph_nodes (
  "ID"                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "CREATED_AT"        TIMESTAMPTZ NOT NULL DEFAULT now(),
  "UPDATED_AT"        TIMESTAMPTZ NOT NULL DEFAULT now(),
  "LABEL"             TEXT NOT NULL,
  "CANONICAL_ID"      TEXT,
  "NODE_TYPE"         TEXT NOT NULL DEFAULT 'entity'
                      CHECK ("NODE_TYPE" IN (
                        'entity', 'location', 'person', 'organization',
                        'concept', 'document', 'spatial'
                      )),
  "LAT"               DOUBLE PRECISION,
  "LNG"               DOUBLE PRECISION,
  "ALT_M"             DOUBLE PRECISION,
  "ASSET_COUNT"       INTEGER NOT NULL DEFAULT 0,
  "ANCHOR_COUNT"      INTEGER NOT NULL DEFAULT 0,
  "FIRST_SEEN_AT"     TIMESTAMPTZ NOT NULL DEFAULT now(),
  "LAST_SEEN_AT"      TIMESTAMPTZ NOT NULL DEFAULT now(),
  "DESCRIPTION"       TEXT,
  "ALIASES"           TEXT[],
  "WIKIPEDIA_URL"     TEXT,
  "WIKIDATA_QID"      TEXT,
  "GRAPH_PROCESSED"   BOOLEAN NOT NULL DEFAULT false,
  "USER_ID"           UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  UNIQUE ("NODE_TYPE", "CANONICAL_ID")
);

-- PostGIS geometry column (conditional)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'postgis') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'graph_nodes' AND column_name = 'GEO_POINT'
    ) THEN
      ALTER TABLE graph_nodes ADD COLUMN "GEO_POINT" extensions.geometry(Point, 4326);
    END IF;
  END IF;
END $$;

-- pgvector embedding column (conditional)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'graph_nodes' AND column_name = 'EMBEDDING'
    ) THEN
      ALTER TABLE graph_nodes ADD COLUMN "EMBEDDING" VECTOR(768);
    END IF;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS graph_edges (
  "ID"                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "CREATED_AT"        TIMESTAMPTZ NOT NULL DEFAULT now(),
  "FROM_NODE_ID"      UUID NOT NULL REFERENCES graph_nodes("ID") ON DELETE CASCADE,
  "TO_NODE_ID"        UUID NOT NULL REFERENCES graph_nodes("ID") ON DELETE CASCADE,
  "RELATIONSHIP"      TEXT NOT NULL,
  "WEIGHT"            DOUBLE PRECISION DEFAULT 1.0,
  "CONFIDENCE"        DOUBLE PRECISION DEFAULT 0.5,
  "IS_SPATIAL"        BOOLEAN DEFAULT false,
  "ASSET_IDS"         UUID[] DEFAULT '{}',
  UNIQUE ("FROM_NODE_ID", "TO_NODE_ID", "RELATIONSHIP")
);

CREATE TABLE IF NOT EXISTS asset_graph_nodes (
  "ASSET_ID"          UUID NOT NULL,
  "NODE_ID"           UUID NOT NULL REFERENCES graph_nodes("ID") ON DELETE CASCADE,
  "CREATED_AT"        TIMESTAMPTZ NOT NULL DEFAULT now(),
  "CONFIDENCE"        DOUBLE PRECISION DEFAULT 1.0,
  "CONTEXT_SNIPPET"   TEXT,
  PRIMARY KEY ("ASSET_ID", "NODE_ID")
);

COMMENT ON TABLE graph_nodes IS
  'Persistent entity graph nodes. NODE_TYPE=location nodes carry PostGIS geometry. GRAPH_PROCESSED=false rows are picked up by kg-backfill.';
COMMENT ON TABLE graph_edges IS
  'Directed relationships between graph_nodes. IS_SPATIAL=true indicates triangulation-derived edge.';
COMMENT ON TABLE asset_graph_nodes IS
  'Junction table linking digital assets to graph nodes they mention.';

-- ============================================
-- 8. EXTEND HISTORICAL_DOCUMENTS_GLOBAL
-- ============================================
-- Add columns if the table exists (created externally)

DO $$ 
BEGIN
    -- Vector Embeddings
    ALTER TABLE historical_documents_global ADD COLUMN IF NOT EXISTS "TEXT_EMBEDDING" vector(768);
    ALTER TABLE historical_documents_global ADD COLUMN IF NOT EXISTS "IMAGE_EMBEDDING" vector(512);
    ALTER TABLE historical_documents_global ADD COLUMN IF NOT EXISTS "COMBINED_EMBEDDING" vector(768);
    ALTER TABLE historical_documents_global ADD COLUMN IF NOT EXISTS "EMBEDDING_MODEL" TEXT DEFAULT 'gemini-embedding-001';
    ALTER TABLE historical_documents_global ADD COLUMN IF NOT EXISTS "EMBEDDING_UPDATED_AT" TIMESTAMPTZ;
    
    -- Structured Classification
    ALTER TABLE historical_documents_global ADD COLUMN IF NOT EXISTS "STRUCTURED_TEMPORAL" JSONB;
    ALTER TABLE historical_documents_global ADD COLUMN IF NOT EXISTS "STRUCTURED_SPATIAL" JSONB;
    ALTER TABLE historical_documents_global ADD COLUMN IF NOT EXISTS "STRUCTURED_CONTENT" JSONB;
    ALTER TABLE historical_documents_global ADD COLUMN IF NOT EXISTS "STRUCTURED_KNOWLEDGE_GRAPH" JSONB;
    ALTER TABLE historical_documents_global ADD COLUMN IF NOT EXISTS "STRUCTURED_PROVENANCE" JSONB;
    ALTER TABLE historical_documents_global ADD COLUMN IF NOT EXISTS "STRUCTURED_DISCOVERY" JSONB;
    ALTER TABLE historical_documents_global ADD COLUMN IF NOT EXISTS "CLASSIFICATION_LLM" TEXT;
    ALTER TABLE historical_documents_global ADD COLUMN IF NOT EXISTS "CLASSIFICATION_DATE" TIMESTAMPTZ;
    ALTER TABLE historical_documents_global ADD COLUMN IF NOT EXISTS "CLASSIFICATION_VERSION" TEXT;
    ALTER TABLE historical_documents_global ADD COLUMN IF NOT EXISTS "CLASSIFICATION_CONFIDENCE" NUMERIC(4,3);
    
    -- Bundle Support
    ALTER TABLE historical_documents_global ADD COLUMN IF NOT EXISTS "BUNDLE_ID" UUID REFERENCES digital_asset_bundles("ID") ON DELETE SET NULL;
    
EXCEPTION WHEN undefined_table THEN
    RAISE NOTICE 'historical_documents_global table does not exist yet - will add columns when table is created';
END $$;

-- ============================================
-- 9. FUNCTIONS
-- ============================================

-- 9.1 Claim Processing Job
CREATE OR REPLACE FUNCTION claim_processing_job(p_worker_id TEXT)
RETURNS TABLE (
    id UUID,
    asset_id TEXT,
    image_path TEXT,
    scan_type TEXT,
    user_id UUID,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    metadata JSONB
)
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    v_job_id UUID;
BEGIN
    UPDATE public.processing_queue
    SET 
        "STATUS" = 'PROCESSING',
        "WORKER_ID" = p_worker_id,
        "LOCKED_AT" = NOW(),
        "STARTED_AT" = COALESCE("STARTED_AT", NOW()),
        "UPDATED_AT" = NOW(),
        "PROGRESS" = 10,
        "STAGE" = 'CLAIMED'
    WHERE "ID" = (
        SELECT "ID" FROM public.processing_queue
        WHERE "STATUS" = 'PENDING'
        ORDER BY "PRIORITY" DESC, "CREATED_AT" ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
    )
    RETURNING "ID" INTO v_job_id;
    
    IF v_job_id IS NULL THEN
        RETURN;
    END IF;
    
    RETURN QUERY
    SELECT 
        pq."ID",
        pq."ASSET_ID",
        pq."IMAGE_PATH",
        pq."SCAN_TYPE",
        pq."USER_ID",
        pq."LATITUDE",
        pq."LONGITUDE",
        pq."METADATA"
    FROM public.processing_queue pq
    WHERE pq."ID" = v_job_id;
END;
$$;

-- 7.2 Complete Processing Job
CREATE OR REPLACE FUNCTION complete_processing_job(p_job_id UUID, p_result_data JSONB)
RETURNS BOOLEAN
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    UPDATE public.processing_queue
    SET 
        "STATUS" = 'COMPLETED',
        "COMPLETED_AT" = NOW(),
        "UPDATED_AT" = NOW(),
        "PROGRESS" = 100,
        "STAGE" = 'COMPLETED',
        "RESULT_DATA" = p_result_data,
        "WORKER_ID" = NULL,
        "LOCKED_AT" = NULL
    WHERE "ID" = p_job_id AND "STATUS" = 'PROCESSING';
    
    RETURN FOUND;
END;
$$;

-- 7.3 Fail Processing Job
CREATE OR REPLACE FUNCTION fail_processing_job(p_job_id UUID, p_error_message TEXT, p_error_code TEXT DEFAULT 'UNKNOWN')
RETURNS BOOLEAN
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    v_retry_count INTEGER;
    v_max_retries INTEGER;
BEGIN
    SELECT "RETRY_COUNT", "MAX_RETRIES" INTO v_retry_count, v_max_retries
    FROM public.processing_queue WHERE "ID" = p_job_id;
    
    IF v_retry_count < v_max_retries THEN
        UPDATE public.processing_queue
        SET 
            "STATUS" = 'PENDING',
            "RETRY_COUNT" = "RETRY_COUNT" + 1,
            "LAST_ERROR" = p_error_message,
            "ERROR_CODE" = p_error_code,
            "UPDATED_AT" = NOW(),
            "PROGRESS" = 0,
            "STAGE" = 'RETRY_QUEUED',
            "WORKER_ID" = NULL,
            "LOCKED_AT" = NULL,
            "PRIORITY" = GREATEST(1, "PRIORITY" - 1)
        WHERE "ID" = p_job_id;
    ELSE
        UPDATE public.processing_queue
        SET 
            "STATUS" = 'FAILED',
            "COMPLETED_AT" = NOW(),
            "UPDATED_AT" = NOW(),
            "LAST_ERROR" = p_error_message,
            "ERROR_CODE" = p_error_code,
            "STAGE" = 'FAILED_FINAL',
            "WORKER_ID" = NULL,
            "LOCKED_AT" = NULL
        WHERE "ID" = p_job_id;
    END IF;
    
    RETURN FOUND;
END;
$$;

-- 7.4 Update Job Progress
CREATE OR REPLACE FUNCTION update_job_progress(p_job_id UUID, p_progress INTEGER, p_stage TEXT DEFAULT NULL)
RETURNS BOOLEAN
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    UPDATE public.processing_queue
    SET 
        "PROGRESS" = p_progress,
        "STAGE" = COALESCE(p_stage, "STAGE"),
        "UPDATED_AT" = NOW(),
        "LOCKED_AT" = NOW()
    WHERE "ID" = p_job_id AND "STATUS" = 'PROCESSING';
    
    RETURN FOUND;
END;
$$;

-- 7.5 Release Stale Locks
CREATE OR REPLACE FUNCTION release_stale_locks()
RETURNS INTEGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    released_count INTEGER;
BEGIN
    UPDATE public.processing_queue
    SET 
        "STATUS" = 'PENDING',
        "WORKER_ID" = NULL,
        "LOCKED_AT" = NULL,
        "STAGE" = 'LOCK_EXPIRED'
    WHERE "STATUS" = 'PROCESSING'
      AND "LOCKED_AT" < NOW() - ("LOCK_TIMEOUT_SECONDS" || ' seconds')::INTERVAL;
    
    GET DIAGNOSTICS released_count = ROW_COUNT;
    RETURN released_count;
END;
$$;

-- 7.6 Get Sector Presence
CREATE OR REPLACE FUNCTION get_sector_presence(p_sector TEXT)
RETURNS TABLE (
    user_id UUID,
    display_name TEXT,
    avatar_color TEXT,
    world_position FLOAT[3],
    status TEXT
)
LANGUAGE plpgsql
SET search_path = ''
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ps."USER_ID",
        ua."DISPLAY_NAME",
        ua."AVATAR_COLOR",
        ps."WORLD_POSITION",
        ps."STATUS"
    FROM public.presence_sessions ps
    LEFT JOIN public.user_avatars ua ON ps."USER_ID" = ua."USER_ID"
    WHERE ps."SECTOR" = p_sector
    AND ps."HEARTBEAT_AT" > NOW() - INTERVAL '5 minutes';
END;
$$;

-- 7.7 Cleanup Stale Presence
CREATE OR REPLACE FUNCTION cleanup_stale_presence()
RETURNS INTEGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM public.presence_sessions
    WHERE "HEARTBEAT_AT" < NOW() - INTERVAL '5 minutes';
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$;

-- 7.8 Update Bundle Asset Count (Trigger Function)
CREATE OR REPLACE FUNCTION update_bundle_asset_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') AND NEW."BUNDLE_ID" IS NOT NULL THEN
        UPDATE public.digital_asset_bundles 
        SET "ASSET_COUNT" = (SELECT count(*) FROM public.historical_documents_global WHERE "BUNDLE_ID" = NEW."BUNDLE_ID"),
            "UPDATED_AT" = NOW()
        WHERE "ID" = NEW."BUNDLE_ID";
    END IF;
    RETURN NEW;   
END;
$$;

-- 7.9 Initialize User Avatar (Trigger Function)
CREATE OR REPLACE FUNCTION initialize_user_avatar()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
SECURITY DEFINER
AS $$
BEGIN
    INSERT INTO public.user_avatars ("USER_ID", "DISPLAY_NAME")
    VALUES (NEW.id, 'Explorer_' || LEFT(NEW.id::TEXT, 6))
    ON CONFLICT ("USER_ID") DO NOTHING;
    RETURN NEW;
END;
$$;

-- 7.10 Find Structured Mapping
CREATE OR REPLACE FUNCTION find_structured_mapping(
    p_cluster_type TEXT,
    p_dimension_name TEXT,
    p_raw_value TEXT,
    p_min_confidence NUMERIC DEFAULT 0.6
)
RETURNS TABLE(
    structured_value TEXT,
    confidence NUMERIC,
    mapping_type TEXT,
    occurrence_count INTEGER
)
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        m."STRUCTURED_VALUE",
        m."CONFIDENCE",
        m."MAPPING_TYPE",
        m."OCCURRENCE_COUNT"
    FROM public.structured_classification_mappings m
    WHERE m."CLUSTER_TYPE" = p_cluster_type
      AND m."DIMENSION_NAME" = p_dimension_name
      AND m."RAW_VALUE_NORMALIZED" = LOWER(TRIM(p_raw_value))
      AND m."CONFIDENCE" >= p_min_confidence
    ORDER BY m."CONFIDENCE" DESC, m."OCCURRENCE_COUNT" DESC
    LIMIT 5;
END;
$$;

-- 9.11 Sync Spatial Anchor Geometry (Trigger Function)
CREATE OR REPLACE FUNCTION sync_spatial_anchor_geometry()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF NEW."DEVICE_LAT" IS NOT NULL AND NEW."DEVICE_LNG" IS NOT NULL THEN
    BEGIN
      NEW."DEVICE_POINT" := extensions.ST_SetSRID(
        extensions.ST_MakePoint(NEW."DEVICE_LNG", NEW."DEVICE_LAT"), 4326);
    EXCEPTION WHEN undefined_column OR undefined_function THEN NULL;
    END;
  END IF;
  IF NEW."SUBJECT_LAT" IS NOT NULL AND NEW."SUBJECT_LNG" IS NOT NULL THEN
    BEGIN
      NEW."SUBJECT_POINT" := extensions.ST_SetSRID(
        extensions.ST_MakePoint(NEW."SUBJECT_LNG", NEW."SUBJECT_LAT"), 4326);
    EXCEPTION WHEN undefined_column OR undefined_function THEN NULL;
    END;
  END IF;
  RETURN NEW;
END;
$$;

-- 9.12 Update Graph Node Timestamps + Sync Geo (Trigger Function)
CREATE OR REPLACE FUNCTION update_graph_node_timestamps()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  NEW."UPDATED_AT" := now();
  IF NEW."LAT" IS NOT NULL AND NEW."LNG" IS NOT NULL THEN
    BEGIN
      NEW."GEO_POINT" := extensions.ST_SetSRID(
        extensions.ST_MakePoint(NEW."LNG", NEW."LAT"), 4326);
    EXCEPTION WHEN undefined_column OR undefined_function THEN NULL;
    END;
  END IF;
  RETURN NEW;
END;
$$;

-- 9.13 Increment Node Asset Count (Trigger Function)
CREATE OR REPLACE FUNCTION increment_node_asset_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE graph_nodes
  SET "ASSET_COUNT" = "ASSET_COUNT" + 1,
      "LAST_SEEN_AT" = now()
  WHERE "ID" = NEW."NODE_ID";
  RETURN NEW;
END;
$$;

-- 9.14 Decrement Node Asset Count (Trigger Function)
CREATE OR REPLACE FUNCTION decrement_node_asset_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE graph_nodes
  SET "ASSET_COUNT" = GREATEST(0, "ASSET_COUNT" - 1)
  WHERE "ID" = OLD."NODE_ID";
  RETURN OLD;
END;
$$;

-- 9.15 Invoke Processing Worker (Trigger Function — auto-processing)
CREATE OR REPLACE FUNCTION invoke_processing_worker()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  processing_count INTEGER;
  service_role_key TEXT;
  edge_function_url TEXT;
BEGIN
  IF NEW."STATUS" != 'PENDING' THEN
    RETURN NEW;
  END IF;
  SELECT COUNT(*) INTO processing_count
  FROM public.processing_queue WHERE "STATUS" = 'PROCESSING';
  IF processing_count > 0 THEN
    RETURN NEW;
  END IF;
  edge_function_url := 'https://kuofzjhrrjgimtomgact.supabase.co/functions/v1/process-ocr';
  SELECT decrypted_secret INTO service_role_key
  FROM vault.decrypted_secrets
  WHERE name = 'supabase_service_role_key' LIMIT 1;
  IF service_role_key IS NULL THEN
    RAISE WARNING 'No service role key in vault, skipping auto-invoke';
    RETURN NEW;
  END IF;
  PERFORM extensions.http_post(
    url := edge_function_url,
    body := json_build_object('maxJobs', 5, 'triggeredBy', 'database_trigger')::text,
    headers := json_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_role_key
    )::jsonb
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Auto-trigger failed: %', SQLERRM;
  RETURN NEW;
END;
$$;

-- 9.16 Cleanup Completed Jobs
CREATE OR REPLACE FUNCTION cleanup_completed_jobs(p_days_old INTEGER DEFAULT 7)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE deleted_count INTEGER;
BEGIN
    DELETE FROM public.processing_queue
    WHERE "STATUS" IN ('COMPLETED', 'FAILED', 'CANCELLED')
      AND "COMPLETED_AT" < NOW() - (p_days_old || ' days')::INTERVAL;
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$;

-- 9.17 Reset User Queue
CREATE OR REPLACE FUNCTION reset_user_queue(p_user_id UUID)
RETURNS TABLE (reset_count INTEGER, job_ids UUID[])
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_reset_count INTEGER; v_job_ids UUID[];
BEGIN
    SELECT ARRAY_AGG("ID") INTO v_job_ids
    FROM public.processing_queue
    WHERE "USER_ID" = p_user_id AND "STATUS" IN ('PROCESSING', 'FAILED');
    UPDATE public.processing_queue
    SET "STATUS" = 'PENDING', "WORKER_ID" = NULL, "LOCKED_AT" = NULL,
        "PROGRESS" = 0, "STAGE" = 'RESET_BY_USER', "RETRY_COUNT" = 0,
        "LAST_ERROR" = NULL, "ERROR_CODE" = NULL, "UPDATED_AT" = NOW()
    WHERE "USER_ID" = p_user_id AND "STATUS" IN ('PROCESSING', 'FAILED');
    GET DIAGNOSTICS v_reset_count = ROW_COUNT;
    RETURN QUERY SELECT v_reset_count, COALESCE(v_job_ids, ARRAY[]::UUID[]);
END;
$$;

-- 9.18 Get Queue Health
CREATE OR REPLACE FUNCTION get_queue_health()
RETURNS TABLE (
    total_pending INTEGER, total_processing INTEGER,
    total_completed_24h INTEGER, total_failed_24h INTEGER,
    avg_processing_time_seconds NUMERIC, stale_locks_count INTEGER,
    oldest_pending_age_minutes INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    RETURN QUERY
    SELECT
        COUNT(*) FILTER (WHERE "STATUS" = 'PENDING')::INTEGER,
        COUNT(*) FILTER (WHERE "STATUS" = 'PROCESSING')::INTEGER,
        COUNT(*) FILTER (WHERE "STATUS" = 'COMPLETED' AND "COMPLETED_AT" > NOW() - INTERVAL '24 hours')::INTEGER,
        COUNT(*) FILTER (WHERE "STATUS" = 'FAILED' AND "COMPLETED_AT" > NOW() - INTERVAL '24 hours')::INTEGER,
        AVG(EXTRACT(EPOCH FROM ("COMPLETED_AT" - "STARTED_AT"))) FILTER (WHERE "STATUS" = 'COMPLETED' AND "COMPLETED_AT" > NOW() - INTERVAL '24 hours'),
        COUNT(*) FILTER (WHERE "STATUS" = 'PROCESSING' AND "LOCKED_AT" < NOW() - ("LOCK_TIMEOUT_SECONDS" || ' seconds')::INTERVAL)::INTEGER,
        (EXTRACT(EPOCH FROM (NOW() - MIN("CREATED_AT") FILTER (WHERE "STATUS" = 'PENDING'))) / 60)::INTEGER
    FROM public.processing_queue;
END;
$$;

-- 9.19 Force Reset Stuck Jobs
CREATE OR REPLACE FUNCTION force_reset_stuck_jobs()
RETURNS TABLE (reset_count INTEGER, job_ids UUID[])
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_reset_count INTEGER; v_job_ids UUID[];
BEGIN
    SELECT ARRAY_AGG("ID") INTO v_job_ids
    FROM public.processing_queue WHERE "STATUS" = 'PROCESSING';
    UPDATE public.processing_queue
    SET "STATUS" = 'PENDING', "WORKER_ID" = NULL, "LOCKED_AT" = NULL,
        "PROGRESS" = 0, "STAGE" = 'FORCE_RESET_ALL', "UPDATED_AT" = NOW()
    WHERE "STATUS" = 'PROCESSING';
    GET DIAGNOSTICS v_reset_count = ROW_COUNT;
    RETURN QUERY SELECT v_reset_count, COALESCE(v_job_ids, ARRAY[]::UUID[]);
END;
$$;

-- Grant execute permissions for queue management
GRANT EXECUTE ON FUNCTION cleanup_completed_jobs TO service_role;
GRANT EXECUTE ON FUNCTION reset_user_queue TO authenticated;
GRANT EXECUTE ON FUNCTION get_queue_health TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION force_reset_stuck_jobs TO service_role;

-- ============================================
-- 10. TRIGGERS
-- ============================================

-- Bundle asset count trigger
DO $$
BEGIN
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'historical_documents_global') THEN
        DROP TRIGGER IF EXISTS trg_update_bundle_count ON historical_documents_global;
        CREATE TRIGGER trg_update_bundle_count
        AFTER INSERT OR UPDATE OF "BUNDLE_ID" ON historical_documents_global
        FOR EACH ROW EXECUTE FUNCTION update_bundle_asset_count();
    END IF;
END $$;

-- Auto-create avatar on user signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION initialize_user_avatar();

-- Spatial anchor geometry sync trigger
DROP TRIGGER IF EXISTS trg_spatial_anchor_geometry ON spatial_anchors;
CREATE TRIGGER trg_spatial_anchor_geometry
  BEFORE INSERT OR UPDATE ON spatial_anchors
  FOR EACH ROW EXECUTE FUNCTION sync_spatial_anchor_geometry();

-- Graph node timestamps + geo sync trigger
DROP TRIGGER IF EXISTS trg_graph_node_timestamps ON graph_nodes;
CREATE TRIGGER trg_graph_node_timestamps
  BEFORE INSERT OR UPDATE ON graph_nodes
  FOR EACH ROW EXECUTE FUNCTION update_graph_node_timestamps();

-- Graph node asset count triggers
DROP TRIGGER IF EXISTS trg_increment_node_asset_count ON asset_graph_nodes;
CREATE TRIGGER trg_increment_node_asset_count
  AFTER INSERT ON asset_graph_nodes
  FOR EACH ROW EXECUTE FUNCTION increment_node_asset_count();

DROP TRIGGER IF EXISTS trg_decrement_node_asset_count ON asset_graph_nodes;
CREATE TRIGGER trg_decrement_node_asset_count
  AFTER DELETE ON asset_graph_nodes
  FOR EACH ROW EXECUTE FUNCTION decrement_node_asset_count();

-- Auto-invoke processing Edge Function on queue insert
DROP TRIGGER IF EXISTS trg_invoke_processing_worker ON processing_queue;
CREATE TRIGGER trg_invoke_processing_worker
  AFTER INSERT ON processing_queue
  FOR EACH ROW EXECUTE FUNCTION invoke_processing_worker();

-- ============================================
-- 11. ROW LEVEL SECURITY
-- ============================================

-- Enable RLS on all tables
ALTER TABLE processing_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE digital_asset_bundles ENABLE ROW LEVEL SECURITY;
ALTER TABLE structured_clusters ENABLE ROW LEVEL SECURITY;
ALTER TABLE structured_classification_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE classification_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE cluster_dimension_statistics ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_avatars ENABLE ROW LEVEL SECURITY;
ALTER TABLE presence_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE world_sectors ENABLE ROW LEVEL SECURITY;
ALTER TABLE realtime_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE archive_partnerships ENABLE ROW LEVEL SECURITY;
ALTER TABLE royalty_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE shard_holdings ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_fund ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_return_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE governance_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE gard_tokenized_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE pending_rewards ENABLE ROW LEVEL SECURITY;
ALTER TABLE spatial_anchors ENABLE ROW LEVEL SECURITY;
ALTER TABLE graph_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE graph_edges ENABLE ROW LEVEL SECURITY;
ALTER TABLE asset_graph_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE master_user_access ENABLE ROW LEVEL SECURITY;

-- historical_documents_global may be created externally in some deployments.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'historical_documents_global'
  ) THEN
    EXECUTE 'ALTER TABLE historical_documents_global ENABLE ROW LEVEL SECURITY';
  END IF;
END $$;

-- Master access control table policies
DROP POLICY IF EXISTS "master_access_self_or_service_read" ON master_user_access;
DROP POLICY IF EXISTS "master_access_service_manage" ON master_user_access;
CREATE POLICY "master_access_self_or_service_read" ON master_user_access FOR SELECT
USING ((select auth.uid()) = "USER_ID" OR (select auth.role()) = 'service_role');
CREATE POLICY "master_access_service_manage" ON master_user_access FOR ALL TO service_role
USING (true) WITH CHECK (true);

-- historical_documents_global policies (owner or master-granted access)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'historical_documents_global'
  ) THEN
    EXECUTE 'DROP POLICY IF EXISTS "docs_read_owner_or_master" ON historical_documents_global';
    EXECUTE 'DROP POLICY IF EXISTS "docs_insert_owner_or_service" ON historical_documents_global';
    EXECUTE 'DROP POLICY IF EXISTS "docs_update_owner_or_service" ON historical_documents_global';
    EXECUTE 'DROP POLICY IF EXISTS "Users view own documents" ON historical_documents_global';
    EXECUTE 'DROP POLICY IF EXISTS "Authenticated insert own" ON historical_documents_global';
    EXECUTE 'DROP POLICY IF EXISTS "Users update own documents" ON historical_documents_global';

    EXECUTE '
      CREATE POLICY "docs_read_owner_or_master"
      ON historical_documents_global FOR SELECT
      USING (
        (select auth.role()) = ''service_role''
        OR "USER_ID" = (select auth.uid())
        OR EXISTS (
          SELECT 1
          FROM public.master_user_access mua
          WHERE mua."USER_ID" = (select auth.uid())
            AND mua."CAN_ACCESS_CORPUS" = true
        )
      )
    ';

    EXECUTE '
      CREATE POLICY "docs_insert_owner_or_service"
      ON historical_documents_global FOR INSERT
      WITH CHECK (
        (select auth.role()) = ''service_role''
        OR "USER_ID" = (select auth.uid())
      )
    ';

    EXECUTE '
      CREATE POLICY "docs_update_owner_or_service"
      ON historical_documents_global FOR UPDATE
      USING (
        (select auth.role()) = ''service_role''
        OR "USER_ID" = (select auth.uid())
      )
      WITH CHECK (
        (select auth.role()) = ''service_role''
        OR "USER_ID" = (select auth.uid())
      )
    ';
  END IF;
END $$;

-- Processing Queue Policies
DROP POLICY IF EXISTS "Users view own queue items" ON processing_queue;
CREATE POLICY "Users view own queue items" ON processing_queue FOR SELECT
USING ((select auth.uid()) = "USER_ID" OR (select auth.role()) = 'service_role');

DROP POLICY IF EXISTS "Users insert queue items" ON processing_queue;
CREATE POLICY "Users insert queue items" ON processing_queue FOR INSERT
WITH CHECK ((select auth.uid()) = "USER_ID" OR (select auth.role()) = 'service_role');

DROP POLICY IF EXISTS "Users update own queue items" ON processing_queue;
CREATE POLICY "Users update own queue items" ON processing_queue FOR UPDATE
USING ((select auth.uid()) = "USER_ID" OR (select auth.role()) = 'service_role');

-- Processing Queue DELETE lockdown — service_role only
DROP POLICY IF EXISTS "Service role delete queue items" ON processing_queue;
CREATE POLICY "Service role delete queue items" ON processing_queue FOR DELETE
TO service_role USING (true);

-- Digital Asset Bundles Policies (DELETE locked to service_role)
DROP POLICY IF EXISTS "Public view bundles" ON digital_asset_bundles;
DROP POLICY IF EXISTS "Users manage own bundles" ON digital_asset_bundles;
DROP POLICY IF EXISTS "Users view own bundles" ON digital_asset_bundles;
DROP POLICY IF EXISTS "Users insert own bundles" ON digital_asset_bundles;
DROP POLICY IF EXISTS "Users update own bundles" ON digital_asset_bundles;
DROP POLICY IF EXISTS "Service role delete bundles" ON digital_asset_bundles;

CREATE POLICY "Users view own bundles" ON digital_asset_bundles FOR SELECT
USING ((select auth.uid()) = "USER_ID" OR (select auth.role()) = 'service_role');
CREATE POLICY "Users insert own bundles" ON digital_asset_bundles FOR INSERT
WITH CHECK ((select auth.uid()) = "USER_ID");
CREATE POLICY "Users update own bundles" ON digital_asset_bundles FOR UPDATE
USING ((select auth.uid()) = "USER_ID");
CREATE POLICY "Service role delete bundles" ON digital_asset_bundles FOR DELETE
TO service_role USING (true);

-- Structured Clusters Policies
DROP POLICY IF EXISTS "Anyone can view clusters" ON structured_clusters;
CREATE POLICY "Anyone can view clusters" ON structured_clusters FOR SELECT USING (true);

DROP POLICY IF EXISTS "Authenticated users modify clusters" ON structured_clusters;
CREATE POLICY "Authenticated users modify clusters" ON structured_clusters FOR ALL
USING ((select auth.role()) = 'authenticated');

-- Avatar Policies
DROP POLICY IF EXISTS "Users can view all avatars" ON user_avatars;
CREATE POLICY "Users can view all avatars" ON user_avatars FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users update own avatar" ON user_avatars;
CREATE POLICY "Users update own avatar" ON user_avatars FOR UPDATE 
USING ((select auth.uid()) = "USER_ID");

DROP POLICY IF EXISTS "Users insert own avatar" ON user_avatars;
CREATE POLICY "Users insert own avatar" ON user_avatars FOR INSERT 
WITH CHECK ((select auth.uid()) = "USER_ID");

-- Presence Policies
DROP POLICY IF EXISTS "Users view active presence" ON presence_sessions;
CREATE POLICY "Users view active presence" ON presence_sessions FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users manage own presence" ON presence_sessions;
CREATE POLICY "Users manage own presence" ON presence_sessions FOR ALL 
USING ((select auth.uid()) = "USER_ID");

-- World Sectors Policies
DROP POLICY IF EXISTS "Anyone can view sectors" ON world_sectors;
CREATE POLICY "Anyone can view sectors" ON world_sectors FOR SELECT USING (true);

-- Realtime Events Policies
DROP POLICY IF EXISTS "Users view all events" ON realtime_events;
CREATE POLICY "Users view all events" ON realtime_events FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users insert events" ON realtime_events;
CREATE POLICY "Users insert events" ON realtime_events FOR INSERT 
WITH CHECK ((select auth.uid()) IS NOT NULL);

-- Archive Partnerships Policies
DROP POLICY IF EXISTS "Anyone can view partnerships" ON archive_partnerships;
CREATE POLICY "Anyone can view partnerships" ON archive_partnerships FOR SELECT USING (true);

-- GARD Policies
DROP POLICY IF EXISTS "Public read royalty transactions" ON royalty_transactions;
CREATE POLICY "Public read royalty transactions" ON royalty_transactions FOR SELECT USING (true);

DROP POLICY IF EXISTS "Service insert royalty" ON royalty_transactions;
CREATE POLICY "Service insert royalty" ON royalty_transactions FOR INSERT 
WITH CHECK ((select auth.role()) = 'service_role');

DROP POLICY IF EXISTS "Users view own holdings" ON shard_holdings;
CREATE POLICY "Users view own holdings" ON shard_holdings FOR SELECT 
USING ((select auth.uid()) = "USER_ID" OR (select auth.role()) = 'service_role');

DROP POLICY IF EXISTS "Service manage holdings" ON shard_holdings;
CREATE POLICY "Service manage holdings" ON shard_holdings FOR ALL 
USING ((select auth.role()) = 'service_role');

DROP POLICY IF EXISTS "Public read community fund" ON community_fund;
CREATE POLICY "Public read community fund" ON community_fund FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public read projects" ON social_return_projects;
CREATE POLICY "Public read projects" ON social_return_projects FOR SELECT USING (true);

DROP POLICY IF EXISTS "Authenticated propose projects" ON social_return_projects;
CREATE POLICY "Authenticated propose projects" ON social_return_projects FOR INSERT
WITH CHECK ((select auth.role()) = 'authenticated');

DROP POLICY IF EXISTS "Users view all votes" ON governance_votes;
CREATE POLICY "Users view all votes" ON governance_votes FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users cast own votes" ON governance_votes;
CREATE POLICY "Users cast own votes" ON governance_votes FOR INSERT
WITH CHECK ((select auth.uid()) = "VOTER_ID");

DROP POLICY IF EXISTS "Public read tokenized assets" ON gard_tokenized_assets;
CREATE POLICY "Public read tokenized assets" ON gard_tokenized_assets FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users view own rewards" ON pending_rewards;
CREATE POLICY "Users view own rewards" ON pending_rewards FOR SELECT 
USING ((select auth.uid()) = "USER_ID");

-- Spatial Anchors Policies
DROP POLICY IF EXISTS "spatial_anchors_select_own" ON spatial_anchors;
CREATE POLICY "spatial_anchors_select_own" ON spatial_anchors FOR SELECT TO authenticated
USING (auth.uid() = "USER_ID");

DROP POLICY IF EXISTS "spatial_anchors_insert_own" ON spatial_anchors;
CREATE POLICY "spatial_anchors_insert_own" ON spatial_anchors FOR INSERT TO authenticated
WITH CHECK (auth.uid() = "USER_ID");

DROP POLICY IF EXISTS "spatial_anchors_update_own" ON spatial_anchors;
CREATE POLICY "spatial_anchors_update_own" ON spatial_anchors FOR UPDATE TO authenticated
USING (auth.uid() = "USER_ID");

DROP POLICY IF EXISTS "spatial_anchors_service_role" ON spatial_anchors;
CREATE POLICY "spatial_anchors_service_role" ON spatial_anchors FOR ALL TO service_role
USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role delete spatial_anchors" ON spatial_anchors;
CREATE POLICY "Service role delete spatial_anchors" ON spatial_anchors FOR DELETE
TO service_role USING (true);

-- Graph Nodes Policies
DROP POLICY IF EXISTS "graph_nodes_read_all" ON graph_nodes;
DROP POLICY IF EXISTS "graph_nodes_insert_own" ON graph_nodes;
DROP POLICY IF EXISTS "graph_nodes_update_own" ON graph_nodes;
DROP POLICY IF EXISTS "graph_nodes_service" ON graph_nodes;
DROP POLICY IF EXISTS "graph_nodes_read_owner_or_master" ON graph_nodes;
CREATE POLICY "graph_nodes_read_owner_or_master" ON graph_nodes FOR SELECT TO authenticated
USING (
  "USER_ID" = auth.uid()
  OR EXISTS (
    SELECT 1
    FROM public.master_user_access mua
    WHERE mua."USER_ID" = auth.uid()
      AND mua."CAN_ACCESS_CORPUS" = true
  )
);
CREATE POLICY "graph_nodes_service" ON graph_nodes FOR ALL TO service_role
USING (true) WITH CHECK (true);

-- Graph Edges Policies
DROP POLICY IF EXISTS "graph_edges_read_all" ON graph_edges;
DROP POLICY IF EXISTS "graph_edges_service" ON graph_edges;
DROP POLICY IF EXISTS "graph_edges_read_owner_or_master" ON graph_edges;
CREATE POLICY "graph_edges_read_owner_or_master" ON graph_edges FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.graph_nodes gn
    WHERE (gn."ID" = graph_edges."FROM_NODE_ID" OR gn."ID" = graph_edges."TO_NODE_ID")
      AND (
        gn."USER_ID" = auth.uid()
        OR EXISTS (
          SELECT 1
          FROM public.master_user_access mua
          WHERE mua."USER_ID" = auth.uid()
            AND mua."CAN_ACCESS_CORPUS" = true
        )
      )
  )
);
CREATE POLICY "graph_edges_service" ON graph_edges FOR ALL TO service_role
USING (true) WITH CHECK (true);

-- Asset Graph Nodes (junction) Policies
DROP POLICY IF EXISTS "asset_graph_nodes_read" ON asset_graph_nodes;
DROP POLICY IF EXISTS "asset_graph_nodes_service" ON asset_graph_nodes;
DROP POLICY IF EXISTS "asset_graph_nodes_read_owner_or_master" ON asset_graph_nodes;
CREATE POLICY "asset_graph_nodes_read_owner_or_master" ON asset_graph_nodes FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.historical_documents_global h
    WHERE h."ASSET_ID"::text = asset_graph_nodes."ASSET_ID"::text
      AND (
        h."USER_ID" = auth.uid()
        OR EXISTS (
          SELECT 1
          FROM public.master_user_access mua
          WHERE mua."USER_ID" = auth.uid()
            AND mua."CAN_ACCESS_CORPUS" = true
        )
      )
  )
);
CREATE POLICY "asset_graph_nodes_service" ON asset_graph_nodes FOR ALL TO service_role
USING (true) WITH CHECK (true);

-- DELETE Lockdown — service_role only on historical_documents_global
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'historical_documents_global') THEN
    DROP POLICY IF EXISTS "Public Anonymous Delete" ON historical_documents_global;
    DROP POLICY IF EXISTS "Service role delete documents" ON historical_documents_global;
    EXECUTE 'CREATE POLICY "Service role delete documents"
      ON historical_documents_global FOR DELETE TO service_role USING (true)';
  END IF;
END $$;

-- DELETE Lockdown — service_role only on shard & token tables
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'shard_holdings') THEN
    DROP POLICY IF EXISTS "Service role delete shard_holdings" ON shard_holdings;
    EXECUTE 'CREATE POLICY "Service role delete shard_holdings"
      ON shard_holdings FOR DELETE TO service_role USING (true)';
  END IF;
  IF EXISTS (SELECT FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'gard_tokenized_assets') THEN
    DROP POLICY IF EXISTS "Service role delete gard_tokenized_assets" ON gard_tokenized_assets;
    EXECUTE 'CREATE POLICY "Service role delete gard_tokenized_assets"
      ON gard_tokenized_assets FOR DELETE TO service_role USING (true)';
  END IF;
  IF EXISTS (SELECT FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'pending_rewards') THEN
    DROP POLICY IF EXISTS "Service role delete pending_rewards" ON pending_rewards;
    EXECUTE 'CREATE POLICY "Service role delete pending_rewards"
      ON pending_rewards FOR DELETE TO service_role USING (true)';
  END IF;
END $$;

-- ============================================
-- 12. PERFORMANCE INDEXES
-- ============================================

-- Processing Queue Indexes
CREATE INDEX IF NOT EXISTS idx_queue_fetch 
ON processing_queue ("STATUS", "PRIORITY" DESC, "CREATED_AT" ASC)
WHERE "STATUS" = 'PENDING';

CREATE INDEX IF NOT EXISTS idx_queue_stale_locks
ON processing_queue ("LOCKED_AT")
WHERE "STATUS" = 'PROCESSING' AND "LOCKED_AT" IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_queue_user
ON processing_queue ("USER_ID", "STATUS", "CREATED_AT" DESC);

CREATE INDEX IF NOT EXISTS idx_queue_retry
ON processing_queue ("STATUS", "RETRY_COUNT", "CREATED_AT")
WHERE "STATUS" = 'FAILED';

-- Structured Clusters Indexes
CREATE INDEX IF NOT EXISTS idx_clusters_type ON structured_clusters("CLUSTER_TYPE");
CREATE INDEX IF NOT EXISTS idx_clusters_dimension ON structured_clusters("DIMENSION_NAME");
CREATE INDEX IF NOT EXISTS idx_clusters_value ON structured_clusters("STRUCTURED_VALUE");

-- Avatar Indexes
CREATE INDEX IF NOT EXISTS idx_avatars_user ON user_avatars("USER_ID");
CREATE INDEX IF NOT EXISTS idx_avatars_last_seen ON user_avatars("LAST_SEEN" DESC);

-- Presence Indexes
CREATE INDEX IF NOT EXISTS idx_presence_sector ON presence_sessions("SECTOR");
CREATE INDEX IF NOT EXISTS idx_presence_heartbeat ON presence_sessions("HEARTBEAT_AT" DESC);

-- World Sectors Indexes
CREATE INDEX IF NOT EXISTS idx_sectors_code ON world_sectors("SECTOR_CODE");
CREATE INDEX IF NOT EXISTS idx_sectors_zone ON world_sectors("ZONE_TYPE");

-- GARD Indexes
CREATE INDEX IF NOT EXISTS idx_royalty_token ON royalty_transactions("TOKEN_ID");
CREATE INDEX IF NOT EXISTS idx_holdings_user ON shard_holdings("USER_ID");
CREATE INDEX IF NOT EXISTS idx_holdings_token ON shard_holdings("TOKEN_ID");
CREATE INDEX IF NOT EXISTS idx_projects_status ON social_return_projects("STATUS");
CREATE INDEX IF NOT EXISTS idx_votes_project ON governance_votes("PROJECT_ID");

-- Bundle Indexes
CREATE INDEX IF NOT EXISTS idx_bundle_user ON digital_asset_bundles("USER_ID");

-- Queue Duplicate Prevention & Cleanup Indexes
CREATE UNIQUE INDEX IF NOT EXISTS idx_pq_active_asset_per_user
    ON processing_queue ("ASSET_ID", "USER_ID")
    WHERE "STATUS" IN ('PENDING', 'PROCESSING');
CREATE INDEX IF NOT EXISTS idx_processing_queue_completed_at_status
    ON processing_queue("COMPLETED_AT", "STATUS")
    WHERE "STATUS" IN ('COMPLETED', 'FAILED', 'CANCELLED');
CREATE INDEX IF NOT EXISTS idx_processing_queue_status_created
    ON processing_queue("STATUS", "CREATED_AT");

-- Spatial Anchors Indexes
CREATE INDEX IF NOT EXISTS idx_spatial_anchors_user    ON spatial_anchors("USER_ID");
CREATE INDEX IF NOT EXISTS idx_spatial_anchors_asset   ON spatial_anchors("ASSET_ID") WHERE "ASSET_ID" IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_spatial_anchors_session ON spatial_anchors("CAPTURE_SESSION_ID") WHERE "CAPTURE_SESSION_ID" IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_spatial_anchors_status  ON spatial_anchors("PROCESSING_STATUS");
CREATE INDEX IF NOT EXISTS idx_spatial_anchors_label   ON spatial_anchors("RECOGNIZED_LABEL") WHERE "RECOGNIZED_LABEL" IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_spatial_anchors_node    ON spatial_anchors("GRAPH_NODE_ID") WHERE "GRAPH_NODE_ID" IS NOT NULL;

-- Spatial GIST indexes (conditional on PostGIS geometry columns)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'spatial_anchors' AND column_name = 'DEVICE_POINT'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_spatial_anchors_device_geo
      ON spatial_anchors USING GIST ("DEVICE_POINT") WHERE "DEVICE_POINT" IS NOT NULL';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_spatial_anchors_subject_geo
      ON spatial_anchors USING GIST ("SUBJECT_POINT") WHERE "SUBJECT_POINT" IS NOT NULL';
  END IF;
END $$;

-- Graph Nodes Indexes
CREATE INDEX IF NOT EXISTS idx_graph_nodes_label       ON graph_nodes("LABEL");
CREATE INDEX IF NOT EXISTS idx_graph_nodes_type        ON graph_nodes("NODE_TYPE");
CREATE INDEX IF NOT EXISTS idx_graph_nodes_canonical   ON graph_nodes("CANONICAL_ID") WHERE "CANONICAL_ID" IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_graph_nodes_user        ON graph_nodes("USER_ID") WHERE "USER_ID" IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_graph_nodes_processed   ON graph_nodes("GRAPH_PROCESSED") WHERE "GRAPH_PROCESSED" = false;
CREATE INDEX IF NOT EXISTS idx_graph_nodes_assets      ON graph_nodes("ASSET_COUNT" DESC);

-- GEO_POINT GIST index (conditional on PostGIS column)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'graph_nodes' AND column_name = 'GEO_POINT'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_graph_nodes_geo
      ON graph_nodes USING GIST ("GEO_POINT") WHERE "GEO_POINT" IS NOT NULL';
  END IF;
END $$;

-- Graph Edges Indexes
CREATE INDEX IF NOT EXISTS idx_graph_edges_from        ON graph_edges("FROM_NODE_ID");
CREATE INDEX IF NOT EXISTS idx_graph_edges_to          ON graph_edges("TO_NODE_ID");
CREATE INDEX IF NOT EXISTS idx_graph_edges_rel         ON graph_edges("RELATIONSHIP");
CREATE INDEX IF NOT EXISTS idx_graph_edges_spatial     ON graph_edges("IS_SPATIAL") WHERE "IS_SPATIAL" = true;

-- Asset Graph Nodes Indexes
CREATE INDEX IF NOT EXISTS idx_asset_graph_nodes_asset ON asset_graph_nodes("ASSET_ID");
CREATE INDEX IF NOT EXISTS idx_asset_graph_nodes_node  ON asset_graph_nodes("NODE_ID");

-- Add BRIN indexes for time-series data (if historical_documents_global exists)
DO $$
BEGIN
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'historical_documents_global') THEN
        CREATE INDEX IF NOT EXISTS idx_documents_created_at_brin 
        ON historical_documents_global USING BRIN ("CREATED_AT")
        WITH (pages_per_range = 128);
        
        -- GIN indexes for JSONB columns
        CREATE INDEX IF NOT EXISTS idx_structured_temporal_gin 
        ON historical_documents_global USING GIN ("STRUCTURED_TEMPORAL");
        CREATE INDEX IF NOT EXISTS idx_structured_spatial_gin 
        ON historical_documents_global USING GIN ("STRUCTURED_SPATIAL");
        CREATE INDEX IF NOT EXISTS idx_structured_content_gin 
        ON historical_documents_global USING GIN ("STRUCTURED_CONTENT");
    END IF;
END $$;

-- ============================================
-- 13. MONITORING VIEWS
-- ============================================

-- Queue Statistics View
CREATE OR REPLACE VIEW queue_stats AS
SELECT 
    "STATUS",
    COUNT(*) as count,
    ROUND(AVG(EXTRACT(EPOCH FROM (NOW() - "CREATED_AT")))::numeric, 2) as avg_age_seconds,
    MIN("CREATED_AT") as oldest_job,
    MAX("CREATED_AT") as newest_job,
    COUNT(CASE WHEN "RETRY_COUNT" > 0 THEN 1 END) as retry_attempts
FROM processing_queue
WHERE "STATUS" IN ('PENDING', 'PROCESSING', 'FAILED')
GROUP BY "STATUS";

-- Queue Health View
CREATE OR REPLACE VIEW queue_health AS
WITH metrics AS (
    SELECT
        COUNT(*) FILTER (WHERE "STATUS" = 'PENDING') as pending_count,
        COUNT(*) FILTER (WHERE "STATUS" = 'PROCESSING') as processing_count,
        COUNT(*) FILTER (WHERE "STATUS" = 'COMPLETED' AND "COMPLETED_AT" > NOW() - INTERVAL '1 hour') as completed_last_hour,
        COUNT(*) FILTER (WHERE "STATUS" = 'FAILED' AND "CREATED_AT" > NOW() - INTERVAL '1 hour') as failed_last_hour
    FROM processing_queue
    WHERE "CREATED_AT" > NOW() - INTERVAL '24 hours'
)
SELECT 
    *,
    CASE 
        WHEN pending_count > 100 THEN 'CRITICAL'
        WHEN pending_count > 50 THEN 'WARNING'
        ELSE 'HEALTHY'
    END as queue_status
FROM metrics;

-- Index Usage Stats View (without SECURITY DEFINER)
DROP VIEW IF EXISTS index_usage_stats;
CREATE OR REPLACE VIEW index_usage_stats AS
SELECT
    schemaname,
    relname AS table_name,
    indexrelname AS index_name,
    idx_scan AS index_scans,
    idx_tup_read AS tuples_read,
    idx_tup_fetch AS tuples_fetched,
    pg_size_pretty(pg_relation_size(indexrelid)) AS index_size
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
ORDER BY idx_scan DESC;

-- Cache Hit Stats View (without SECURITY DEFINER)
DROP VIEW IF EXISTS cache_hit_stats;
CREATE OR REPLACE VIEW cache_hit_stats AS
SELECT
    schemaname,
    relname AS table_name,
    heap_blks_read,
    heap_blks_hit,
    CASE 
        WHEN heap_blks_hit + heap_blks_read > 0 
        THEN round(100.0 * heap_blks_hit / (heap_blks_hit + heap_blks_read), 2)
        ELSE 0 
    END AS cache_hit_ratio
FROM pg_statio_user_tables
WHERE schemaname = 'public'
ORDER BY heap_blks_read DESC;

-- Grant access to views
GRANT SELECT ON queue_stats TO authenticated;
GRANT SELECT ON queue_health TO authenticated;
GRANT SELECT ON index_usage_stats TO authenticated;
GRANT SELECT ON cache_hit_stats TO authenticated;

-- ============================================
-- 14. STORAGE BUCKET POLICIES
-- ============================================

-- Ensure the processing-uploads bucket exists
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'processing-uploads',
  'processing-uploads',
  false,
  52428800,   -- 50 MB
  ARRAY['image/jpeg','image/png','image/webp','image/heic','application/pdf']
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit   = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types,
  public            = EXCLUDED.public;

-- Drop stale / conflicting policies
DROP POLICY IF EXISTS "Users can upload to own folder"         ON storage.objects;
DROP POLICY IF EXISTS "Users can update own uploads"           ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own uploads"           ON storage.objects;
DROP POLICY IF EXISTS "Users can read own uploads"             ON storage.objects;
DROP POLICY IF EXISTS "Service role full access to processing" ON storage.objects;

-- Authenticated users: INSERT into own folder ({user_id}/{asset_id}/{filename})
CREATE POLICY "Users can upload to own folder"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'processing-uploads'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Authenticated users: SELECT own uploads
CREATE POLICY "Users can read own uploads"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'processing-uploads'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Authenticated users: UPDATE own uploads
CREATE POLICY "Users can update own uploads"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'processing-uploads'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Authenticated users: DELETE own uploads
CREATE POLICY "Users can delete own uploads"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'processing-uploads'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Service role: full access (Edge Functions use service_role key for OCR)
CREATE POLICY "Service role full access to processing"
ON storage.objects FOR ALL
TO service_role
USING (bucket_id = 'processing-uploads')
WITH CHECK (bucket_id = 'processing-uploads');

COMMIT;

-- ============================================
-- COMPLETION MESSAGE
-- ============================================
SELECT '✅ Loadopoly-OCR v3.1.0 Consolidated Schema Setup Complete!' as result,
       'All tables, functions, policies, indexes, and storage buckets created' as status;
