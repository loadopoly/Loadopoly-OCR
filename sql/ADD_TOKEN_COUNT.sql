-- Add TOKEN_COUNT column to historical_documents_global
ALTER TABLE public.historical_documents_global 
ADD COLUMN IF NOT EXISTS "TOKEN_COUNT" INTEGER DEFAULT 0;

-- Update existing records if possible (optional, but good for consistency)
-- UPDATE public.historical_documents_global SET "TOKEN_COUNT" = 0 WHERE "TOKEN_COUNT" IS NULL;
