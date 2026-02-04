-- =============================================
-- LOADOPOLY-OCR v2.8.1 - COMPLETE SCHEMA SETUP
-- =============================================
-- Run this script to bring your Supabase project
-- up to date with the v2.8.1 frontend requirements.
--
-- This script is idempotent - safe to run multiple times.
-- =============================================

-- ============================================
-- 1. ENABLE PGVECTOR EXTENSION
-- ============================================
-- Required for semantic similarity search and deduplication
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================
-- 2. PROCESSING QUEUE TABLE
-- ============================================
-- Server-side queue for OCR processing jobs
-- Enables background processing and job tracking

CREATE TABLE IF NOT EXISTS processing_queue (
    ID UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Job Identification
    USER_ID UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    ASSET_ID TEXT NOT NULL,
    IMAGE_PATH TEXT NOT NULL,
    
    -- Processing Configuration
    SCAN_TYPE TEXT NOT NULL DEFAULT 'DOCUMENT',
    PRIORITY INTEGER NOT NULL DEFAULT 5 CHECK (PRIORITY BETWEEN 1 AND 10),
    
    -- Location Data (for GIS extraction)
    LATITUDE DOUBLE PRECISION,
    LONGITUDE DOUBLE PRECISION,
    
    -- Status Management
    STATUS TEXT NOT NULL DEFAULT 'PENDING' CHECK (
        STATUS IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED')
    ),
    
    -- Progress Tracking
    PROGRESS INTEGER DEFAULT 0 CHECK (PROGRESS BETWEEN 0 AND 100),
    STAGE TEXT DEFAULT 'QUEUED',
    
    -- Error Handling & Retries
    RETRY_COUNT INTEGER DEFAULT 0,
    MAX_RETRIES INTEGER DEFAULT 3,
    LAST_ERROR TEXT,
    ERROR_CODE TEXT,
    
    -- Worker Assignment
    WORKER_ID TEXT,
    LOCKED_AT TIMESTAMPTZ,
    LOCK_TIMEOUT_SECONDS INTEGER DEFAULT 300,
    
    -- Timestamps
    CREATED_AT TIMESTAMPTZ DEFAULT NOW(),
    STARTED_AT TIMESTAMPTZ,
    COMPLETED_AT TIMESTAMPTZ,
    UPDATED_AT TIMESTAMPTZ DEFAULT NOW(),
    
    -- Result Storage
    RESULT_DATA JSONB,
    METADATA JSONB DEFAULT '{}'::jsonb
);

-- Indexes for queue operations
CREATE INDEX IF NOT EXISTS idx_queue_fetch 
ON processing_queue (STATUS, PRIORITY DESC, CREATED_AT ASC)
WHERE STATUS = 'PENDING';

CREATE INDEX IF NOT EXISTS idx_queue_stale_locks
ON processing_queue (LOCKED_AT)
WHERE STATUS = 'PROCESSING' AND LOCKED_AT IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_queue_user
ON processing_queue (USER_ID, STATUS, CREATED_AT DESC);

CREATE INDEX IF NOT EXISTS idx_queue_retry
ON processing_queue (STATUS, RETRY_COUNT, CREATED_AT)
WHERE STATUS = 'FAILED';

-- RLS for processing_queue
ALTER TABLE processing_queue ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT FROM pg_policies WHERE tablename = 'processing_queue' AND policyname = 'Users can view their own queue items') THEN
        CREATE POLICY "Users can view their own queue items"
        ON processing_queue FOR SELECT
        USING (auth.uid() = USER_ID OR auth.role() = 'service_role');
    END IF;
END $$;

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT FROM pg_policies WHERE tablename = 'processing_queue' AND policyname = 'Users can insert queue items') THEN
        CREATE POLICY "Users can insert queue items"
        ON processing_queue FOR INSERT
        WITH CHECK (auth.uid() = USER_ID);
    END IF;
END $$;

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT FROM pg_policies WHERE tablename = 'processing_queue' AND policyname = 'Users can update their own queue items') THEN
        CREATE POLICY "Users can update their own queue items"
        ON processing_queue FOR UPDATE
        USING (auth.uid() = USER_ID OR auth.role() = 'service_role');
    END IF;
END $$;

-- ============================================
-- 3. STRUCTURED CLUSTERS TABLE
-- ============================================
-- Stores learned classification mappings for LLM-synchronized dimensions

CREATE TABLE IF NOT EXISTS structured_clusters (
    ID UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Cluster identification
    CLUSTER_TYPE TEXT NOT NULL CHECK (CLUSTER_TYPE IN (
        'TEMPORAL', 'SPATIAL', 'CONTENT', 
        'KNOWLEDGE_GRAPH', 'PROVENANCE', 'DISCOVERY'
    )),
    DIMENSION_NAME TEXT NOT NULL,
    STRUCTURED_VALUE TEXT NOT NULL,
    VALUE_DESCRIPTION TEXT,
    
    -- Statistics
    SAMPLE_ASSET_IDS TEXT[] DEFAULT '{}',
    ASSET_COUNT INTEGER DEFAULT 0,
    
    -- Timestamps
    CREATED_AT TIMESTAMPTZ DEFAULT NOW(),
    UPDATED_AT TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(CLUSTER_TYPE, DIMENSION_NAME, STRUCTURED_VALUE)
);

CREATE INDEX IF NOT EXISTS idx_clusters_type ON structured_clusters(CLUSTER_TYPE);
CREATE INDEX IF NOT EXISTS idx_clusters_dimension ON structured_clusters(DIMENSION_NAME);
CREATE INDEX IF NOT EXISTS idx_clusters_value ON structured_clusters(STRUCTURED_VALUE);

-- RLS for structured_clusters
ALTER TABLE structured_clusters ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT FROM pg_policies WHERE tablename = 'structured_clusters' AND policyname = 'Anyone can view clusters') THEN
        CREATE POLICY "Anyone can view clusters"
        ON structured_clusters FOR SELECT USING (true);
    END IF;
END $$;

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT FROM pg_policies WHERE tablename = 'structured_clusters' AND policyname = 'Authenticated users can modify clusters') THEN
        CREATE POLICY "Authenticated users can modify clusters"
        ON structured_clusters FOR ALL
        USING (auth.role() = 'authenticated');
    END IF;
END $$;

-- ============================================
-- 4. VECTOR EMBEDDINGS COLUMNS
-- ============================================
-- Add embedding columns to historical_documents_global for semantic search
-- These enable O(n log n) similarity search vs O(n²) pairwise comparison

DO $$ 
BEGIN
    ALTER TABLE historical_documents_global
    ADD COLUMN IF NOT EXISTS TEXT_EMBEDDING vector(768);
EXCEPTION WHEN undefined_table THEN
    RAISE NOTICE 'Table historical_documents_global does not exist - skipping TEXT_EMBEDDING';
END $$;

DO $$ 
BEGIN
    ALTER TABLE historical_documents_global
    ADD COLUMN IF NOT EXISTS IMAGE_EMBEDDING vector(512);
EXCEPTION WHEN undefined_table THEN
    RAISE NOTICE 'Skipping IMAGE_EMBEDDING';
END $$;

DO $$ 
BEGIN
    ALTER TABLE historical_documents_global
    ADD COLUMN IF NOT EXISTS COMBINED_EMBEDDING vector(768);
EXCEPTION WHEN undefined_table THEN
    RAISE NOTICE 'Skipping COMBINED_EMBEDDING';
END $$;

DO $$ 
BEGIN
    ALTER TABLE historical_documents_global
    ADD COLUMN IF NOT EXISTS EMBEDDING_MODEL TEXT DEFAULT 'gemini-embedding-001';
EXCEPTION WHEN undefined_table THEN
    RAISE NOTICE 'Skipping EMBEDDING_MODEL';
END $$;

DO $$ 
BEGIN
    ALTER TABLE historical_documents_global
    ADD COLUMN IF NOT EXISTS EMBEDDING_UPDATED_AT TIMESTAMPTZ;
EXCEPTION WHEN undefined_table THEN
    RAISE NOTICE 'Skipping EMBEDDING_UPDATED_AT';
END $$;

-- ============================================
-- 5. STRUCTURED CLASSIFICATION COLUMNS
-- ============================================
-- Add 6 thematic cluster columns + 4 LLM attribution columns

DO $$ 
BEGIN
    ALTER TABLE historical_documents_global
    ADD COLUMN IF NOT EXISTS STRUCTURED_TEMPORAL JSONB DEFAULT NULL;
EXCEPTION WHEN undefined_table THEN
    RAISE NOTICE 'Skipping STRUCTURED_TEMPORAL';
END $$;

DO $$ 
BEGIN
    ALTER TABLE historical_documents_global
    ADD COLUMN IF NOT EXISTS STRUCTURED_SPATIAL JSONB DEFAULT NULL;
EXCEPTION WHEN undefined_table THEN
    RAISE NOTICE 'Skipping STRUCTURED_SPATIAL';
END $$;

DO $$ 
BEGIN
    ALTER TABLE historical_documents_global
    ADD COLUMN IF NOT EXISTS STRUCTURED_CONTENT JSONB DEFAULT NULL;
EXCEPTION WHEN undefined_table THEN
    RAISE NOTICE 'Skipping STRUCTURED_CONTENT';
END $$;

DO $$ 
BEGIN
    ALTER TABLE historical_documents_global
    ADD COLUMN IF NOT EXISTS STRUCTURED_KNOWLEDGE_GRAPH JSONB DEFAULT NULL;
EXCEPTION WHEN undefined_table THEN
    RAISE NOTICE 'Skipping STRUCTURED_KNOWLEDGE_GRAPH';
END $$;

DO $$ 
BEGIN
    ALTER TABLE historical_documents_global
    ADD COLUMN IF NOT EXISTS STRUCTURED_PROVENANCE JSONB DEFAULT NULL;
EXCEPTION WHEN undefined_table THEN
    RAISE NOTICE 'Skipping STRUCTURED_PROVENANCE';
END $$;

DO $$ 
BEGIN
    ALTER TABLE historical_documents_global
    ADD COLUMN IF NOT EXISTS STRUCTURED_DISCOVERY JSONB DEFAULT NULL;
EXCEPTION WHEN undefined_table THEN
    RAISE NOTICE 'Skipping STRUCTURED_DISCOVERY';
END $$;

DO $$ 
BEGIN
    ALTER TABLE historical_documents_global
    ADD COLUMN IF NOT EXISTS CLASSIFICATION_LLM TEXT DEFAULT NULL;
EXCEPTION WHEN undefined_table THEN
    RAISE NOTICE 'Skipping CLASSIFICATION_LLM';
END $$;

DO $$ 
BEGIN
    ALTER TABLE historical_documents_global
    ADD COLUMN IF NOT EXISTS CLASSIFICATION_DATE TIMESTAMPTZ DEFAULT NULL;
EXCEPTION WHEN undefined_table THEN
    RAISE NOTICE 'Skipping CLASSIFICATION_DATE';
END $$;

DO $$ 
BEGIN
    ALTER TABLE historical_documents_global
    ADD COLUMN IF NOT EXISTS CLASSIFICATION_VERSION TEXT DEFAULT NULL;
EXCEPTION WHEN undefined_table THEN
    RAISE NOTICE 'Skipping CLASSIFICATION_VERSION';
END $$;

DO $$ 
BEGIN
    ALTER TABLE historical_documents_global
    ADD COLUMN IF NOT EXISTS CLASSIFICATION_CONFIDENCE NUMERIC(4,3) DEFAULT NULL;
EXCEPTION WHEN undefined_table THEN
    RAISE NOTICE 'Skipping CLASSIFICATION_CONFIDENCE';
END $$;

-- ============================================
-- 6. GIN INDEXES FOR JSONB COLUMNS
-- ============================================
-- Enable fast querying on structured cluster JSONB columns

DO $$ 
BEGIN
    CREATE INDEX IF NOT EXISTS idx_structured_temporal_gin 
    ON historical_documents_global USING GIN (STRUCTURED_TEMPORAL);
EXCEPTION WHEN undefined_table OR undefined_column THEN
    RAISE NOTICE 'Skipping GIN index for STRUCTURED_TEMPORAL';
END $$;

DO $$ 
BEGIN
    CREATE INDEX IF NOT EXISTS idx_structured_spatial_gin 
    ON historical_documents_global USING GIN (STRUCTURED_SPATIAL);
EXCEPTION WHEN undefined_table OR undefined_column THEN
    RAISE NOTICE 'Skipping GIN index for STRUCTURED_SPATIAL';
END $$;

DO $$ 
BEGIN
    CREATE INDEX IF NOT EXISTS idx_structured_content_gin 
    ON historical_documents_global USING GIN (STRUCTURED_CONTENT);
EXCEPTION WHEN undefined_table OR undefined_column THEN
    RAISE NOTICE 'Skipping GIN index for STRUCTURED_CONTENT';
END $$;

-- ============================================
-- COMPLETION MESSAGE
-- ============================================
SELECT '✅ Loadopoly-OCR v2.8.1 schema setup complete!' as result,
       'Run HEALTH_CHECK_V2.8.1.sql to verify' as next_step;
