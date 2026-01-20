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

-- Note: Moving pgvector requires dropping and recreating
-- This will fail if columns use the vector type
-- Option 1: Keep in public but document the exception
-- Option 2: Full migration (requires table column changes)

-- For now, we'll document this as an accepted exception
-- since vector columns are used in historical_documents_global

-- If you want to fully migrate (CAUTION - requires downtime):
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
