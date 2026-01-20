-- =============================================
-- FIX: Security Definer Views
-- =============================================
-- Issue: Views with SECURITY DEFINER bypass RLS of querying user
-- Solution: Recreate views with SECURITY INVOKER (default)
-- =============================================

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

COMMENT ON VIEW public.cache_hit_stats IS 'Cache hit statistics for public tables (SECURITY INVOKER)';

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

COMMENT ON VIEW public.index_usage_stats IS 'Index usage statistics for public tables (SECURITY INVOKER)';

-- Grant SELECT to authenticated users (optional, adjust as needed)
GRANT SELECT ON public.cache_hit_stats TO authenticated;
GRANT SELECT ON public.index_usage_stats TO authenticated;

SELECT '✅ Security Definer Views fixed' AS result;
