-- ============================================
-- ENABLE AUTO-PROCESSING TRIGGER
-- ============================================
-- This creates a database trigger that automatically invokes
-- the process-ocr Edge Function when jobs are added to the queue.
--
-- This enables TRUE OFFLINE/BACKGROUND PROCESSING:
-- 1. User uploads files and closes the app
-- 2. Database trigger invokes Edge Function
-- 3. Edge Function processes jobs and chains to itself for remaining jobs
-- 4. User re-opens app to find all items processed
--
-- Prerequisites:
-- 1. pg_net extension must be enabled in Supabase
-- 2. process-ocr Edge Function must be deployed
-- 3. GEMINI_API_KEY must be set in Edge Function secrets
-- 4. Update YOUR_PROJECT_REF with your actual Supabase project reference
--
-- Run this in Supabase SQL Editor
-- ============================================

-- 1. Enable pg_net extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- 2. Create the trigger function that calls the Edge Function
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
  IF NEW.STATUS != 'PENDING' THEN
    RETURN NEW;
  END IF;

  -- Check how many jobs are currently processing
  -- The Edge Function chains itself, so we only need to trigger if nothing is running
  SELECT COUNT(*) INTO processing_count
  FROM processing_queue
  WHERE STATUS = 'PROCESSING';

  -- If jobs are already being processed, the Edge Function will chain and pick up new jobs
  IF processing_count > 0 THEN
    RETURN NEW;
  END IF;

  -- Check how many jobs are pending
  SELECT COUNT(*) INTO pending_count
  FROM processing_queue
  WHERE STATUS = 'PENDING';

  -- Debounce: only invoke on the first pending job (subsequent ones will be chained)
  -- or if this is a batch and we're hitting a threshold
  IF pending_count > 1 AND (pending_count % 10) != 1 THEN
    RETURN NEW;
  END IF;

  -- Get Edge Function URL
  -- Replace YOUR_PROJECT_REF with your actual Supabase project reference
  edge_function_url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/process-ocr';
  
  -- Get service role key from vault
  -- You must store this in Supabase Vault first:
  -- SELECT vault.create_secret('supabase_service_role_key', 'your-service-role-key-here');
  SELECT decrypted_secret INTO service_role_key
  FROM vault.decrypted_secrets
  WHERE name = 'supabase_service_role_key'
  LIMIT 1;

  -- If no vault secret, skip invocation (will need manual/cron trigger)
  IF service_role_key IS NULL THEN
    RAISE WARNING 'No service role key in vault, skipping Edge Function invocation';
    RETURN NEW;
  END IF;

  -- Invoke Edge Function via pg_net (non-blocking HTTP POST)
  PERFORM extensions.http_post(
    url := edge_function_url,
    body := json_build_object('maxJobs', 5)::text,
    headers := json_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_role_key
    )::jsonb
  );

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log error but don't fail the insert
    RAISE WARNING 'Failed to invoke Edge Function: %', SQLERRM;
    RETURN NEW;
END;
$$;

-- 3. Create the trigger
DROP TRIGGER IF EXISTS trg_invoke_processing_worker ON processing_queue;

CREATE TRIGGER trg_invoke_processing_worker
AFTER INSERT ON processing_queue
FOR EACH ROW
EXECUTE FUNCTION invoke_processing_worker();

-- 4. Grant necessary permissions
GRANT USAGE ON SCHEMA extensions TO postgres, authenticated;
GRANT EXECUTE ON FUNCTION invoke_processing_worker() TO postgres;

-- ============================================
-- HOW IT WORKS: The Chaining Model
-- ============================================
-- 1. User uploads 50 images → 50 rows inserted into processing_queue
-- 2. First INSERT triggers this function → Edge Function invoked
-- 3. Edge Function claims 5 jobs, processes them
-- 4. Edge Function checks for remaining PENDING jobs
-- 5. If jobs remain, Edge Function calls ITSELF again (fire-and-forget)
-- 6. This continues until queue is empty
-- 7. User can close app - processing continues in background!
--
-- The chaining logic is in: supabase/functions/process-ocr/index.ts
-- Look for "Auto-Chain" section
-- ============================================

-- ============================================
-- ALTERNATIVE: Manual invocation from client
-- ============================================
-- If pg_net setup is complex, you can call the Edge Function
-- directly from the client after queueing. See the client-side
-- fix in processingQueueService.ts

COMMENT ON FUNCTION invoke_processing_worker() IS 'Trigger function to auto-invoke process-ocr Edge Function when jobs are queued. Enables background processing.';
COMMENT ON TRIGGER trg_invoke_processing_worker ON processing_queue IS 'Automatically invokes Edge Function when new processing jobs are queued, enabling offline processing.';
