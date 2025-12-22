-- Fix for "Could not find the 'ASSET_ID' column" error
-- This script ensures all columns in 'historical_documents_global' match the UPPERCASE naming convention used by the application.

-- 1. Reload the schema cache (fixes stale cache issues)
NOTIFY pgrst, 'reload config';

-- 2. Rename columns from lowercase to UPPERCASE if they exist in lowercase
-- This handles cases where the table was created without quotes.

DO $$
BEGIN
    -- Rename asset_id -> ASSET_ID
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'historical_documents_global' AND column_name = 'asset_id') THEN
        ALTER TABLE public.historical_documents_global RENAME COLUMN asset_id TO "ASSET_ID";
    END IF;

    -- Rename local_timestamp -> LOCAL_TIMESTAMP
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'historical_documents_global' AND column_name = 'local_timestamp') THEN
        ALTER TABLE public.historical_documents_global RENAME COLUMN local_timestamp TO "LOCAL_TIMESTAMP";
    END IF;

    -- Rename document_title -> DOCUMENT_TITLE
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'historical_documents_global' AND column_name = 'document_title') THEN
        ALTER TABLE public.historical_documents_global RENAME COLUMN document_title TO "DOCUMENT_TITLE";
    END IF;

    -- Rename document_description -> DOCUMENT_DESCRIPTION
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'historical_documents_global' AND column_name = 'document_description') THEN
        ALTER TABLE public.historical_documents_global RENAME COLUMN document_description TO "DOCUMENT_DESCRIPTION";
    END IF;

    -- Rename raw_ocr_transcription -> RAW_OCR_TRANSCRIPTION
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'historical_documents_global' AND column_name = 'raw_ocr_transcription') THEN
        ALTER TABLE public.historical_documents_global RENAME COLUMN raw_ocr_transcription TO "RAW_OCR_TRANSCRIPTION";
    END IF;

    -- Rename data_license -> DATA_LICENSE
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'historical_documents_global' AND column_name = 'data_license') THEN
        ALTER TABLE public.historical_documents_global RENAME COLUMN data_license TO "DATA_LICENSE";
    END IF;

    -- Rename entities_extracted -> ENTITIES_EXTRACTED
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'historical_documents_global' AND column_name = 'entities_extracted') THEN
        ALTER TABLE public.historical_documents_global RENAME COLUMN entities_extracted TO "ENTITIES_EXTRACTED";
    END IF;

    -- Rename keywords_tags -> KEYWORDS_TAGS
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'historical_documents_global' AND column_name = 'keywords_tags') THEN
        ALTER TABLE public.historical_documents_global RENAME COLUMN keywords_tags TO "KEYWORDS_TAGS";
    END IF;

    -- Rename preservation_events -> PRESERVATION_EVENTS
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'historical_documents_global' AND column_name = 'preservation_events') THEN
        ALTER TABLE public.historical_documents_global RENAME COLUMN preservation_events TO "PRESERVATION_EVENTS";
    END IF;

    -- Rename is_enterprise -> IS_ENTERPRISE
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'historical_documents_global' AND column_name = 'is_enterprise') THEN
        ALTER TABLE public.historical_documents_global RENAME COLUMN is_enterprise TO "IS_ENTERPRISE";
    END IF;
    
    -- Rename contributor_id -> CONTRIBUTOR_ID
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'historical_documents_global' AND column_name = 'contributor_id') THEN
        ALTER TABLE public.historical_documents_global RENAME COLUMN contributor_id TO "CONTRIBUTOR_ID";
    END IF;

    -- Rename contributed_at -> CONTRIBUTED_AT
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'historical_documents_global' AND column_name = 'contributed_at') THEN
        ALTER TABLE public.historical_documents_global RENAME COLUMN contributed_at TO "CONTRIBUTED_AT";
    END IF;

END $$;

-- 3. Reload schema cache again to ensure changes are picked up
NOTIFY pgrst, 'reload config';
