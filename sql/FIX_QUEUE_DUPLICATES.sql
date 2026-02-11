-- =============================================
-- FIX QUEUE DUPLICATES & ADD SAFEGUARDS
-- =============================================
-- Version: 1.0.0
-- Created: 2026-02-11
--
-- This script:
-- 1. Identifies and cancels duplicate active queue rows per ASSET_ID
-- 2. Adds a partial unique index to prevent future duplicates
-- 3. Reduces LOCK_TIMEOUT_SECONDS default from 300 to 120
--
-- SAFE TO RUN MULTIPLE TIMES (Idempotent)
-- =============================================

BEGIN;

-- ============================================
-- PART 1: DIAGNOSE CURRENT STATE
-- ============================================

-- Show current queue status distribution
DO $$
DECLARE
    status_row RECORD;
    dup_count INTEGER;
BEGIN
    RAISE NOTICE '=== CURRENT QUEUE STATUS ===';
    FOR status_row IN
        SELECT "STATUS", COUNT(*) as cnt
        FROM processing_queue
        GROUP BY "STATUS"
        ORDER BY "STATUS"
    LOOP
        RAISE NOTICE '  %: % jobs', status_row."STATUS", status_row.cnt;
    END LOOP;

    -- Count duplicate active jobs (same ASSET_ID with PENDING or PROCESSING)
    SELECT COUNT(*) INTO dup_count
    FROM (
        SELECT "ASSET_ID", "USER_ID", COUNT(*) as cnt
        FROM processing_queue
        WHERE "STATUS" IN ('PENDING', 'PROCESSING')
        GROUP BY "ASSET_ID", "USER_ID"
        HAVING COUNT(*) > 1
    ) dupes;

    IF dup_count > 0 THEN
        RAISE NOTICE '⚠️ Found % asset(s) with duplicate active queue rows', dup_count;
    ELSE
        RAISE NOTICE '✓ No duplicate active queue rows found';
    END IF;
END $$;

-- ============================================
-- PART 2: CANCEL DUPLICATE ACTIVE ROWS
-- ============================================
-- For each (ASSET_ID, USER_ID) with multiple PENDING/PROCESSING rows,
-- keep only the most recent one and cancel the rest.

DO $$
DECLARE
    cancelled_count INTEGER := 0;
BEGIN
    WITH ranked AS (
        SELECT 
            "ID",
            "ASSET_ID",
            "USER_ID",
            "STATUS",
            ROW_NUMBER() OVER (
                PARTITION BY "ASSET_ID", "USER_ID"
                ORDER BY "CREATED_AT" DESC
            ) as rn
        FROM processing_queue
        WHERE "STATUS" IN ('PENDING', 'PROCESSING')
    )
    UPDATE processing_queue pq
    SET 
        "STATUS" = 'CANCELLED',
        "LAST_ERROR" = 'Duplicate — superseded by newer queue entry',
        "UPDATED_AT" = NOW()
    FROM ranked r
    WHERE pq."ID" = r."ID"
      AND r.rn > 1;
    
    GET DIAGNOSTICS cancelled_count = ROW_COUNT;
    
    IF cancelled_count > 0 THEN
        RAISE NOTICE '🔧 Cancelled % duplicate queue rows', cancelled_count;
    ELSE
        RAISE NOTICE '✓ No duplicates to cancel';
    END IF;
END $$;

-- ============================================
-- PART 3: ADD PARTIAL UNIQUE INDEX
-- ============================================
-- Prevents two active (PENDING/PROCESSING) rows for the same asset+user.
-- Historical COMPLETED/FAILED/CANCELLED rows are unaffected.

CREATE UNIQUE INDEX IF NOT EXISTS idx_pq_active_asset_per_user
    ON processing_queue ("ASSET_ID", "USER_ID")
    WHERE "STATUS" IN ('PENDING', 'PROCESSING');

DO $$
BEGIN
    RAISE NOTICE '✓ Partial unique index idx_pq_active_asset_per_user ensured';
END $$;

-- ============================================
-- PART 4: REDUCE DEFAULT LOCK TIMEOUT
-- ============================================
-- Change default from 300s (5 min) to 120s (2 min)
-- This reduces the time stuck PROCESSING jobs block the queue

ALTER TABLE processing_queue 
    ALTER COLUMN "LOCK_TIMEOUT_SECONDS" SET DEFAULT 120;

DO $$
BEGIN
    RAISE NOTICE '✓ Default LOCK_TIMEOUT_SECONDS reduced to 120s';
END $$;

-- ============================================
-- PART 5: RELEASE ANY CURRENTLY STALE LOCKS
-- ============================================

DO $$
DECLARE
    released INTEGER;
BEGIN
    UPDATE processing_queue
    SET 
        "STATUS" = 'PENDING',
        "WORKER_ID" = NULL,
        "LOCKED_AT" = NULL,
        "STAGE" = 'LOCK_EXPIRED',
        "UPDATED_AT" = NOW()
    WHERE "STATUS" = 'PROCESSING'
      AND "LOCKED_AT" < NOW() - ("LOCK_TIMEOUT_SECONDS" || ' seconds')::INTERVAL;
    
    GET DIAGNOSTICS released = ROW_COUNT;
    
    IF released > 0 THEN
        RAISE NOTICE '🔓 Released % stale locks', released;
    ELSE
        RAISE NOTICE '✓ No stale locks to release';
    END IF;
END $$;

COMMIT;

-- ============================================
-- VERIFICATION
-- ============================================

SELECT 
    'Queue Status After Fix' AS report,
    "STATUS",
    COUNT(*) AS job_count,
    COUNT(DISTINCT "ASSET_ID") AS unique_assets
FROM processing_queue
GROUP BY "STATUS"
ORDER BY "STATUS";

-- Verify no remaining duplicates
SELECT 
    'Remaining Duplicate Check' AS report,
    COUNT(*) AS duplicate_asset_count
FROM (
    SELECT "ASSET_ID", "USER_ID"
    FROM processing_queue
    WHERE "STATUS" IN ('PENDING', 'PROCESSING')
    GROUP BY "ASSET_ID", "USER_ID"
    HAVING COUNT(*) > 1
) dupes;

SELECT 
    '✅ Queue Duplicate Fix Complete' AS status,
    NOW() AS completed_at;
