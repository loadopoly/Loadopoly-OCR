-- =============================================
-- FIX: Extension in Public Schema
-- =============================================
-- Issue: vector extension is installed in public schema
-- Solution: Move to dedicated extensions schema
-- =============================================

-- Create extensions schema if not exists
CREATE SCHEMA IF NOT EXISTS extensions;

-- Grant usage to authenticated users
GRANT USAGE ON SCHEMA extensions TO authenticated;
GRANT USAGE ON SCHEMA extensions TO service_role;
GRANT USAGE ON SCHEMA extensions TO anon;

-- Move vector extension to extensions schema
-- This is generally safe if columns use the type, as long as the schema is in search_path
ALTER EXTENSION vector SET SCHEMA extensions;

-- Alternative: Full migration (requires table column changes if simple move fails)
/*
-- 1. Backup your data first!

-- 2. Drop vector columns temporarily
ALTER TABLE public.historical_documents_global 
  DROP COLUMN IF EXISTS TEXT_EMBEDDING,
  DROP COLUMN IF EXISTS IMAGE_EMBEDDING,
  DROP COLUMN IF EXISTS COMBINED_EMBEDDING;

-- 3. Drop and recreate extension in new schema
DROP EXTENSION IF EXISTS vector;
CREATE EXTENSION vector SCHEMA extensions;

-- 4. Recreate columns with schema-qualified type
ALTER TABLE public.historical_documents_global 
  ADD COLUMN TEXT_EMBEDDING extensions.vector(768),
  ADD COLUMN IMAGE_EMBEDDING extensions.vector(512),
  ADD COLUMN COMBINED_EMBEDDING extensions.vector(768);
*/

-- Alternative: Add to linter ignore list in Supabase dashboard
-- Go to: Database > Linter > Ignore Rules

SELECT '⚠️ Vector extension in public schema - accepted exception (documented)' AS result;
