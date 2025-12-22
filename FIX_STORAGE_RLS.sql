-- Fix for "new row violates row-level security policy" during upload
-- The application uses 'upsert: true', which requires UPDATE permissions in addition to INSERT.

-- 1. Drop existing restrictive policies to avoid conflicts
DROP POLICY IF EXISTS "Allow Public Uploads" ON storage.objects;
DROP POLICY IF EXISTS "Allow Public Reads" ON storage.objects;
DROP POLICY IF EXISTS "Give users access to own folder" ON storage.objects;

-- 2. Create a comprehensive policy for the 'corpus-images' bucket
-- Allows INSERT, UPDATE, and SELECT for everyone (Public)
CREATE POLICY "Allow Public Access to Corpus Images"
ON storage.objects FOR ALL
TO public
USING ( bucket_id = 'corpus-images' )
WITH CHECK ( bucket_id = 'corpus-images' );

-- 3. Ensure the bucket is public (idempotent)
UPDATE storage.buckets
SET public = true
WHERE id = 'corpus-images';

-- 4. (Optional) If the bucket doesn't exist, insert it
INSERT INTO storage.buckets (id, name, public)
VALUES ('corpus-images', 'corpus-images', true)
ON CONFLICT (id) DO UPDATE SET public = true;
