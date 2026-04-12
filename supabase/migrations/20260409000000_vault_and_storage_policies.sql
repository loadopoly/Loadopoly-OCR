-- Migration: Vault secret + storage policies
-- Applied: 2026-04-09

-- ============================================
-- 1. Vault Secret for pg_cron authentication
-- ============================================
-- Upsert the service role key so pg_cron jobs can authenticate
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM vault.secrets WHERE name = 'supabase_service_role_key'
  ) THEN
    PERFORM vault.create_secret(
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1b2Z6amhycmpnaW10b21nYWN0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTM5NDU1MiwiZXhwIjoyMDgwOTcwNTUyfQ._xXw9we6mEiipOr2yPmRuVUGr1fpjn8jVgfuRM2PO38',
      'supabase_service_role_key'
    );
  END IF;
END $$;

-- ============================================
-- 2. Storage Policies for corpus-images bucket
-- ============================================
DO $$
BEGIN
  -- Allow public uploads
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'Allow Public Uploads'
  ) THEN
    CREATE POLICY "Allow Public Uploads"
    ON storage.objects FOR INSERT
    TO public
    WITH CHECK (bucket_id = 'corpus-images');
  END IF;

  -- Allow public reads
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'Allow Public Reads'
  ) THEN
    CREATE POLICY "Allow Public Reads"
    ON storage.objects FOR SELECT
    TO public
    USING (bucket_id = 'corpus-images');
  END IF;

  -- Allow authenticated updates (for processing status updates)
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'Allow Authenticated Updates'
  ) THEN
    CREATE POLICY "Allow Authenticated Updates"
    ON storage.objects FOR UPDATE
    TO authenticated
    USING (bucket_id = 'corpus-images');
  END IF;
END $$;
