-- ============================================
-- Migration: Schedule Continuous Edge Processing
-- ============================================
-- Ensures OCR processing and stale lock cleanup run continuously
-- on the server side via pg_cron, independent of any client app.
--
-- This closes the gap where PENDING jobs sit idle if the user
-- closes the app — the Edge Function is now invoked every 5 minutes
-- by the database itself.
-- ============================================

-- 1. Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- ============================================
-- 2. Scheduled OCR Processing (every 5 minutes)
-- ============================================
-- Invokes the process-ocr Edge Function to claim and process
-- up to 5 PENDING jobs. Safe to call even when queue is empty —
-- the Edge Function short-circuits if no work is available.

SELECT cron.unschedule('scheduled-ocr-processing')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'scheduled-ocr-processing');

SELECT cron.schedule(
  'scheduled-ocr-processing',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://kuofzjhrrjgimtomgact.supabase.co/functions/v1/process-ocr',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (
        SELECT decrypted_secret FROM vault.decrypted_secrets
        WHERE name = 'supabase_service_role_key' LIMIT 1
      ),
      'Content-Type', 'application/json'
    ),
    body := '{"maxJobs": 5, "triggeredBy": "pg_cron"}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);

-- ============================================
-- 3. Stale Lock Cleanup (every 10 minutes)
-- ============================================
-- Releases jobs stuck in PROCESSING state > 2 minutes.
-- Prevents queue blockage when an Edge Function invocation
-- times out or crashes without updating the job status.

SELECT cron.unschedule('scheduled-stale-lock-release')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'scheduled-stale-lock-release');

SELECT cron.schedule(
  'scheduled-stale-lock-release',
  '*/10 * * * *',
  $$
  UPDATE processing_queue
  SET "STATUS" = 'PENDING',
      "WORKER_ID" = NULL,
      "LOCKED_AT" = NULL,
      "UPDATED_AT" = now()
  WHERE "STATUS" = 'PROCESSING'
    AND "LOCKED_AT" < now() - interval '2 minutes';
  $$
);

-- ============================================
-- 4. Knowledge Graph Backfill (every hour)
-- ============================================
-- Extracts entities and relationships from completed assets
-- that haven't been processed for KG yet.

SELECT cron.unschedule('kg-backfill-auto')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'kg-backfill-auto');

SELECT cron.schedule(
  'kg-backfill-auto',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://kuofzjhrrjgimtomgact.supabase.co/functions/v1/kg-backfill',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (
        SELECT decrypted_secret FROM vault.decrypted_secrets
        WHERE name = 'supabase_service_role_key' LIMIT 1
      ),
      'Content-Type', 'application/json'
    ),
    body := '{"batchSize": 50, "onlyUnprocessed": true}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);

-- ============================================
-- 5. Verification queries (run manually)
-- ============================================
-- SELECT * FROM cron.job;
-- SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 20;
