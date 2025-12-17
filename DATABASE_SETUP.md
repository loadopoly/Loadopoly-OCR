# Supabase Database Setup Guide

Follow these steps to configure your Supabase backend for GeoGraph Node.

## 1. Create a Storage Bucket
1. Log in to your Supabase Dashboard.
2. Go to **Storage**.
3. Create a new bucket named `corpus-images`.
4. Set the bucket to **Public**.

## 2. Run Database Migrations
Go to the **SQL Editor** and run the following script to initialize the relational schema.

```sql
-- ENABLE EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- CORE GLOBAL CORPUS TABLE
CREATE TABLE IF NOT EXISTS public.historical_documents_global (
    "ASSET_ID" TEXT PRIMARY KEY,
    "LOCAL_TIMESTAMP" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "OCR_DERIVED_TIMESTAMP" TEXT,
    "NLP_DERIVED_TIMESTAMP" TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "LOCAL_GIS_ZONE" TEXT,
    "OCR_DERIVED_GIS_ZONE" TEXT,
    "NLP_DERIVED_GIS_ZONE" TEXT,
    "NODE_COUNT" INTEGER DEFAULT 0,
    "NLP_NODE_CATEGORIZATION" TEXT,
    "RAW_OCR_TRANSCRIPTION" TEXT,
    "PREPROCESS_OCR_TRANSCRIPTION" TEXT,
    "SOURCE_COLLECTION" TEXT,
    "DOCUMENT_TITLE" TEXT,
    "DOCUMENT_DESCRIPTION" TEXT,
    "FILE_FORMAT" TEXT,
    "FILE_SIZE_BYTES" BIGINT DEFAULT 0,
    "RESOLUTION_DPI" INTEGER DEFAULT 72,
    "COLOR_MODE" TEXT DEFAULT 'RGB',
    "CREATOR_AGENT" TEXT,
    "RIGHTS_STATEMENT" TEXT,
    "LANGUAGE_CODE" TEXT DEFAULT 'en-US',
    "FIXITY_CHECKSUM" TEXT,
    "INGEST_DATE" TIMESTAMPTZ DEFAULT NOW(),
    "LAST_MODIFIED" TIMESTAMPTZ DEFAULT NOW(),
    "PROCESSING_STATUS" TEXT DEFAULT 'PENDING',
    "CONFIDENCE_SCORE" DECIMAL(3,2) DEFAULT 0.00,
    "ENTITIES_EXTRACTED" JSONB DEFAULT '[]'::jsonb, -- Relational Data Source
    "RELATED_ASSETS" JSONB DEFAULT '[]'::jsonb,
    "PRESERVATION_EVENTS" JSONB DEFAULT '[]'::jsonb,
    "KEYWORDS_TAGS" JSONB DEFAULT '[]'::jsonb,
    "ACCESS_RESTRICTIONS" BOOLEAN DEFAULT FALSE,
    scan_type TEXT DEFAULT 'DOCUMENT',
    "TAXONOMY" JSONB,
    "ITEM_ATTRIBUTES" JSONB,
    "SCENERY_ATTRIBUTES" JSONB,
    alt_text_short TEXT,
    alt_text_long TEXT,
    reading_order JSONB,
    accessibility_score DECIMAL(3,2),
    "CONTRIBUTOR_ID" TEXT,
    "CONTRIBUTED_AT" TIMESTAMPTZ,
    "DATA_LICENSE" TEXT DEFAULT 'GEOGRAPH_CORPUS_1.0',
    "CONTRIBUTOR_NFT_MINTED" BOOLEAN DEFAULT FALSE,
    original_image_url TEXT, -- Permanent Storage Link
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- INDEXING FOR PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_hdg_category ON public.historical_documents_global("NLP_NODE_CATEGORIZATION");
CREATE INDEX IF NOT EXISTS idx_hdg_collection ON public.historical_documents_global("SOURCE_COLLECTION");

-- RLS POLICIES
ALTER TABLE public.historical_documents_global ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public Read" ON public.historical_documents_global FOR SELECT USING (true);
CREATE POLICY "Public Anonymous Insert" ON public.historical_documents_global FOR INSERT WITH CHECK (true);
```

## 3. Security Note
While `Public Anonymous Insert` is enabled for ease of beta testing, we recommend switching to authenticated-only inserts for production environments.