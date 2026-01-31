-- ============================================
-- Migration: Enable Auto-Processing Trigger
-- ============================================
-- This migration sets up automatic Edge Function invocation
-- when new jobs are added to the processing queue.
--
-- The trigger uses pg_net extension to make async HTTP calls
-- to the Edge Function, enabling true background processing.
-- ============================================

-- 1. Enable pg_net extension
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- 2. Create the trigger function
CREATE OR REPLACE FUNCTION invoke_processing_worker()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public, extensions
LANGUAGE plpgsql
AS $$
DECLARE
  edge_function_url TEXT;
  service_role_key TEXT;
  pending_count INTEGER;
  processing_count INTEGER;
BEGIN
  -- Only invoke if this is a new PENDING job
  IF NEW.status != 'PENDING' THEN
    RETURN NEW;
  END IF;

  -- Check how many jobs are currently processing
  SELECT COUNT(*) INTO processing_count
  FROM processing_queue
  WHERE status = 'PROCESSING';

  -- If jobs are already being processed, the Edge Function chains itself
  IF processing_count > 0 THEN
    RETURN NEW;
  END IF;

  -- Check how many jobs are pending  
  SELECT COUNT(*) INTO pending_count
  FROM processing_queue
  WHERE status = 'PENDING';

  -- Debounce: only invoke on the first pending job
  IF pending_count > 1 THEN
    RETURN NEW;
  END IF;

  -- Edge Function URL (project ref: kuofzjhrrjgimtomgact)
  edge_function_url := 'https://kuofzjhrrjgimtomgact.supabase.co/functions/v1/process-ocr';
  
  -- Get service role key from vault
  SELECT decrypted_secret INTO service_role_key
  FROM vault.decrypted_secrets
  WHERE name = 'supabase_service_role_key'
  LIMIT 1;

  -- If no vault secret, skip invocation
  IF service_role_key IS NULL THEN
    RAISE WARNING 'No service role key in vault, skipping auto-invoke';
    RETURN NEW;
  END IF;

  -- Invoke Edge Function via pg_net (non-blocking HTTP POST)
  PERFORM extensions.http_post(
    url := edge_function_url,
    body := json_build_object('maxJobs', 5, 'triggeredBy', 'database_trigger')::text,
    headers := json_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_role_key
    )::jsonb
  );

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Failed to invoke Edge Function: %', SQLERRM;
    RETURN NEW;
END;
$$;

-- 3. Drop existing trigger if any
DROP TRIGGER IF EXISTS trg_invoke_processing_worker ON processing_queue;

-- 4. Create the trigger
CREATE TRIGGER trg_invoke_processing_worker
AFTER INSERT ON processing_queue
FOR EACH ROW
EXECUTE FUNCTION invoke_processing_worker();

-- 5. Grant permissions
GRANT USAGE ON SCHEMA extensions TO postgres, authenticated;
GRANT EXECUTE ON FUNCTION invoke_processing_worker() TO postgres;

-- 6. Add comments
COMMENT ON FUNCTION invoke_processing_worker() IS 'Auto-invokes process-ocr Edge Function when new jobs are queued';
COMMENT ON TRIGGER trg_invoke_processing_worker ON processing_queue IS 'Enables background processing without app interaction';
