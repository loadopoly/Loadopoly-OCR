-- =============================================
-- FIX: Supabase Commit/Insert Issues
-- =============================================
-- This script fixes the common issue where data cannot be 
-- inserted into Supabase due to RLS policy misconfiguration.
--
-- Run this in your Supabase SQL Editor (Dashboard > SQL Editor)
-- =============================================

BEGIN;

-- ============================================
-- STEP 1: Ensure the main table exists
-- ============================================
CREATE TABLE IF NOT EXISTS public.historical_documents_global (
    ID UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ASSET_ID TEXT UNIQUE,
    USER_ID UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    
    -- Document metadata
    DOCUMENT_TITLE TEXT,
    DOCUMENT_DESCRIPTION TEXT,
    RAW_OCR_TRANSCRIPTION TEXT,
    
    -- Status and processing
    PROCESSING_STATUS TEXT DEFAULT 'PENDING',
    CONFIDENCE_SCORE NUMERIC(4,3) DEFAULT 0,
    
    -- Licensing
    DATA_LICENSE TEXT DEFAULT 'GEOGRAPH_CORPUS_1.0',
        IS_PUBLIC BOOLEAN DEFAULT false,    IS_PUBLIC BOOLEAN DEFAULT false,,    IS_PUBLIC BOOLEAN DEFAULT false,
    
    -- Contributor info
    CONTRIBUTOR_ID TEXT,
    CONTRIBUTED_AT TIMESTAMPTZ,
    CONTRIBUTOR_NFT_MINTED BOOLEAN DEFAULT false,
    
    -- File info
    ORIGINAL_IMAGE_URL TEXT,
    FILE_FORMAT TEXT,
    FILE_SIZE_BYTES BIGINT DEFAULT 0,
    
    -- Scan type
    SCAN_TYPE TEXT DEFAULT 'DOCUMENT',
    SOURCE_COLLECTION TEXT,
    
    -- Timestamps
    LOCAL_TIMESTAMP TIMESTAMPTZ DEFAULT NOW(),
    CREATED_AT TIMESTAMPTZ DEFAULT NOW(),
    LAST_MODIFIED TIMESTAMPTZ DEFAULT NOW(),
    INGEST_DATE TIMESTAMPTZ DEFAULT NOW(),
    
    -- Arrays stored as JSONB
    ENTITIES_EXTRACTED JSONB DEFAULT '[]'::jsonb,
    KEYWORDS_TAGS JSONB DEFAULT '[]'::jsonb,
    RELATED_ASSETS JSONB DEFAULT '[]'::jsonb,
    PRESERVATION_EVENTS JSONB DEFAULT '[]'::jsonb,
    
    -- GIS data
    LOCAL_GIS_ZONE TEXT,
    
    -- Other fields
    TOKEN_COUNT INTEGER DEFAULT 0,
    NODE_COUNT INTEGER DEFAULT 0,
    LANGUAGE_CODE TEXT DEFAULT 'en',
    RIGHTS_STATEMENT TEXT,
    FIXITY_CHECKSUM TEXT,
    RESOLUTION_DPI INTEGER DEFAULT 300,
    COLOR_MODE TEXT DEFAULT 'RGB',
    CREATOR_AGENT TEXT
);

-- ============================================
-- STEP 2: Enable RLS (required for policies to work)
-- ============================================
ALTER TABLE public.historical_documents_global ENABLE ROW LEVEL SECURITY;

-- ============================================
-- STEP 3: Drop ALL existing policies to start fresh
-- ============================================
DO $$
DECLARE
    pol RECORD;
BEGIN
    FOR pol IN 
        SELECT policyname 
        FROM pg_policies 
        WHERE tablename = 'historical_documents_global' 
        AND schemaname = 'public'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.historical_documents_global', pol.policyname);
    END LOOP;
END $$;

-- ============================================
-- STEP 4: Create proper RLS policies
-- ============================================

-- SELECT: Users can view their own docs, public docs, and anonymous docs
CREATE POLICY "Users view own documents"
ON public.historical_documents_global FOR SELECT
USING (
    "USER_ID" = (select auth.uid())
    OR "IS_PUBLIC" = true
    OR "USER_ID" IS NULL
);

-- INSERT: Users can insert their own docs OR anonymous docs (USER_ID = NULL)
-- This is the CRITICAL fix - INSERT needs WITH CHECK, not USING
CREATE POLICY "Authenticated insert own"
ON public.historical_documents_global FOR INSERT
WITH CHECK (
    (select auth.uid()) IS NOT NULL AND "USER_ID" = (select auth.uid())
    OR "USER_ID" IS NULL
);

-- UPDATE: Users can only update their own documents
CREATE POLICY "Users update own documents"
ON public.historical_documents_global FOR UPDATE
USING ("USER_ID" = (select auth.uid()))
WITH CHECK ("USER_ID" = (select auth.uid()));

-- DELETE: Users can only delete their own documents  
CREATE POLICY "Users delete own documents"
ON public.historical_documents_global FOR DELETE
USING ("USER_ID" = (select auth.uid()));

-- ============================================
-- STEP 5: Fix storage bucket for image uploads
-- ============================================

-- Create bucket if not exists
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'corpus-images', 
    'corpus-images', 
    true,
    52428800, -- 50MB limit
    ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/tiff']
)
ON CONFLICT (id) DO UPDATE SET 
    public = true,
    file_size_limit = 52428800;

-- Drop existing storage policies
DROP POLICY IF EXISTS "Allow Public Access to Corpus Images" ON storage.objects;
DROP POLICY IF EXISTS "Allow Public Uploads" ON storage.objects;
DROP POLICY IF EXISTS "Allow Public Reads" ON storage.objects;

-- Create permissive storage policy
CREATE POLICY "Allow Public Access to Corpus Images"
ON storage.objects FOR ALL
TO public
USING (bucket_id = 'corpus-images')
WITH CHECK (bucket_id = 'corpus-images');

-- ============================================
-- STEP 6: Create indexes for performance
-- ============================================
CREATE INDEX IF NOT EXISTS idx_hdg_user_id ON public.historical_documents_global("USER_ID");
CREATE INDEX IF NOT EXISTS idx_hdg_asset_id ON public.historical_documents_global("ASSET_ID");
CREATE INDEX IF NOT EXISTS idx_hdg_created_at ON public.historical_documents_global("CREATED_AT" DESC);
CREATE INDEX IF NOT EXISTS idx_hdg_status ON public.historical_documents_global("PROCESSING_STATUS");

COMMIT;

-- ============================================
-- VERIFICATION: Test that policies work
-- ============================================
SELECT 
    'Policies created' as status,
    count(*) as policy_count
FROM pg_policies 
WHERE tablename = 'historical_documents_global' AND schemaname = 'public';

-- Show the policies
SELECT policyname, cmd, qual, with_check 
FROM pg_policies 
WHERE tablename = 'historical_documents_global' AND schemaname = 'public';
