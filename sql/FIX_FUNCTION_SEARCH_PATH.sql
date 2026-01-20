-- =============================================
-- FIX: Function Search Path Mutable
-- =============================================
-- Issue: Functions without search_path can be exploited
-- Solution: Set search_path = '' for all functions
-- =============================================

-- Fix get_pipeline_stats
ALTER FUNCTION public.get_pipeline_stats() SET search_path = '';

-- Fix get_followup_queue
ALTER FUNCTION public.get_followup_queue() SET search_path = '';

-- Fix get_sector_presence
ALTER FUNCTION public.get_sector_presence() SET search_path = '';

-- Fix get_user_owned_assets
ALTER FUNCTION public.get_user_owned_assets(UUID) SET search_path = '';

-- Fix get_package_purchase_preview
ALTER FUNCTION public.get_package_purchase_preview(TEXT) SET search_path = '';

-- Fix get_dimension_distribution
ALTER FUNCTION public.get_dimension_distribution(TEXT) SET search_path = '';

-- Fix initialize_user_avatar
ALTER FUNCTION public.initialize_user_avatar(UUID) SET search_path = '';

-- Fix update_presence_heartbeat
ALTER FUNCTION public.update_presence_heartbeat(UUID) SET search_path = '';

-- Fix update_partnership_timestamp
ALTER FUNCTION public.update_partnership_timestamp() SET search_path = '';

-- Fix purchase_package
ALTER FUNCTION public.purchase_package(TEXT, UUID) SET search_path = '';

-- Fix claim_processing_job
ALTER FUNCTION public.claim_processing_job(TEXT) SET search_path = '';

-- Fix find_structured_mapping
ALTER FUNCTION public.find_structured_mapping(TEXT, TEXT) SET search_path = '';

-- Fix update_bundle_asset_count
ALTER FUNCTION public.update_bundle_asset_count() SET search_path = '';

-- Fix upsert_classification_mapping
ALTER FUNCTION public.upsert_classification_mapping(TEXT, TEXT, TEXT, TEXT) SET search_path = '';

SELECT '✅ Function search_path fixed for all functions' AS result;
