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

-- 3. Create robust policies for mass usage

-- Allow everyone to read everything (Public Corpus)
CREATE POLICY "Allow Public Read"
ON public.historical_documents_global
FOR SELECT
USING (true);

-- Allow everyone (anon + auth) to insert new records
-- If authenticated, the USER_ID should match their UID
CREATE POLICY "Allow Public Insert"
ON public.historical_documents_global
FOR INSERT
WITH CHECK (
  (auth.uid() IS NULL) OR (auth.uid() = "USER_ID")
);

-- Allow only the owner to update their records
-- If the record has no USER_ID, it's considered "publicly owned" and can be updated by anyone (for now)
-- In a more strict environment, you'd prevent updates to records without a USER_ID
CREATE POLICY "Allow Owner Update"
ON public.historical_documents_global
FOR UPDATE
USING (
  ("USER_ID" IS NULL) OR (auth.uid() = "USER_ID")
)
WITH CHECK (
  ("USER_ID" IS NULL) OR (auth.uid() = "USER_ID")
);

-- Allow only the owner to delete their records
CREATE POLICY "Allow Owner Delete"
ON public.historical_documents_global
FOR DELETE
USING (
  auth.uid() = "USER_ID"
);

-- 4. Reload schema cache
NOTIFY pgrst, 'reload config';
