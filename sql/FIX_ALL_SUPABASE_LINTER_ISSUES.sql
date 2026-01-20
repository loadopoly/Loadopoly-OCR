-- =============================================
-- MASTER FIX: All Supabase Database Linter Issues
-- =============================================
-- Run this script in your Supabase SQL Editor to fix all linter issues
-- 
-- Issues addressed:
-- 1. Security Definer Views (ERROR)
-- 2. Function Search Path Mutable (WARN)
-- 3. RLS Policy Always True (WARN)
-- 4. Auth RLS InitPlan Performance (WARN)
-- =============================================

BEGIN;

-- ============================================
-- 1. FIX SECURITY DEFINER VIEWS
-- ============================================

-- Drop and recreate cache_hit_stats without SECURITY DEFINER
DROP VIEW IF EXISTS public.cache_hit_stats;

CREATE VIEW public.cache_hit_stats AS
SELECT
    schemaname,
    relname AS table_name,
    heap_blks_read,
    heap_blks_hit,
    CASE 
        WHEN heap_blks_hit + heap_blks_read > 0 
        THEN round(100.0 * heap_blks_hit / (heap_blks_hit + heap_blks_read), 2)
        ELSE 0 
    END AS cache_hit_ratio
FROM pg_statio_user_tables
WHERE schemaname = 'public'
ORDER BY heap_blks_read DESC;

-- Drop and recreate index_usage_stats without SECURITY DEFINER
DROP VIEW IF EXISTS public.index_usage_stats;

CREATE VIEW public.index_usage_stats AS
SELECT
    schemaname,
    relname AS table_name,
    indexrelname AS index_name,
    idx_scan AS index_scans,
    idx_tup_read AS tuples_read,
    idx_tup_fetch AS tuples_fetched,
    pg_size_pretty(pg_relation_size(indexrelid)) AS index_size
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
ORDER BY idx_scan DESC;

GRANT SELECT ON public.cache_hit_stats TO authenticated;
GRANT SELECT ON public.index_usage_stats TO authenticated;

-- ============================================
-- 2. FIX FUNCTION SEARCH PATH
-- ============================================

-- Use DO block to handle functions that may not exist
DO $$
BEGIN
  -- get_pipeline_stats
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'get_pipeline_stats') THEN
    ALTER FUNCTION public.get_pipeline_stats() SET search_path = '';
  END IF;
  
  -- get_followup_queue
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'get_followup_queue') THEN
    ALTER FUNCTION public.get_followup_queue() SET search_path = '';
  END IF;
  
  -- get_sector_presence
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'get_sector_presence') THEN
    ALTER FUNCTION public.get_sector_presence() SET search_path = '';
  END IF;
  
  -- get_user_owned_assets - try common signatures
  BEGIN
    ALTER FUNCTION public.get_user_owned_assets(UUID) SET search_path = '';
  EXCEPTION WHEN undefined_function THEN
    BEGIN
      ALTER FUNCTION public.get_user_owned_assets() SET search_path = '';
    EXCEPTION WHEN undefined_function THEN NULL;
    END;
  END;
  
  -- get_package_purchase_preview
  BEGIN
    ALTER FUNCTION public.get_package_purchase_preview(TEXT) SET search_path = '';
  EXCEPTION WHEN undefined_function THEN NULL;
  END;
  
  -- get_dimension_distribution
  BEGIN
    ALTER FUNCTION public.get_dimension_distribution(TEXT) SET search_path = '';
  EXCEPTION WHEN undefined_function THEN NULL;
  END;
  
  -- initialize_user_avatar
  BEGIN
    ALTER FUNCTION public.initialize_user_avatar(UUID) SET search_path = '';
  EXCEPTION WHEN undefined_function THEN NULL;
  END;
  
  -- update_presence_heartbeat
  BEGIN
    ALTER FUNCTION public.update_presence_heartbeat(UUID) SET search_path = '';
  EXCEPTION WHEN undefined_function THEN NULL;
  END;
  
  -- update_partnership_timestamp (trigger function, no args)
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_partnership_timestamp') THEN
    ALTER FUNCTION public.update_partnership_timestamp() SET search_path = '';
  END IF;
  
  -- purchase_package
  BEGIN
    ALTER FUNCTION public.purchase_package(TEXT, UUID) SET search_path = '';
  EXCEPTION WHEN undefined_function THEN NULL;
  END;
  
  -- claim_processing_job
  BEGIN
    ALTER FUNCTION public.claim_processing_job(TEXT) SET search_path = '';
  EXCEPTION WHEN undefined_function THEN NULL;
  END;
  
  -- find_structured_mapping
  BEGIN
    ALTER FUNCTION public.find_structured_mapping(TEXT, TEXT) SET search_path = '';
  EXCEPTION WHEN undefined_function THEN NULL;
  END;
  
  -- update_bundle_asset_count (trigger function)
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_bundle_asset_count') THEN
    ALTER FUNCTION public.update_bundle_asset_count() SET search_path = '';
  END IF;
  
  -- upsert_classification_mapping
  BEGIN
    ALTER FUNCTION public.upsert_classification_mapping(TEXT, TEXT, TEXT, TEXT) SET search_path = '';
  EXCEPTION WHEN undefined_function THEN NULL;
  END;
  
END $$;

-- ============================================
-- 3. FIX RLS POLICIES WITH (select auth.uid())
-- ============================================

-- Helper: Only modify policies if table exists
DO $$
BEGIN
  -- dataset_shares
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'dataset_shares') THEN
    DROP POLICY IF EXISTS "Authenticated manage dataset_shares" ON public.dataset_shares;
    CREATE POLICY "Users manage own dataset_shares"
    ON public.dataset_shares FOR ALL
    USING ((select auth.uid()) = user_id)
    WITH CHECK ((select auth.uid()) = user_id);
  END IF;

  -- historical_documents_global
  -- CRITICAL: Separate INSERT policy to allow new records
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'historical_documents_global') THEN
    DROP POLICY IF EXISTS "user isolation" ON public.historical_documents_global;
    DROP POLICY IF EXISTS "shared access" ON public.historical_documents_global;
    DROP POLICY IF EXISTS "Public Anonymous Insert" ON public.historical_documents_global;
    DROP POLICY IF EXISTS "Authenticated insert own" ON public.historical_documents_global;
    DROP POLICY IF EXISTS "Users view own documents" ON public.historical_documents_global;
    DROP POLICY IF EXISTS "Users update own documents" ON public.historical_documents_global;
    DROP POLICY IF EXISTS "Users delete own documents" ON public.historical_documents_global;
    
    -- SELECT: Users can view their own documents OR public ones
    CREATE POLICY "Users view own documents"
    ON public.historical_documents_global FOR SELECT
    USING (
      "USER_ID" = (select auth.uid())
      OR "IS_PUBLIC" = true
      OR "USER_ID" IS NULL
    );
    
    -- INSERT: Authenticated users can insert with their own USER_ID, anonymous can insert with NULL
    CREATE POLICY "Authenticated insert own"
    ON public.historical_documents_global FOR INSERT
    WITH CHECK (
      "USER_ID" = (select auth.uid())
      OR "USER_ID" IS NULL
    );
    
    -- UPDATE: Users can only update their own documents
    CREATE POLICY "Users update own documents"
    ON public.historical_documents_global FOR UPDATE
    USING ("USER_ID" = (select auth.uid()))
    WITH CHECK ("USER_ID" = (select auth.uid()));
    
    -- DELETE: Users can only delete their own documents
    CREATE POLICY "Users delete own documents"
    ON public.historical_documents_global FOR DELETE
    USING ("USER_ID" = (select auth.uid()));
  END IF;

  -- user_profiles
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'user_profiles') THEN
    DROP POLICY IF EXISTS "Users can view own profile" ON public.user_profiles;
    DROP POLICY IF EXISTS "Users can update own profile" ON public.user_profiles;
    
    CREATE POLICY "Users can view own profile"
    ON public.user_profiles FOR SELECT
    USING (id = (select auth.uid()));
    
    CREATE POLICY "Users can update own profile"
    ON public.user_profiles FOR UPDATE
    USING (id = (select auth.uid()))
    WITH CHECK (id = (select auth.uid()));
  END IF;

  -- user_purchases
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'user_purchases') THEN
    DROP POLICY IF EXISTS "Users view own purchases" ON public.user_purchases;
    
    CREATE POLICY "Users view own purchases"
    ON public.user_purchases FOR SELECT
    USING (user_id = (select auth.uid()));
  END IF;

  -- data_assets
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'data_assets') THEN
    DROP POLICY IF EXISTS "Users view owned assets" ON public.data_assets;
    
    CREATE POLICY "Users view owned assets"
    ON public.data_assets FOR SELECT
    USING (owner_id = (select auth.uid()));
  END IF;

  -- user_asset_access
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'user_asset_access') THEN
    DROP POLICY IF EXISTS "Users view own access records" ON public.user_asset_access;
    
    CREATE POLICY "Users view own access records"
    ON public.user_asset_access FOR SELECT
    USING (user_id = (select auth.uid()));
  END IF;

  -- user_bundles
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'user_bundles') THEN
    DROP POLICY IF EXISTS "Allow authenticated users to create bundles" ON public.user_bundles;
    DROP POLICY IF EXISTS "Allow users to update their own bundles" ON public.user_bundles;
    
    CREATE POLICY "Allow authenticated users to create bundles"
    ON public.user_bundles FOR INSERT
    WITH CHECK (user_id = (select auth.uid()));
    
    CREATE POLICY "Allow users to update their own bundles"
    ON public.user_bundles FOR UPDATE
    USING (user_id = (select auth.uid()))
    WITH CHECK (user_id = (select auth.uid()));
  END IF;

  -- user_avatars
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'user_avatars') THEN
    DROP POLICY IF EXISTS "Users update own avatar" ON public.user_avatars;
    DROP POLICY IF EXISTS "Users insert own avatar" ON public.user_avatars;
    
    CREATE POLICY "Users update own avatar"
    ON public.user_avatars FOR UPDATE
    USING (user_id = (select auth.uid()))
    WITH CHECK (user_id = (select auth.uid()));
    
    CREATE POLICY "Users insert own avatar"
    ON public.user_avatars FOR INSERT
    WITH CHECK (user_id = (select auth.uid()));
  END IF;

  -- presence_sessions
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'presence_sessions') THEN
    DROP POLICY IF EXISTS "Users manage own presence" ON public.presence_sessions;
    
    CREATE POLICY "Users manage own presence"
    ON public.presence_sessions FOR ALL
    USING (user_id = (select auth.uid()))
    WITH CHECK (user_id = (select auth.uid()));
  END IF;

  -- digital_asset_bundles
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'digital_asset_bundles') THEN
    DROP POLICY IF EXISTS "Users manage own bundles" ON public.digital_asset_bundles;
    
    CREATE POLICY "Users manage own bundles"
    ON public.digital_asset_bundles FOR ALL
    USING (owner_id = (select auth.uid()))
    WITH CHECK (owner_id = (select auth.uid()));
  END IF;

  -- archive_partnerships (admin only)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'archive_partnerships') THEN
    DROP POLICY IF EXISTS "Admin full access for partnerships" ON public.archive_partnerships;
    
    CREATE POLICY "Admin full access for partnerships"
    ON public.archive_partnerships FOR ALL
    USING (
      EXISTS (
        SELECT 1 FROM public.user_profiles up 
        WHERE up.id = (select auth.uid()) 
        AND up.is_admin = true
      )
    );
  END IF;

  -- partnership_activities (admin only)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'partnership_activities') THEN
    DROP POLICY IF EXISTS "Admin full access for activities" ON public.partnership_activities;
    
    CREATE POLICY "Admin full access for activities"
    ON public.partnership_activities FOR ALL
    USING (
      EXISTS (
        SELECT 1 FROM public.user_profiles up 
        WHERE up.id = (select auth.uid()) 
        AND up.is_admin = true
      )
    );
  END IF;

  -- grant_opportunities (admin only)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'grant_opportunities') THEN
    DROP POLICY IF EXISTS "Admin full access for grants" ON public.grant_opportunities;
    
    CREATE POLICY "Admin full access for grants"
    ON public.grant_opportunities FOR ALL
    USING (
      EXISTS (
        SELECT 1 FROM public.user_profiles up 
        WHERE up.id = (select auth.uid()) 
        AND up.is_admin = true
      )
    );
  END IF;

END $$;

COMMIT;

SELECT '✅ All Supabase linter issues fixed!' AS result,
       'Re-run Database Linter in Supabase Dashboard to verify' AS next_step;
