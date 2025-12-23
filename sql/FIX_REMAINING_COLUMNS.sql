-- Ensure ORIGINAL_IMAGE_URL and USER_ID exist (renaming from lowercase if needed)
-- This fixes the "Could not find column" errors by ensuring the DB matches the UPPERCASE convention.

DO $$
BEGIN
    -- Rename original_image_url -> ORIGINAL_IMAGE_URL
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'historical_documents_global' AND column_name = 'original_image_url') THEN
        ALTER TABLE public.historical_documents_global RENAME COLUMN original_image_url TO "ORIGINAL_IMAGE_URL";
    END IF;

    -- Rename user_id -> USER_ID
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'historical_documents_global' AND column_name = 'user_id') THEN
        ALTER TABLE public.historical_documents_global RENAME COLUMN user_id TO "USER_ID";
    END IF;

    -- Add ORIGINAL_IMAGE_URL if it doesn't exist (and wasn't renamed)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'historical_documents_global' AND column_name = 'ORIGINAL_IMAGE_URL') THEN
        ALTER TABLE public.historical_documents_global ADD COLUMN "ORIGINAL_IMAGE_URL" TEXT;
    END IF;

    -- Add USER_ID if it doesn't exist (and wasn't renamed)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'historical_documents_global' AND column_name = 'USER_ID') THEN
        ALTER TABLE public.historical_documents_global ADD COLUMN "USER_ID" UUID REFERENCES auth.users(id) ON DELETE SET NULL;
    END IF;

END $$;

NOTIFY pgrst, 'reload config';
