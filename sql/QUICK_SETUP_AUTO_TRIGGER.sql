-- ============================================
-- QUICK SETUP: Auto-Processing Trigger (No Vault)
-- ============================================
-- Run this in Supabase Dashboard SQL Editor
-- This is a simplified version that embeds the service key directly.
-- For production, use Vault-based approach instead.
-- ============================================

-- 1. Enable pg_net extension
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- 2. Create simplified trigger function with embedded key
CREATE OR REPLACE FUNCTION invoke_processing_worker()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public, extensions
LANGUAGE plpgsql
AS $$
DECLARE
  processing_count INTEGER;
BEGIN
  -- Only invoke if this is a new PENDING job
  IF NEW.status != 'PENDING' THEN
    RETURN NEW;
  END IF;

  -- Check if jobs are already processing (Edge Function chains itself)
  SELECT COUNT(*) INTO processing_count
  FROM processing_queue
  WHERE status = 'PROCESSING';

  IF processing_count > 0 THEN
    RETURN NEW;
  END IF;

  -- Invoke Edge Function via pg_net
  -- The Edge Function URL and service key are embedded here
  PERFORM net.http_post(
    url := 'https://kuofzjhrrjgimtomgact.supabase.co/functions/v1/process-ocr',
    body := '{"maxJobs": 5, "triggeredBy": "database_trigger"}'::jsonb,
    headers := '{
      "Content-Type": "application/json",
      "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1b2Z6amhycmpnaW10b21nYWN0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTM5NDU1MiwiZXhwIjoyMDgwOTcwNTUyfQ._xXw9we6mEiipOr2yPmRuVUGr1fpjn8jVgfuRM2PO38"
    }'::jsonb
  );

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Auto-trigger failed: %', SQLERRM;
    RETURN NEW;
END;
$$;

-- 3. Create the trigger
DROP TRIGGER IF EXISTS trg_invoke_processing_worker ON processing_queue;

CREATE TRIGGER trg_invoke_processing_worker
AFTER INSERT ON processing_queue
FOR EACH ROW
EXECUTE FUNCTION invoke_processing_worker();

-- 4. Verify it's created
SELECT tgname, tgenabled FROM pg_trigger WHERE tgname = 'trg_invoke_processing_worker';
