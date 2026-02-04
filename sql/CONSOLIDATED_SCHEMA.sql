-- =============================================
-- LOADOPOLY-OCR CONSOLIDATED DATABASE SCHEMA
-- =============================================
-- Version: 3.0.0
-- Last Updated: 2026-02-04
--
-- This is the SINGLE SOURCE OF TRUTH for the Loadopoly-OCR database schema.
-- Run this script to set up a fresh Supabase project or verify existing schema.
--
-- This script is IDEMPOTENT - safe to run multiple times.
--
-- MODULES:
--   1. Extensions
--   2. Core Tables (historical_documents_global, processing_queue)
--   3. Classification System (structured_clusters, mappings)
--   4. Avatar & Presence (user_avatars, presence_sessions, world_sectors)
--   5. GARD Tokenization (royalty_transactions, shard_holdings, etc.)
--   6. Bundles (digital_asset_bundles)
--   7. Functions & Triggers
--   8. Row Level Security Policies
--   9. Performance Indexes
--   10. Monitoring Views
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
    "LOCK_TIMEOUT_SECONDS" INTEGER DEFAULT 300,
    
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
-- 6. EXTEND HISTORICAL_DOCUMENTS_GLOBAL
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
-- 7. FUNCTIONS
-- ============================================

-- 7.1 Claim Processing Job
CREATE OR REPLACE FUNCTION claim_processing_job(p_worker_id TEXT)
RETURNS TABLE (
    job_id UUID,
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

-- ============================================
-- 8. TRIGGERS
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

-- ============================================
-- 9. ROW LEVEL SECURITY
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

-- Digital Asset Bundles Policies
DROP POLICY IF EXISTS "Public view bundles" ON digital_asset_bundles;
CREATE POLICY "Public view bundles" ON digital_asset_bundles FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users manage own bundles" ON digital_asset_bundles;
CREATE POLICY "Users manage own bundles" ON digital_asset_bundles FOR ALL 
USING ((select auth.uid()) = "USER_ID");

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

-- ============================================
-- 10. PERFORMANCE INDEXES
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
-- 11. MONITORING VIEWS
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

COMMIT;

-- ============================================
-- COMPLETION MESSAGE
-- ============================================
SELECT '✅ Loadopoly-OCR v3.0.0 Consolidated Schema Setup Complete!' as result,
       'All tables, functions, policies, and indexes created' as status;
