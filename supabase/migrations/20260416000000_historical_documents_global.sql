-- ============================================================
-- Migration: historical_documents_global CREATE TABLE
-- ============================================================
-- Ensures the core document table exists with all required columns
-- including LATITUDE/LONGITUDE (required for the relational GIS model).
--
-- This is safe to run on both fresh and existing databases:
--   • CREATE TABLE IF NOT EXISTS — skips if table already exists
--   • ADD COLUMN IF NOT EXISTS  — adds missing columns only
-- ============================================================

-- 1. Create the table if it does not yet exist
CREATE TABLE IF NOT EXISTS historical_documents_global (
    "ID" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "CREATED_AT" TIMESTAMPTZ DEFAULT NOW(),

    -- Contributor / provenance
    "CONTRIBUTOR_ID" TEXT,
    "CONTRIBUTED_AT" TIMESTAMPTZ,
    "DATA_LICENSE" TEXT DEFAULT 'GEOGRAPH_CORPUS_1.0',
    "CONTRIBUTOR_NFT_MINTED" BOOLEAN DEFAULT false,

    -- Image / file
    "ORIGINAL_IMAGE_URL" TEXT,
    "ASSET_ID" TEXT UNIQUE,
    "FILE_FORMAT" TEXT,
    "FILE_SIZE_BYTES" BIGINT DEFAULT 0,
    "RESOLUTION_DPI" INTEGER DEFAULT 300,
    "COLOR_MODE" TEXT DEFAULT 'RGB',

    -- Document metadata
    "DOCUMENT_TITLE" TEXT,
    "DOCUMENT_DESCRIPTION" TEXT,
    "RAW_OCR_TRANSCRIPTION" TEXT,
    "PREPROCESS_OCR_TRANSCRIPTION" TEXT,

    -- Ownership
    "USER_ID" UUID REFERENCES auth.users(id) ON DELETE SET NULL,

    -- Accessibility
    "ALT_TEXT_SHORT" TEXT,
    "ALT_TEXT_LONG" TEXT,
    "AUDIO_DESCRIPTION" TEXT,
    "TACTILE_DESCRIPTION" TEXT,
    "READING_ORDER" JSONB,
    "ACCESSIBILITY_SCORE" NUMERIC(4,3) DEFAULT 0,

    -- Scan / classification
    "SCAN_TYPE" TEXT DEFAULT 'DOCUMENT',
    "SOURCE_COLLECTION" TEXT,
    "NLP_NODE_CATEGORIZATION" TEXT,
    "CREATOR_AGENT" TEXT,
    "RIGHTS_STATEMENT" TEXT,
    "LANGUAGE_CODE" TEXT DEFAULT 'en',
    "FIXITY_CHECKSUM" TEXT,

    -- GARD / tokenization
    "SHARD_TOKEN_ID" INTEGER,
    "NFT_TOKEN_ID" INTEGER,
    "REDEMPTION_STATUS" TEXT DEFAULT 'NONE',
    "WALLET_ADDRESS" TEXT,
    "REDEMPTION_DATE" TIMESTAMPTZ,
    "REDEMPTION_TX_HASH" TEXT,
    "SHARDS_COLLECTED" INTEGER DEFAULT 0,
    "SHARDS_REQUIRED" INTEGER DEFAULT 5,
    "SHIPPING_STATUS" TEXT,
    "TRACKING_NUMBER" TEXT,

    -- Timestamps
    "LOCAL_TIMESTAMP" TIMESTAMPTZ DEFAULT NOW(),
    "OCR_DERIVED_TIMESTAMP" TIMESTAMPTZ,
    "NLP_DERIVED_TIMESTAMP" TIMESTAMPTZ,
    "INGEST_DATE" TIMESTAMPTZ DEFAULT NOW(),
    "LAST_MODIFIED" TIMESTAMPTZ DEFAULT NOW(),

    -- GIS / Location — REQUIRED for the relational database model
    "LOCAL_GIS_ZONE" TEXT,
    "OCR_DERIVED_GIS_ZONE" TEXT,
    "NLP_DERIVED_GIS_ZONE" TEXT,
    "LATITUDE" DOUBLE PRECISION,
    "LONGITUDE" DOUBLE PRECISION,

    -- Counts
    "NODE_COUNT" INTEGER DEFAULT 0,
    "TOKEN_COUNT" INTEGER DEFAULT 0,

    -- Processing
    "PROCESSING_STATUS" TEXT DEFAULT 'PENDING',
    "CONFIDENCE_SCORE" NUMERIC(4,3) DEFAULT 0,

    -- JSONB arrays
    "ENTITIES_EXTRACTED" JSONB DEFAULT '[]'::jsonb,
    "RELATED_ASSETS" JSONB DEFAULT '[]'::jsonb,
    "PRESERVATION_EVENTS" JSONB DEFAULT '[]'::jsonb,
    "KEYWORDS_TAGS" JSONB DEFAULT '[]'::jsonb,

    -- Access
    "ACCESS_RESTRICTIONS" BOOLEAN DEFAULT false,
    "IS_ENTERPRISE" BOOLEAN DEFAULT false,

    -- Structured classification (populated by LLM)
    "TAXONOMY" JSONB,
    "ITEM_ATTRIBUTES" JSONB,
    "SCENERY_ATTRIBUTES" JSONB
);

-- 2. For existing tables, ensure LATITUDE/LONGITUDE columns exist
ALTER TABLE historical_documents_global
  ADD COLUMN IF NOT EXISTS "LATITUDE" DOUBLE PRECISION;
ALTER TABLE historical_documents_global
  ADD COLUMN IF NOT EXISTS "LONGITUDE" DOUBLE PRECISION;

-- Also ensure other columns that may have been added post-creation exist
ALTER TABLE historical_documents_global
  ADD COLUMN IF NOT EXISTS "TAXONOMY" JSONB;
ALTER TABLE historical_documents_global
  ADD COLUMN IF NOT EXISTS "ITEM_ATTRIBUTES" JSONB;
ALTER TABLE historical_documents_global
  ADD COLUMN IF NOT EXISTS "SCENERY_ATTRIBUTES" JSONB;
ALTER TABLE historical_documents_global
  ADD COLUMN IF NOT EXISTS "ACCESS_RESTRICTIONS" BOOLEAN DEFAULT false;
ALTER TABLE historical_documents_global
  ADD COLUMN IF NOT EXISTS "IS_ENTERPRISE" BOOLEAN DEFAULT false;
ALTER TABLE historical_documents_global
  ADD COLUMN IF NOT EXISTS "TOKEN_COUNT" INTEGER DEFAULT 0;
ALTER TABLE historical_documents_global
  ADD COLUMN IF NOT EXISTS "PREPROCESS_OCR_TRANSCRIPTION" TEXT;
ALTER TABLE historical_documents_global
  ADD COLUMN IF NOT EXISTS "ALT_TEXT_SHORT" TEXT;
ALTER TABLE historical_documents_global
  ADD COLUMN IF NOT EXISTS "ALT_TEXT_LONG" TEXT;
ALTER TABLE historical_documents_global
  ADD COLUMN IF NOT EXISTS "AUDIO_DESCRIPTION" TEXT;
ALTER TABLE historical_documents_global
  ADD COLUMN IF NOT EXISTS "TACTILE_DESCRIPTION" TEXT;
ALTER TABLE historical_documents_global
  ADD COLUMN IF NOT EXISTS "READING_ORDER" JSONB;
ALTER TABLE historical_documents_global
  ADD COLUMN IF NOT EXISTS "ACCESSIBILITY_SCORE" NUMERIC(4,3) DEFAULT 0;

-- 3. RLS
ALTER TABLE historical_documents_global ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "docs_read_owner_or_master" ON historical_documents_global;
DROP POLICY IF EXISTS "docs_insert_owner_or_service" ON historical_documents_global;
DROP POLICY IF EXISTS "docs_update_owner_or_service" ON historical_documents_global;
DROP POLICY IF EXISTS "Users view own documents" ON historical_documents_global;
DROP POLICY IF EXISTS "Authenticated insert own" ON historical_documents_global;
DROP POLICY IF EXISTS "Users update own documents" ON historical_documents_global;

CREATE POLICY "docs_read_owner_or_master"
ON historical_documents_global FOR SELECT
USING (
  (select auth.role()) = 'service_role'
  OR "USER_ID" = (select auth.uid())
  OR EXISTS (
    SELECT 1
    FROM public.master_user_access mua
    WHERE mua."USER_ID" = (select auth.uid())
      AND mua."CAN_ACCESS_CORPUS" = true
  )
);

CREATE POLICY "docs_insert_owner_or_service"
ON historical_documents_global FOR INSERT
WITH CHECK (
  (select auth.role()) = 'service_role'
  OR "USER_ID" = (select auth.uid())
);

CREATE POLICY "docs_update_owner_or_service"
ON historical_documents_global FOR UPDATE
USING (
  (select auth.role()) = 'service_role'
  OR "USER_ID" = (select auth.uid())
)
WITH CHECK (
  (select auth.role()) = 'service_role'
  OR "USER_ID" = (select auth.uid())
);

-- 4. Performance indexes
CREATE INDEX IF NOT EXISTS idx_documents_user
  ON historical_documents_global("USER_ID") WHERE "USER_ID" IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_documents_asset
  ON historical_documents_global("ASSET_ID") WHERE "ASSET_ID" IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_documents_status
  ON historical_documents_global("PROCESSING_STATUS");
CREATE INDEX IF NOT EXISTS idx_documents_scan_type
  ON historical_documents_global("SCAN_TYPE");
CREATE INDEX IF NOT EXISTS idx_documents_lat_lng
  ON historical_documents_global("LATITUDE", "LONGITUDE")
  WHERE "LATITUDE" IS NOT NULL AND "LONGITUDE" IS NOT NULL;
