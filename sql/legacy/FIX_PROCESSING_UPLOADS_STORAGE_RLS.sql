-- =============================================================
-- FIX: Storage RLS for 'processing-uploads' bucket
-- Run this in Supabase SQL Editor (as postgres / service role)
--
-- Root Cause: All previous RLS fixes only covered 'corpus-images'.
-- The app uploads to 'processing-uploads' which had no INSERT policy,
-- causing "new row violates row-level security policy" on every upload.
-- =============================================================

-- STEP 1: Ensure the bucket exists with correct settings
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'processing-uploads',
  'processing-uploads',
  false,                                         -- private: only authenticated users
  52428800,                                      -- 50MB max file size
  ARRAY['image/jpeg','image/png','image/webp','image/heic','application/pdf']
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit   = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types,
  public            = EXCLUDED.public;

-- STEP 2: Drop stale / conflicting policies on this bucket
DROP POLICY IF EXISTS "Users can upload to own folder"            ON storage.objects;
DROP POLICY IF EXISTS "Users can update own uploads"              ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own uploads"              ON storage.objects;
DROP POLICY IF EXISTS "Users can read own uploads"                ON storage.objects;
DROP POLICY IF EXISTS "Service role full access to processing"    ON storage.objects;

-- STEP 3: Allow authenticated users to INSERT into their own folder
--         Path convention: {user_id}/{asset_id}/{filename}
CREATE POLICY "Users can upload to own folder"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'processing-uploads'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- STEP 4: Allow authenticated users to SELECT (read) their own uploads
CREATE POLICY "Users can read own uploads"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'processing-uploads'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- STEP 5: Allow authenticated users to UPDATE (upsert) their own uploads
CREATE POLICY "Users can update own uploads"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'processing-uploads'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- STEP 6: Allow authenticated users to DELETE their own uploads
CREATE POLICY "Users can delete own uploads"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'processing-uploads'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- STEP 7: Allow the service role (Edge Functions) full access
--         Edge Functions use the service_role key to read uploaded images for OCR
CREATE POLICY "Service role full access to processing"
ON storage.objects FOR ALL
TO service_role
USING (bucket_id = 'processing-uploads')
WITH CHECK (bucket_id = 'processing-uploads');

-- STEP 8: Verify — should return 5 rows
SELECT policyname, cmd, roles
FROM pg_policies
WHERE tablename = 'objects'
  AND schemaname = 'storage'
  AND (policyname ILIKE '%processing%' OR policyname ILIKE '%upload%')
ORDER BY policyname;
