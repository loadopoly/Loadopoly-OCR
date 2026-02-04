-- =============================================
-- FIX: RLS Policy Always True & Auth RLS InitPlan
-- =============================================
-- Issues:
-- 1. Overly permissive USING (true) policies
-- 2. auth.uid() called without (select ...) wrapper
-- =============================================

-- ============================================
-- FIX: dataset_shares - Remove overly permissive policy
-- ============================================
DROP POLICY IF EXISTS "Authenticated manage dataset_shares" ON public.dataset_shares;

CREATE POLICY "Users manage own dataset_shares"
ON public.dataset_shares FOR ALL
USING ((select auth.uid()) = user_id)
WITH CHECK ((select auth.uid()) = user_id);

-- ============================================
-- FIX: historical_documents_global RLS policies
-- Wrap auth.uid() in (select ...) for performance
-- CRITICAL: Separate INSERT policy to allow new records
-- ============================================
DROP POLICY IF EXISTS "user isolation" ON public.historical_documents_global;
DROP POLICY IF EXISTS "shared access" ON public.historical_documents_global;
DROP POLICY IF EXISTS "Public Anonymous Insert" ON public.historical_documents_global;
DROP POLICY IF EXISTS "Authenticated insert own" ON public.historical_documents_global;

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

-- ============================================
-- FIX: user_profiles RLS policies
-- ============================================
DROP POLICY IF EXISTS "Users can view own profile" ON public.user_profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.user_profiles;

CREATE POLICY "Users can view own profile"
ON public.user_profiles FOR SELECT
USING (id = (select auth.uid()));

CREATE POLICY "Users can update own profile"
ON public.user_profiles FOR UPDATE
USING (id = (select auth.uid()))
WITH CHECK (id = (select auth.uid()));

-- ============================================
-- FIX: user_purchases RLS policies
-- ============================================
DROP POLICY IF EXISTS "Users view own purchases" ON public.user_purchases;

CREATE POLICY "Users view own purchases"
ON public.user_purchases FOR SELECT
USING (user_id = (select auth.uid()));

-- ============================================
-- FIX: data_assets RLS policies
-- ============================================
DROP POLICY IF EXISTS "Users view owned assets" ON public.data_assets;

CREATE POLICY "Users view owned assets"
ON public.data_assets FOR SELECT
USING (owner_id = (select auth.uid()));

-- ============================================
-- FIX: user_asset_access RLS policies
-- ============================================
DROP POLICY IF EXISTS "Users view own access records" ON public.user_asset_access;

CREATE POLICY "Users view own access records"
ON public.user_asset_access FOR SELECT
USING (user_id = (select auth.uid()));

-- ============================================
-- FIX: user_bundles RLS policies
-- ============================================
DROP POLICY IF EXISTS "Allow authenticated users to create bundles" ON public.user_bundles;
DROP POLICY IF EXISTS "Allow users to update their own bundles" ON public.user_bundles;

CREATE POLICY "Allow authenticated users to create bundles"
ON public.user_bundles FOR INSERT
WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "Allow users to update their own bundles"
ON public.user_bundles FOR UPDATE
USING (user_id = (select auth.uid()))
WITH CHECK (user_id = (select auth.uid()));

-- ============================================
-- FIX: user_avatars RLS policies
-- ============================================
DROP POLICY IF EXISTS "Users update own avatar" ON public.user_avatars;
DROP POLICY IF EXISTS "Users insert own avatar" ON public.user_avatars;

CREATE POLICY "Users update own avatar"
ON public.user_avatars FOR UPDATE
USING (user_id = (select auth.uid()))
WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "Users insert own avatar"
ON public.user_avatars FOR INSERT
WITH CHECK (user_id = (select auth.uid()));

-- ============================================
-- FIX: presence_sessions RLS policies
-- ============================================
DROP POLICY IF EXISTS "Users manage own presence" ON public.presence_sessions;

CREATE POLICY "Users manage own presence"
ON public.presence_sessions FOR ALL
USING (user_id = (select auth.uid()))
WITH CHECK (user_id = (select auth.uid()));

-- ============================================
-- FIX: digital_asset_bundles RLS policies
-- ============================================
DROP POLICY IF EXISTS "Users manage own bundles" ON public.digital_asset_bundles;

CREATE POLICY "Users manage own bundles"
ON public.digital_asset_bundles FOR ALL
USING (owner_id = (select auth.uid()))
WITH CHECK (owner_id = (select auth.uid()));

-- ============================================
-- FIX: archive_partnerships RLS policies
-- ============================================
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

-- ============================================
-- FIX: partnership_activities RLS policies
-- ============================================
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

-- ============================================
-- FIX: grant_opportunities RLS policies
-- ============================================
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

SELECT '✅ RLS policies fixed with (select auth.uid()) wrapper' AS result;
