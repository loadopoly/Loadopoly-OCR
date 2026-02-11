-- =============================================
-- Remote Reset & Queue Management Functions
-- =============================================
-- Version: 1.0.0
-- Created: 2026-02-06
--
-- Provides remote administration functions for queue management
-- including reset, cleanup, and health checks.
-- =============================================

-- Function: cleanup_completed_jobs
-- Removes completed/failed jobs older than specified days
CREATE OR REPLACE FUNCTION cleanup_completed_jobs(p_days_old INTEGER DEFAULT 7)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    -- Only delete completed or failed jobs older than threshold
    DELETE FROM public.processing_queue
    WHERE "STATUS" IN ('COMPLETED', 'FAILED', 'CANCELLED')
      AND "COMPLETED_AT" < NOW() - (p_days_old || ' days')::INTERVAL;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    -- Log the cleanup operation
    RAISE NOTICE 'Cleaned up % completed/failed jobs older than % days', deleted_count, p_days_old;
    
    RETURN deleted_count;
END;
$$;

COMMENT ON FUNCTION cleanup_completed_jobs IS 'Remove completed/failed/cancelled jobs older than specified days (default: 7)';

-- Function: reset_user_queue
-- Resets all pending/processing jobs for a specific user back to PENDING
-- Useful when jobs get stuck or need to be reprocessed
CREATE OR REPLACE FUNCTION reset_user_queue(p_user_id UUID)
RETURNS TABLE (
    reset_count INTEGER,
    job_ids UUID[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_reset_count INTEGER;
    v_job_ids UUID[];
BEGIN
    -- Collect job IDs that will be reset
    SELECT ARRAY_AGG("ID")
    INTO v_job_ids
    FROM public.processing_queue
    WHERE "USER_ID" = p_user_id
      AND "STATUS" IN ('PROCESSING', 'FAILED');
    
    -- Reset jobs back to PENDING
    UPDATE public.processing_queue
    SET 
        "STATUS" = 'PENDING',
        "WORKER_ID" = NULL,
        "LOCKED_AT" = NULL,
        "PROGRESS" = 0,
        "STAGE" = 'RESET_BY_USER',
        "RETRY_COUNT" = 0,
        "LAST_ERROR" = NULL,
        "ERROR_CODE" = NULL,
        "UPDATED_AT" = NOW()
    WHERE "USER_ID" = p_user_id
      AND "STATUS" IN ('PROCESSING', 'FAILED');
    
    GET DIAGNOSTICS v_reset_count = ROW_COUNT;
    
    -- Return results
    RETURN QUERY SELECT v_reset_count, COALESCE(v_job_ids, ARRAY[]::UUID[]);
    
    -- Log the reset operation
    RAISE NOTICE 'Reset % jobs for user %', v_reset_count, p_user_id;
END;
$$;

COMMENT ON FUNCTION reset_user_queue IS 'Reset all processing/failed jobs for a user back to PENDING state';

-- Function: get_queue_health
-- Returns health metrics for the processing queue
CREATE OR REPLACE FUNCTION get_queue_health()
RETURNS TABLE (
    total_pending INTEGER,
    total_processing INTEGER,
    total_completed_24h INTEGER,
    total_failed_24h INTEGER,
    avg_processing_time_seconds NUMERIC,
    stale_locks_count INTEGER,
    oldest_pending_age_minutes INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    RETURN QUERY
    SELECT
        COUNT(*) FILTER (WHERE "STATUS" = 'PENDING')::INTEGER AS total_pending,
        COUNT(*) FILTER (WHERE "STATUS" = 'PROCESSING')::INTEGER AS total_processing,
        COUNT(*) FILTER (WHERE "STATUS" = 'COMPLETED' AND "COMPLETED_AT" > NOW() - INTERVAL '24 hours')::INTEGER AS total_completed_24h,
        COUNT(*) FILTER (WHERE "STATUS" = 'FAILED' AND "COMPLETED_AT" > NOW() - INTERVAL '24 hours')::INTEGER AS total_failed_24h,
        AVG(EXTRACT(EPOCH FROM ("COMPLETED_AT" - "STARTED_AT"))) FILTER (WHERE "STATUS" = 'COMPLETED' AND "COMPLETED_AT" > NOW() - INTERVAL '24 hours') AS avg_processing_time_seconds,
        COUNT(*) FILTER (WHERE "STATUS" = 'PROCESSING' AND "LOCKED_AT" < NOW() - ("LOCK_TIMEOUT_SECONDS" || ' seconds')::INTERVAL)::INTEGER AS stale_locks_count,
        EXTRACT(EPOCH FROM (NOW() - MIN("CREATED_AT") FILTER (WHERE "STATUS" = 'PENDING'))) / 60 AS oldest_pending_age_minutes
    FROM public.processing_queue;
END;
$$;

COMMENT ON FUNCTION get_queue_health IS 'Get comprehensive health metrics for the processing queue';

-- Function: force_reset_stuck_jobs
-- Forcefully resets all jobs stuck in PROCESSING state
-- Should be used as a last resort when release_stale_locks doesn't work
CREATE OR REPLACE FUNCTION force_reset_stuck_jobs()
RETURNS TABLE (
    reset_count INTEGER,
    job_ids UUID[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_reset_count INTEGER;
    v_job_ids UUID[];
BEGIN
    -- Collect all stuck job IDs
    SELECT ARRAY_AGG("ID")
    INTO v_job_ids
    FROM public.processing_queue
    WHERE "STATUS" = 'PROCESSING';
    
    -- Force reset all processing jobs
    UPDATE public.processing_queue
    SET 
        "STATUS" = 'PENDING',
        "WORKER_ID" = NULL,
        "LOCKED_AT" = NULL,
        "PROGRESS" = 0,
        "STAGE" = 'FORCE_RESET_ALL',
        "UPDATED_AT" = NOW()
    WHERE "STATUS" = 'PROCESSING';
    
    GET DIAGNOSTICS v_reset_count = ROW_COUNT;
    
    -- Return results
    RETURN QUERY SELECT v_reset_count, COALESCE(v_job_ids, ARRAY[]::UUID[]);
    
    -- Log the operation
    RAISE NOTICE 'Force reset % stuck jobs', v_reset_count;
END;
$$;

COMMENT ON FUNCTION force_reset_stuck_jobs IS 'Emergency function to reset ALL jobs stuck in PROCESSING state';

-- Grant execute permissions to authenticated users for safe functions
GRANT EXECUTE ON FUNCTION cleanup_completed_jobs TO service_role;
GRANT EXECUTE ON FUNCTION reset_user_queue TO authenticated;
GRANT EXECUTE ON FUNCTION get_queue_health TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION force_reset_stuck_jobs TO service_role;

-- Create index for faster cleanup operations
CREATE INDEX IF NOT EXISTS idx_processing_queue_completed_at_status 
    ON processing_queue("COMPLETED_AT", "STATUS")
    WHERE "STATUS" IN ('COMPLETED', 'FAILED', 'CANCELLED');

-- Create index for queue health checks
CREATE INDEX IF NOT EXISTS idx_processing_queue_status_created 
    ON processing_queue("STATUS", "CREATED_AT");
