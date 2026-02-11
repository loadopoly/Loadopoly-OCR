-- =============================================
-- FIX: Queue Function Search Path & Column Casing
-- =============================================
-- Root Cause: FIX_FUNCTION_SEARCH_PATH.sql applied SET search_path = ''
-- to all functions, but the function BODIES still use unqualified
-- table references (processing_queue) and unquoted lowercase column
-- names (status, worker_id). With search_path = '', PostgreSQL
-- cannot resolve the unqualified table name.
--
-- Additionally, the actual table columns were created with double-quoted
-- UPPERCASE names ("STATUS", "WORKER_ID", etc.), so unquoted lowercase
-- references get folded to lowercase by PostgreSQL and don't match.
--
-- Fix: Recreate all 5 queue functions with:
-- 1. Fully-qualified table: public.processing_queue
-- 2. Double-quoted uppercase column names: "STATUS", "WORKER_ID", etc.
-- 3. SET search_path = '' (kept for Supabase linter compliance)
-- =============================================

-- 1. claim_processing_job
CREATE OR REPLACE FUNCTION claim_processing_job(p_worker_id TEXT)
RETURNS TABLE (
    id UUID,
    asset_id TEXT,
    image_path TEXT,
    scan_type TEXT,
    user_id UUID,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    metadata JSONB
)
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    v_job_id UUID;
BEGIN
    UPDATE public.processing_queue
    SET 
        "STATUS" = 'PROCESSING',
        "WORKER_ID" = p_worker_id,
        "LOCKED_AT" = NOW(),
        "STARTED_AT" = COALESCE("STARTED_AT", NOW()),
        "UPDATED_AT" = NOW(),
        "PROGRESS" = 10,
        "STAGE" = 'CLAIMED'
    WHERE "ID" = (
        SELECT "ID" FROM public.processing_queue
        WHERE "STATUS" = 'PENDING'
        ORDER BY "PRIORITY" DESC, "CREATED_AT" ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
    )
    RETURNING "ID" INTO v_job_id;
    
    IF v_job_id IS NULL THEN
        RETURN;
    END IF;
    
    RETURN QUERY
    SELECT 
        pq."ID",
        pq."ASSET_ID",
        pq."IMAGE_PATH",
        pq."SCAN_TYPE",
        pq."USER_ID",
        pq."LATITUDE",
        pq."LONGITUDE",
        pq."METADATA"
    FROM public.processing_queue pq
    WHERE pq."ID" = v_job_id;
END;
$$;

-- 2. complete_processing_job
CREATE OR REPLACE FUNCTION complete_processing_job(p_job_id UUID, p_result_data JSONB)
RETURNS BOOLEAN
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    UPDATE public.processing_queue
    SET 
        "STATUS" = 'COMPLETED',
        "COMPLETED_AT" = NOW(),
        "UPDATED_AT" = NOW(),
        "PROGRESS" = 100,
        "STAGE" = 'COMPLETED',
        "RESULT_DATA" = p_result_data,
        "WORKER_ID" = NULL,
        "LOCKED_AT" = NULL
    WHERE "ID" = p_job_id AND "STATUS" = 'PROCESSING';
    
    RETURN FOUND;
END;
$$;

-- 3. fail_processing_job
CREATE OR REPLACE FUNCTION fail_processing_job(p_job_id UUID, p_error_message TEXT, p_error_code TEXT DEFAULT 'UNKNOWN')
RETURNS BOOLEAN
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    v_retry_count INTEGER;
    v_max_retries INTEGER;
BEGIN
    SELECT "RETRY_COUNT", "MAX_RETRIES" INTO v_retry_count, v_max_retries
    FROM public.processing_queue WHERE "ID" = p_job_id;
    
    IF v_retry_count < v_max_retries THEN
        UPDATE public.processing_queue
        SET 
            "STATUS" = 'PENDING',
            "RETRY_COUNT" = "RETRY_COUNT" + 1,
            "LAST_ERROR" = p_error_message,
            "ERROR_CODE" = p_error_code,
            "UPDATED_AT" = NOW(),
            "PROGRESS" = 0,
            "STAGE" = 'RETRY_QUEUED',
            "WORKER_ID" = NULL,
            "LOCKED_AT" = NULL,
            "PRIORITY" = GREATEST(1, "PRIORITY" - 1)
        WHERE "ID" = p_job_id;
    ELSE
        UPDATE public.processing_queue
        SET 
            "STATUS" = 'FAILED',
            "COMPLETED_AT" = NOW(),
            "UPDATED_AT" = NOW(),
            "LAST_ERROR" = p_error_message,
            "ERROR_CODE" = p_error_code,
            "STAGE" = 'FAILED_FINAL',
            "WORKER_ID" = NULL,
            "LOCKED_AT" = NULL
        WHERE "ID" = p_job_id;
    END IF;
    
    RETURN FOUND;
END;
$$;

-- 4. update_job_progress
CREATE OR REPLACE FUNCTION update_job_progress(p_job_id UUID, p_progress INTEGER, p_stage TEXT DEFAULT NULL)
RETURNS BOOLEAN
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    UPDATE public.processing_queue
    SET 
        "PROGRESS" = p_progress,
        "STAGE" = COALESCE(p_stage, "STAGE"),
        "UPDATED_AT" = NOW(),
        "LOCKED_AT" = NOW()
    WHERE "ID" = p_job_id AND "STATUS" = 'PROCESSING';
    
    RETURN FOUND;
END;
$$;

-- 5. release_stale_locks
CREATE OR REPLACE FUNCTION release_stale_locks()
RETURNS INTEGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    released_count INTEGER;
BEGIN
    UPDATE public.processing_queue
    SET 
        "STATUS" = 'PENDING',
        "WORKER_ID" = NULL,
        "LOCKED_AT" = NULL,
        "STAGE" = 'LOCK_EXPIRED'
    WHERE "STATUS" = 'PROCESSING'
      AND "LOCKED_AT" < NOW() - ("LOCK_TIMEOUT_SECONDS" || ' seconds')::INTERVAL;
    
    GET DIAGNOSTICS released_count = ROW_COUNT;
    RETURN released_count;
END;
$$;

-- =============================================
-- TRIGGER FUNCTIONS (same search_path + casing issue)
-- =============================================

-- 6. update_bundle_asset_count (trigger on historical_documents_global)
CREATE OR REPLACE FUNCTION update_bundle_asset_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') AND NEW."BUNDLE_ID" IS NOT NULL THEN
        UPDATE public.digital_asset_bundles 
        SET "ASSET_COUNT" = (SELECT count(*) FROM public.historical_documents_global WHERE "BUNDLE_ID" = NEW."BUNDLE_ID"),
            "UPDATED_AT" = NOW()
        WHERE "ID" = NEW."BUNDLE_ID";
    END IF;
    RETURN NEW;   
END;
$$;

-- 7. invoke_processing_worker (trigger on processing_queue INSERT)
CREATE OR REPLACE FUNCTION invoke_processing_worker()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = 'public, extensions'
AS $$
DECLARE
  processing_count INTEGER;
BEGIN
  -- Only invoke if this is a new PENDING job
  IF NEW."STATUS" != 'PENDING' THEN
    RETURN NEW;
  END IF;

  -- Check if jobs are already processing (Edge Function chains itself)
  SELECT COUNT(*) INTO processing_count
  FROM public.processing_queue
  WHERE "STATUS" = 'PROCESSING';

  IF processing_count > 0 THEN
    RETURN NEW;
  END IF;

  -- Invoke Edge Function via pg_net
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

-- 8. update_partnership_timestamp (trigger on archive_partnerships)
CREATE OR REPLACE FUNCTION update_partnership_timestamp()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    NEW."UPDATED_AT" = NOW();
    RETURN NEW;
END;
$$;

-- Verify
SELECT '✅ All 8 functions recreated with public.tablename + quoted uppercase columns' AS result;
