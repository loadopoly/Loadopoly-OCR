-- Fix RLS policies for historical_documents_global
-- The error "new row violates row-level security policy" indicates that the current user (anon or authenticated)
-- does not have permission to INSERT or UPDATE rows.

-- 1. Enable RLS (ensure it's on)
ALTER TABLE public.historical_documents_global ENABLE ROW LEVEL SECURITY;

-- 2. Drop existing policies to start fresh and avoid conflicts
DROP POLICY IF EXISTS "Public Read" ON public.historical_documents_global;
DROP POLICY IF EXISTS "Public Anonymous Insert" ON public.historical_documents_global;
DROP POLICY IF EXISTS "Public Anonymous Update" ON public.historical_documents_global;
DROP POLICY IF EXISTS "Public Anonymous Delete" ON public.historical_documents_global;
DROP POLICY IF EXISTS "Allow Public Read" ON public.historical_documents_global;
DROP POLICY IF EXISTS "Allow Public Insert" ON public.historical_documents_global;
DROP POLICY IF EXISTS "Allow Public Update" ON public.historical_documents_global;

-- 3. Create permissive policies for this public contribution platform

-- Allow everyone to read everything
CREATE POLICY "Allow Public Read"
ON public.historical_documents_global
FOR SELECT
USING (true);

-- Allow everyone (anon + auth) to insert new records
CREATE POLICY "Allow Public Insert"
ON public.historical_documents_global
FOR INSERT
WITH CHECK (true);

-- Allow everyone to update records (needed for upsert)
-- Note: In a stricter app, you might restrict this to the creator (USING auth.uid() = "USER_ID")
-- But for this open contribution phase, we'll allow updates to ensure the pipeline works.
CREATE POLICY "Allow Public Update"
ON public.historical_documents_global
FOR UPDATE
USING (true)
WITH CHECK (true);

-- 4. Reload schema cache
NOTIFY pgrst, 'reload config';
