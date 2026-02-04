-- ============================================
-- QUICK SETUP: Auto-Processing Trigger (Production-Safe)
-- ============================================
-- Run this in Supabase Dashboard SQL Editor
-- Uses Vault to securely store the service key
-- ============================================

-- 1. Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- 2. Store service key in Vault (run this ONCE, then comment out)
-- Replace YOUR_SERVICE_ROLE_KEY with actual key from Project Settings → API
-- SELECT vault.create_secret('supabase_service_role_key', 'YOUR_SERVICE_ROLE_KEY');

-- 3. Create trigger function that reads key from Vault
CREATE OR REPLACE FUNCTION invoke_processing_worker()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public, extensions
LANGUAGE plpgsql
AS $$
DECLARE
  processing_count INTEGER;
  service_key TEXT;
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

  -- Get service key from Vault
  SELECT decrypted_secret INTO service_key
  FROM vault.decrypted_secrets
  WHERE name = 'supabase_service_role_key'
  LIMIT 1;

  -- Skip if no key configured
  IF service_key IS NULL THEN
    RAISE WARNING 'No service_role_key in Vault - run: SELECT vault.create_secret(...)';
    RETURN NEW;
  END IF;

  -- Invoke Edge Function via pg_net
  PERFORM net.http_post(
    url := 'https://kuofzjhrrjgimtomgact.supabase.co/functions/v1/process-ocr',
    body := '{"maxJobs": 5, "triggeredBy": "database_trigger"}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_key
    )
  );

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Auto-trigger failed: %', SQLERRM;
    RETURN NEW;
END;
$$;

-- 4. Create the trigger
DROP TRIGGER IF EXISTS trg_invoke_processing_worker ON processing_queue;

CREATE TRIGGER trg_invoke_processing_worker
AFTER INSERT ON processing_queue
FOR EACH ROW
EXECUTE FUNCTION invoke_processing_worker();

-- 5. IMPORTANT: Enable the trigger
ALTER TABLE processing_queue ENABLE TRIGGER trg_invoke_processing_worker;

-- 6. Verify it's enabled (should show 'O' for enabled)
SELECT tgname, tgenabled FROM pg_trigger WHERE tgname = 'trg_invoke_processing_worker';
