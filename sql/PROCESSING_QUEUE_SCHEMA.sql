-- ============================================
-- PROCESSING QUEUE SCHEMA
-- ============================================
-- Server-side processing queue for OCR jobs
-- Enables background processing and auto-scaling
-- Version: 1.0.0
--
-- DEPENDENCIES:
-- - historical_documents_global (core table)
-- - auth.users (Supabase auth)
-- ============================================

-- ============================================
-- Processing Queue Table
-- ============================================

CREATE TABLE IF NOT EXISTS processing_queue (
    ID UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Job Identification
    USER_ID UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    ASSET_ID TEXT NOT NULL,
    IMAGE_PATH TEXT NOT NULL,
    
    -- Processing Configuration
    SCAN_TYPE TEXT NOT NULL DEFAULT 'DOCUMENT',
    PRIORITY INTEGER NOT NULL DEFAULT 5 CHECK (PRIORITY BETWEEN 1 AND 10),
    
    -- Location Data (for GIS extraction)
    LATITUDE DOUBLE PRECISION,
    LONGITUDE DOUBLE PRECISION,
    
    -- Status Management
    STATUS TEXT NOT NULL DEFAULT 'PENDING' CHECK (
        STATUS IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED')
    ),
    
    -- Progress Tracking
    PROGRESS INTEGER DEFAULT 0 CHECK (PROGRESS BETWEEN 0 AND 100),
    STAGE TEXT DEFAULT 'QUEUED',
    
    -- Error Handling & Retries
    RETRY_COUNT INTEGER DEFAULT 0,
    MAX_RETRIES INTEGER DEFAULT 3,
    LAST_ERROR TEXT,
    ERROR_CODE TEXT,
    
    -- Worker Assignment
    WORKER_ID TEXT,
    LOCKED_AT TIMESTAMPTZ,
    LOCK_TIMEOUT_SECONDS INTEGER DEFAULT 300,
    
    -- Timestamps
    CREATED_AT TIMESTAMPTZ DEFAULT NOW(),
    STARTED_AT TIMESTAMPTZ,
    COMPLETED_AT TIMESTAMPTZ,
    UPDATED_AT TIMESTAMPTZ DEFAULT NOW(),
    
    -- Result Storage (for Edge Function to store results)
    RESULT_DATA JSONB,
    
    -- Metadata
    METADATA JSONB DEFAULT '{}'::jsonb,
    
    -- Constraints
    CONSTRAINT valid_priority CHECK (PRIORITY >= 1 AND PRIORITY <= 10),
    CONSTRAINT valid_retry CHECK (RETRY_COUNT <= MAX_RETRIES + 1)
);

-- ============================================
-- Indexes for Queue Operations
-- ============================================

-- Primary queue fetch: Pending jobs ordered by priority and age
CREATE INDEX IF NOT EXISTS idx_queue_fetch 
ON processing_queue (STATUS, PRIORITY DESC, CREATED_AT ASC)
WHERE STATUS = 'PENDING';

-- Worker heartbeat: Find stale locks
CREATE INDEX IF NOT EXISTS idx_queue_stale_locks
ON processing_queue (LOCKED_AT)
WHERE STATUS = 'PROCESSING' AND LOCKED_AT IS NOT NULL;

-- User's queue view
CREATE INDEX IF NOT EXISTS idx_queue_user
ON processing_queue (USER_ID, STATUS, CREATED_AT DESC);

-- Failed jobs for retry
CREATE INDEX IF NOT EXISTS idx_queue_retry
ON processing_queue (STATUS, RETRY_COUNT, CREATED_AT)
WHERE STATUS = 'FAILED' AND RETRY_COUNT < MAX_RETRIES;

-- Completed jobs cleanup
CREATE INDEX IF NOT EXISTS idx_queue_cleanup
ON processing_queue (STATUS, COMPLETED_AT)
WHERE STATUS IN ('COMPLETED', 'CANCELLED');

-- ============================================
-- Queue Statistics View
-- ============================================

CREATE OR REPLACE VIEW queue_stats AS
SELECT 
    STATUS,
    COUNT(*) as count,
    ROUND(AVG(EXTRACT(EPOCH FROM (NOW() - CREATED_AT)))::numeric, 2) as avg_age_seconds,
    MIN(CREATED_AT) as oldest_job,
    MAX(CREATED_AT) as newest_job,
    COUNT(CASE WHEN RETRY_COUNT > 0 THEN 1 END) as retry_attempts
FROM processing_queue
WHERE STATUS IN ('PENDING', 'PROCESSING', 'FAILED')
GROUP BY STATUS
ORDER BY 
    CASE STATUS 
        WHEN 'PROCESSING' THEN 1 
        WHEN 'PENDING' THEN 2 
        WHEN 'FAILED' THEN 3 
    END;

-- ============================================
-- Queue Health Metrics
-- ============================================

CREATE OR REPLACE VIEW queue_health AS
WITH metrics AS (
    SELECT
        COUNT(*) FILTER (WHERE STATUS = 'PENDING') as pending_count,
        COUNT(*) FILTER (WHERE STATUS = 'PROCESSING') as processing_count,
        COUNT(*) FILTER (WHERE STATUS = 'COMPLETED' AND COMPLETED_AT > NOW() - INTERVAL '1 hour') as completed_last_hour,
        COUNT(*) FILTER (WHERE STATUS = 'FAILED' AND CREATED_AT > NOW() - INTERVAL '1 hour') as failed_last_hour,
        AVG(EXTRACT(EPOCH FROM (COMPLETED_AT - STARTED_AT))) FILTER (WHERE STATUS = 'COMPLETED') as avg_processing_seconds,
        PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (COMPLETED_AT - STARTED_AT))) FILTER (WHERE STATUS = 'COMPLETED') as p95_processing_seconds
    FROM processing_queue
    WHERE CREATED_AT > NOW() - INTERVAL '24 hours'
)
SELECT 
    *,
    CASE 
        WHEN pending_count > 100 THEN 'CRITICAL'
        WHEN pending_count > 50 THEN 'WARNING'
        ELSE 'HEALTHY'
    END as queue_status,
    CASE 
        WHEN failed_last_hour > 10 THEN 'HIGH_ERROR_RATE'
        WHEN failed_last_hour > 5 THEN 'ELEVATED_ERRORS'
        ELSE 'NORMAL'
    END as error_status
FROM metrics;

-- ============================================
-- Functions for Queue Management
-- ============================================

-- Claim next job (atomic operation for workers)
CREATE OR REPLACE FUNCTION claim_processing_job(p_worker_id TEXT)
RETURNS TABLE (
    job_id UUID,
    asset_id TEXT,
    image_path TEXT,
    scan_type TEXT,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    metadata JSONB
) AS $$
DECLARE
    v_job_id UUID;
BEGIN
    -- Atomic claim with SKIP LOCKED to avoid contention
    UPDATE processing_queue
    SET 
        STATUS = 'PROCESSING',
        WORKER_ID = p_worker_id,
        LOCKED_AT = NOW(),
        STARTED_AT = COALESCE(STARTED_AT, NOW()),
        UPDATED_AT = NOW(),
        PROGRESS = 10,
        STAGE = 'CLAIMED'
    WHERE ID = (
        SELECT ID FROM processing_queue
        WHERE STATUS = 'PENDING'
        ORDER BY PRIORITY DESC, CREATED_AT ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
    )
    RETURNING ID INTO v_job_id;
    
    IF v_job_id IS NULL THEN
        RETURN;
    END IF;
    
    RETURN QUERY
    SELECT 
        pq.ID as job_id,
        pq.ASSET_ID as asset_id,
        pq.IMAGE_PATH as image_path,
        pq.SCAN_TYPE as scan_type,
        pq.LATITUDE as latitude,
        pq.LONGITUDE as longitude,
        pq.METADATA as metadata
    FROM processing_queue pq
    WHERE pq.ID = v_job_id;
END;
$$ LANGUAGE plpgsql;

-- Complete job with results
CREATE OR REPLACE FUNCTION complete_processing_job(
    p_job_id UUID,
    p_result_data JSONB
)
RETURNS BOOLEAN AS $$
BEGIN
    UPDATE processing_queue
    SET 
        STATUS = 'COMPLETED',
        COMPLETED_AT = NOW(),
        UPDATED_AT = NOW(),
        PROGRESS = 100,
        STAGE = 'COMPLETED',
        RESULT_DATA = p_result_data,
        WORKER_ID = NULL,
        LOCKED_AT = NULL
    WHERE ID = p_job_id AND STATUS = 'PROCESSING';
    
    RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- Fail job with error
CREATE OR REPLACE FUNCTION fail_processing_job(
    p_job_id UUID,
    p_error_message TEXT,
    p_error_code TEXT DEFAULT 'UNKNOWN'
)
RETURNS BOOLEAN AS $$
DECLARE
    v_retry_count INTEGER;
    v_max_retries INTEGER;
BEGIN
    SELECT RETRY_COUNT, MAX_RETRIES INTO v_retry_count, v_max_retries
    FROM processing_queue WHERE ID = p_job_id;
    
    IF v_retry_count < v_max_retries THEN
        -- Mark for retry
        UPDATE processing_queue
        SET 
            STATUS = 'PENDING',
            RETRY_COUNT = RETRY_COUNT + 1,
            LAST_ERROR = p_error_message,
            ERROR_CODE = p_error_code,
            UPDATED_AT = NOW(),
            PROGRESS = 0,
            STAGE = 'RETRY_QUEUED',
            WORKER_ID = NULL,
            LOCKED_AT = NULL,
            -- Exponential backoff via priority reduction
            PRIORITY = GREATEST(1, PRIORITY - 1)
        WHERE ID = p_job_id;
    ELSE
        -- Final failure
        UPDATE processing_queue
        SET 
            STATUS = 'FAILED',
            COMPLETED_AT = NOW(),
            UPDATED_AT = NOW(),
            LAST_ERROR = p_error_message,
            ERROR_CODE = p_error_code,
            STAGE = 'FAILED_FINAL',
            WORKER_ID = NULL,
            LOCKED_AT = NULL
        WHERE ID = p_job_id;
    END IF;
    
    RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- Update job progress
CREATE OR REPLACE FUNCTION update_job_progress(
    p_job_id UUID,
    p_progress INTEGER,
    p_stage TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
BEGIN
    UPDATE processing_queue
    SET 
        PROGRESS = p_progress,
        STAGE = COALESCE(p_stage, STAGE),
        UPDATED_AT = NOW(),
        LOCKED_AT = NOW() -- Refresh lock
    WHERE ID = p_job_id AND STATUS = 'PROCESSING';
    
    RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- Release stale locks (run periodically)
CREATE OR REPLACE FUNCTION release_stale_locks()
RETURNS INTEGER AS $$
DECLARE
    v_released INTEGER;
BEGIN
    WITH released AS (
        UPDATE processing_queue
        SET 
            STATUS = 'PENDING',
            WORKER_ID = NULL,
            LOCKED_AT = NULL,
            UPDATED_AT = NOW(),
            STAGE = 'LOCK_RELEASED',
            RETRY_COUNT = RETRY_COUNT + 1
        WHERE 
            STATUS = 'PROCESSING'
            AND LOCKED_AT < NOW() - (LOCK_TIMEOUT_SECONDS || ' seconds')::INTERVAL
        RETURNING ID
    )
    SELECT COUNT(*) INTO v_released FROM released;
    
    RETURN v_released;
END;
$$ LANGUAGE plpgsql;

-- Cleanup old completed jobs
CREATE OR REPLACE FUNCTION cleanup_completed_jobs(p_days_old INTEGER DEFAULT 7)
RETURNS INTEGER AS $$
DECLARE
    v_deleted INTEGER;
BEGIN
    WITH deleted AS (
        DELETE FROM processing_queue
        WHERE 
            STATUS IN ('COMPLETED', 'CANCELLED')
            AND COMPLETED_AT < NOW() - (p_days_old || ' days')::INTERVAL
        RETURNING ID
    )
    SELECT COUNT(*) INTO v_deleted FROM deleted;
    
    RETURN v_deleted;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- Row Level Security (RLS)
-- ============================================

ALTER TABLE processing_queue ENABLE ROW LEVEL SECURITY;

-- Users can view their own jobs
CREATE POLICY "Users can view own jobs"
ON processing_queue FOR SELECT
USING (auth.uid() = USER_ID);

-- Users can insert their own jobs
CREATE POLICY "Users can create jobs"
ON processing_queue FOR INSERT
WITH CHECK (auth.uid() = USER_ID);

-- Users can cancel their own jobs
CREATE POLICY "Users can cancel own jobs"
ON processing_queue FOR UPDATE
USING (auth.uid() = USER_ID AND STATUS = 'PENDING')
WITH CHECK (STATUS = 'CANCELLED');

-- Service role can do everything (for Edge Functions)
CREATE POLICY "Service role full access"
ON processing_queue FOR ALL
USING (auth.role() = 'service_role');

-- ============================================
-- Realtime Subscriptions
-- ============================================

-- Enable realtime for status updates
ALTER PUBLICATION supabase_realtime ADD TABLE processing_queue;

-- ============================================
-- Trigger for Auto-Processing (Optional)
-- ============================================

-- This trigger can invoke an Edge Function when a job is queued
-- Uncomment and configure if using Supabase webhooks

/*
CREATE OR REPLACE FUNCTION trigger_processing_worker()
RETURNS TRIGGER AS $$
BEGIN
    -- Notify via pg_notify (can be listened by Edge Function)
    PERFORM pg_notify('processing_queue', json_build_object(
        'job_id', NEW.ID,
        'asset_id', NEW.ASSET_ID,
        'priority', NEW.PRIORITY
    )::text);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_job_queued
AFTER INSERT ON processing_queue
FOR EACH ROW
WHEN (NEW.STATUS = 'PENDING')
EXECUTE FUNCTION trigger_processing_worker();
*/

-- ============================================
-- Comments
-- ============================================

COMMENT ON TABLE processing_queue IS 'Server-side OCR processing queue for background job management';
COMMENT ON FUNCTION claim_processing_job(TEXT) IS 'Atomically claim the next available job for processing';
COMMENT ON FUNCTION complete_processing_job(UUID, JSONB) IS 'Mark a job as completed with result data';
COMMENT ON FUNCTION fail_processing_job(UUID, TEXT, TEXT) IS 'Mark a job as failed, with automatic retry logic';
COMMENT ON VIEW queue_stats IS 'Real-time queue statistics by status';
COMMENT ON VIEW queue_health IS 'Queue health metrics with status indicators';
