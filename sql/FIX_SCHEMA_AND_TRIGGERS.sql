-- =============================================
-- SCHEMA AND TRIGGER VERIFICATION/REPAIR SCRIPT
-- =============================================
-- Version: 1.1.0
-- Updated: 2026-02-11
--
-- This script verifies and repairs:
-- 1. Uppercase column naming consistency
-- 2. Avatar initialization trigger
-- 3. Missing avatar records for existing users
-- 4. RLS policies
-- 5. Queue stats view discrepancies (global vs user-filtered counts)
-- 6. Orphaned processing queue jobs
--
-- IMPORTANT NOTES:
-- - The queue_stats VIEW returns GLOBAL counts without USER_ID filtering
-- - Client-side code correctly uses direct queries with USER_ID filtering
-- - Use get_queue_stats_for_user(user_id) for accurate user-specific stats
--
-- SAFE TO RUN MULTIPLE TIMES (Idempotent)
-- =============================================

BEGIN;

-- ============================================
-- PART 1: SCHEMA VERIFICATION
-- ============================================

-- Check if historical_documents_global exists with correct columns
DO $$
BEGIN
    -- Verify key columns exist with uppercase names
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'historical_documents_global') THEN
        
        -- Check for ID column
        IF NOT EXISTS (
            SELECT FROM information_schema.columns 
            WHERE table_name = 'historical_documents_global' 
            AND column_name = 'ID'
        ) THEN
            RAISE NOTICE '❌ historical_documents_global: Column "ID" not found (case mismatch?)';
        ELSE
            RAISE NOTICE '✓ historical_documents_global: Column "ID" exists';
        END IF;

        -- Check for USER_ID column
        IF NOT EXISTS (
            SELECT FROM information_schema.columns 
            WHERE table_name = 'historical_documents_global' 
            AND column_name = 'USER_ID'
        ) THEN
            RAISE NOTICE '❌ historical_documents_global: Column "USER_ID" not found (case mismatch?)';
        ELSE
            RAISE NOTICE '✓ historical_documents_global: Column "USER_ID" exists';
        END IF;

        -- Check for ASSET_ID column
        IF NOT EXISTS (
            SELECT FROM information_schema.columns 
            WHERE table_name = 'historical_documents_global' 
            AND column_name = 'ASSET_ID'
        ) THEN
            RAISE NOTICE '❌ historical_documents_global: Column "ASSET_ID" not found (case mismatch?)';
        ELSE
            RAISE NOTICE '✓ historical_documents_global: Column "ASSET_ID" exists';
        END IF;

    ELSE
        RAISE NOTICE '⚠️ historical_documents_global table does not exist';
    END IF;
END $$;

-- Check if user_avatars exists with correct columns
DO $$
BEGIN
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'user_avatars') THEN
        
        -- Check for ID column
        IF NOT EXISTS (
            SELECT FROM information_schema.columns 
            WHERE table_name = 'user_avatars' 
            AND column_name = 'ID'
        ) THEN
            RAISE NOTICE '❌ user_avatars: Column "ID" not found (case mismatch?)';
        ELSE
            RAISE NOTICE '✓ user_avatars: Column "ID" exists';
        END IF;

        -- Check for USER_ID column
        IF NOT EXISTS (
            SELECT FROM information_schema.columns 
            WHERE table_name = 'user_avatars' 
            AND column_name = 'USER_ID'
        ) THEN
            RAISE NOTICE '❌ user_avatars: Column "USER_ID" not found (case mismatch?)';
        ELSE
            RAISE NOTICE '✓ user_avatars: Column "USER_ID" exists';
        END IF;

        -- Check for DISPLAY_NAME column
        IF NOT EXISTS (
            SELECT FROM information_schema.columns 
            WHERE table_name = 'user_avatars' 
            AND column_name = 'DISPLAY_NAME'
        ) THEN
            RAISE NOTICE '❌ user_avatars: Column "DISPLAY_NAME" not found (case mismatch?)';
        ELSE
            RAISE NOTICE '✓ user_avatars: Column "DISPLAY_NAME" exists';
        END IF;

    ELSE
        RAISE NOTICE '⚠️ user_avatars table does not exist - run CONSOLIDATED_SCHEMA.sql first';
    END IF;
END $$;

-- ============================================
-- PART 2: TRIGGER VERIFICATION & REPAIR
-- ============================================

-- Ensure the initialize_user_avatar function exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT FROM pg_proc 
        WHERE proname = 'initialize_user_avatar'
    ) THEN
        RAISE NOTICE '⚠️ Function initialize_user_avatar does not exist, creating...';
        
        CREATE OR REPLACE FUNCTION initialize_user_avatar()
        RETURNS TRIGGER
        LANGUAGE plpgsql
        SET search_path = ''
        SECURITY DEFINER
        AS $func$
        BEGIN
            INSERT INTO public.user_avatars ("USER_ID", "DISPLAY_NAME")
            VALUES (NEW.id, 'Explorer_' || LEFT(NEW.id::TEXT, 6))
            ON CONFLICT ("USER_ID") DO NOTHING;
            RETURN NEW;
        EXCEPTION WHEN OTHERS THEN
            -- Log error but don't block user signup
            RAISE WARNING 'Avatar initialization failed for user %, but signup continues: %', NEW.id, SQLERRM;
            RETURN NEW;
        END;
        $func$;
        
        RAISE NOTICE '✓ Function initialize_user_avatar created';
    ELSE
        RAISE NOTICE '✓ Function initialize_user_avatar exists';
    END IF;
END $$;

-- Ensure the trigger is attached to auth.users
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT FROM pg_trigger 
        WHERE tgname = 'on_auth_user_created'
    ) THEN
        RAISE NOTICE '⚠️ Trigger on_auth_user_created does not exist, creating...';
        
        DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
        CREATE TRIGGER on_auth_user_created
            AFTER INSERT ON auth.users
            FOR EACH ROW EXECUTE FUNCTION initialize_user_avatar();
        
        RAISE NOTICE '✓ Trigger on_auth_user_created created';
    ELSE
        RAISE NOTICE '✓ Trigger on_auth_user_created exists';
    END IF;
END $$;

-- ============================================
-- PART 3: DATA REPAIR
-- ============================================

-- Find and repair users without avatar records
DO $$
DECLARE
    missing_count INTEGER;
    repaired_count INTEGER := 0;
    user_record RECORD;
BEGIN
    -- Count users without avatars
    SELECT COUNT(*) INTO missing_count
    FROM auth.users u
    LEFT JOIN public.user_avatars ua ON u.id = ua."USER_ID"
    WHERE ua."ID" IS NULL;

    IF missing_count > 0 THEN
        RAISE NOTICE '🔧 Found % users without avatar records, repairing...', missing_count;
        
        -- Create missing avatar records
        FOR user_record IN 
            SELECT u.id 
            FROM auth.users u
            LEFT JOIN public.user_avatars ua ON u.id = ua."USER_ID"
            WHERE ua."ID" IS NULL
        LOOP
            BEGIN
                INSERT INTO public.user_avatars ("USER_ID", "DISPLAY_NAME")
                VALUES (user_record.id, 'Explorer_' || LEFT(user_record.id::TEXT, 6))
                ON CONFLICT ("USER_ID") DO NOTHING;
                
                repaired_count := repaired_count + 1;
            EXCEPTION WHEN OTHERS THEN
                RAISE WARNING 'Failed to create avatar for user %: %', user_record.id, SQLERRM;
            END;
        END LOOP;
        
        RAISE NOTICE '✓ Repaired % avatar records', repaired_count;
    ELSE
        RAISE NOTICE '✓ All users have avatar records';
    END IF;
END $$;

-- ============================================
-- PART 4: RLS POLICY VERIFICATION
-- ============================================

-- Ensure user_avatars has proper RLS policies
DO $$
BEGIN
    -- Enable RLS if not enabled
    ALTER TABLE user_avatars ENABLE ROW LEVEL SECURITY;
    
    -- Drop existing policies to recreate them cleanly
    DROP POLICY IF EXISTS "Users can view all avatars" ON user_avatars;
    DROP POLICY IF EXISTS "Users update own avatar" ON user_avatars;
    DROP POLICY IF EXISTS "Users insert own avatar" ON user_avatars;
    
    -- Recreate policies
    CREATE POLICY "Users can view all avatars" ON user_avatars FOR SELECT USING (true);
    
    CREATE POLICY "Users update own avatar" ON user_avatars FOR UPDATE 
    USING ((select auth.uid()) = "USER_ID");
    
    CREATE POLICY "Users insert own avatar" ON user_avatars FOR INSERT 
    WITH CHECK ((select auth.uid()) = "USER_ID");
    
    RAISE NOTICE '✓ RLS policies verified and updated';
END $$;

-- ============================================
-- PART 5: QUEUE STATS VIEW VERIFICATION & FIX
-- ============================================

-- WARNING: The queue_stats view returns GLOBAL counts without USER_ID filtering.
-- This causes discrepancies when client-side code filters by user.
-- Direct queries with USER_ID filtering should always be preferred.

DO $$
BEGIN
    -- Check if the queue_stats view exists
    IF EXISTS (
        SELECT FROM pg_views 
        WHERE viewname = 'queue_stats'
    ) THEN
        RAISE NOTICE '⚠️ queue_stats view exists but returns GLOBAL counts (no USER_ID filtering)';
        RAISE NOTICE '   Client-side code correctly uses direct queries with USER_ID filtering';
        RAISE NOTICE '   This view is kept for backwards compatibility but should be avoided';
    ELSE
        RAISE NOTICE 'ℹ️ queue_stats view does not exist';
    END IF;
END $$;

-- Create a user-specific queue stats function as an alternative
-- This provides the same stats but filtered by USER_ID
CREATE OR REPLACE FUNCTION get_queue_stats_for_user(p_user_id UUID)
RETURNS TABLE (
    "STATUS" TEXT,
    count BIGINT,
    avg_age_seconds NUMERIC,
    oldest_job TIMESTAMP WITH TIME ZONE,
    newest_job TIMESTAMP WITH TIME ZONE,
    retry_attempts BIGINT
)
LANGUAGE SQL
STABLE
SET search_path = ''
AS $$
    SELECT 
        "STATUS",
        COUNT(*) as count,
        ROUND(AVG(EXTRACT(EPOCH FROM (NOW() - "CREATED_AT")))::numeric, 2) as avg_age_seconds,
        MIN("CREATED_AT") as oldest_job,
        MAX("CREATED_AT") as newest_job,
        COUNT(CASE WHEN "RETRY_COUNT" > 0 THEN 1 END) as retry_attempts
    FROM public.processing_queue
    WHERE "STATUS" IN ('PENDING', 'PROCESSING', 'FAILED')
    AND "USER_ID" = p_user_id
    GROUP BY "STATUS";
$$;

COMMIT;

-- ============================================
-- VERIFICATION RESULTS
-- ============================================

-- Return comprehensive status report
WITH schema_check AS (
    SELECT 
        'historical_documents_global' AS table_name,
        EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'historical_documents_global') AS table_exists,
        EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'historical_documents_global' AND column_name = 'ID') AS id_column_correct,
        EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'historical_documents_global' AND column_name = 'USER_ID') AS user_id_column_correct,
        EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'historical_documents_global' AND column_name = 'ASSET_ID') AS asset_id_column_correct
    UNION ALL
    SELECT 
        'user_avatars' AS table_name,
        EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'user_avatars') AS table_exists,
        EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'user_avatars' AND column_name = 'ID') AS id_column_correct,
        EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'user_avatars' AND column_name = 'USER_ID') AS user_id_column_correct,
        EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'user_avatars' AND column_name = 'DISPLAY_NAME') AS display_name_column_correct
    UNION ALL
    SELECT 
        'processing_queue' AS table_name,
        EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'processing_queue') AS table_exists,
        EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'processing_queue' AND column_name = 'ID') AS id_column_correct,
        EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'processing_queue' AND column_name = 'USER_ID') AS user_id_column_correct,
        EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'processing_queue' AND column_name = 'STATUS') AS status_column_correct
),
trigger_check AS (
    SELECT
        EXISTS (SELECT FROM pg_proc WHERE proname = 'initialize_user_avatar') AS function_exists,
        EXISTS (SELECT FROM pg_trigger WHERE tgname = 'on_auth_user_created') AS trigger_exists,
        EXISTS (SELECT FROM pg_proc WHERE proname = 'get_queue_stats_for_user') AS queue_stats_function_exists
),
data_integrity AS (
    SELECT
        COUNT(*) AS total_users,
        COUNT(ua."ID") AS users_with_avatars,
        COUNT(*) - COUNT(ua."ID") AS users_missing_avatars
    FROM auth.users u
    LEFT JOIN public.user_avatars ua ON u.id = ua."USER_ID"
),
queue_integrity AS (
    SELECT
        -- Global queue counts (what queue_stats view would show)
        COUNT(*) FILTER (WHERE "STATUS" = 'PENDING') AS global_pending,
        COUNT(*) FILTER (WHERE "STATUS" = 'PROCESSING') AS global_processing,
        COUNT(*) FILTER (WHERE "STATUS" = 'FAILED') AS global_failed,
        COUNT(*) FILTER (WHERE "STATUS" = 'COMPLETED') AS global_completed,
        -- Orphaned jobs (no valid USER_ID)
        COUNT(*) FILTER (WHERE "USER_ID" IS NULL) AS orphaned_jobs,
        COUNT(*) FILTER (WHERE "USER_ID" IS NOT NULL AND NOT EXISTS (
            SELECT 1 FROM auth.users WHERE id = processing_queue."USER_ID"
        )) AS jobs_with_deleted_users,
        -- Total jobs
        COUNT(*) AS total_queue_jobs
    FROM public.processing_queue
),
per_user_queue_counts AS (
    SELECT
        "USER_ID",
        COUNT(*) FILTER (WHERE "STATUS" = 'PENDING') AS user_pending,
        COUNT(*) FILTER (WHERE "STATUS" = 'PROCESSING') AS user_processing,
        COUNT(*) FILTER (WHERE "STATUS" = 'FAILED') AS user_failed,
        COUNT(*) FILTER (WHERE "STATUS" = 'COMPLETED') AS user_completed,
        COUNT(*) AS user_total
    FROM public.processing_queue
    WHERE "USER_ID" IS NOT NULL
    GROUP BY "USER_ID"
)
SELECT
    '=== SCHEMA VERIFICATION ===' AS section,
    json_agg(sc.*) AS schema_status
FROM schema_check sc
UNION ALL
SELECT
    '=== TRIGGER STATUS ===' AS section,
    json_agg(tc.*) AS trigger_status
FROM trigger_check tc
UNION ALL
SELECT
    '=== DATA INTEGRITY ===' AS section,
    json_agg(di.*) AS data_status
FROM data_integrity di
UNION ALL
SELECT
    '=== QUEUE INTEGRITY (GLOBAL) ===' AS section,
    json_agg(qi.*) AS queue_global_status
FROM queue_integrity qi
UNION ALL
SELECT
    '=== QUEUE INTEGRITY (PER USER) ===' AS section,
    json_agg(
        json_build_object(
            'user_id', puc."USER_ID",
            'pending', puc.user_pending,
            'processing', puc.user_processing,
            'failed', puc.user_failed,
            'completed', puc.user_completed,
            'total', puc.user_total
        )
    ) AS queue_per_user_status
FROM per_user_queue_counts puc;

-- Queue stats discrepancy warning
DO $$
DECLARE
    global_count INTEGER;
    user_filtered_count INTEGER;
    user_count INTEGER;
BEGIN
    -- Get global queue count
    SELECT COUNT(*) INTO global_count
    FROM public.processing_queue
    WHERE "STATUS" IN ('PENDING', 'PROCESSING', 'FAILED');
    
    -- Get user-filtered count (sum of all users)
    SELECT COALESCE(SUM(cnt), 0) INTO user_filtered_count
    FROM (
        SELECT COUNT(*) as cnt
        FROM public.processing_queue
        WHERE "STATUS" IN ('PENDING', 'PROCESSING', 'FAILED')
        AND "USER_ID" IS NOT NULL
        GROUP BY "USER_ID"
    ) AS user_counts;
    
    -- Get number of unique users
    SELECT COUNT(DISTINCT "USER_ID") INTO user_count
    FROM public.processing_queue
    WHERE "USER_ID" IS NOT NULL;
    
    IF global_count != user_filtered_count THEN
        RAISE NOTICE '⚠️ QUEUE STATS DISCREPANCY DETECTED:';
        RAISE NOTICE '   Global count (queue_stats view): % jobs', global_count;
        RAISE NOTICE '   User-filtered count (direct queries): % jobs', user_filtered_count;
        RAISE NOTICE '   Difference: % jobs (likely orphaned or NULL USER_ID)', global_count - user_filtered_count;
        RAISE NOTICE '   Number of users with jobs: %', user_count;
        RAISE NOTICE '';
        RAISE NOTICE '📌 RECOMMENDATION:';
        RAISE NOTICE '   - Use direct queries with USER_ID filtering instead of queue_stats view';
        RAISE NOTICE '   - Or use get_queue_stats_for_user(user_id) function for user-specific stats';
        RAISE NOTICE '   - Clean up orphaned jobs with NULL USER_ID if any exist';
    ELSE
        RAISE NOTICE '✓ Queue counts match: Global (%) = User-filtered (%)', global_count, user_filtered_count;
        RAISE NOTICE '  Number of users with jobs: %', user_count;
    END IF;
END $$;

-- Simple success message
SELECT 
    '✅ Schema Verification & Repair Complete' AS status,
    NOW() AS completed_at,
    'Check the results above for any issues' AS next_step;
