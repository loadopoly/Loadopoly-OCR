-- ============================================
-- DATABASE OPTIMIZATION SCHEMA
-- ============================================
-- Performance optimizations for hyper-large datasets:
-- - BRIN indexes for time-series data (10x smaller than B-tree)
-- - GIN indexes for JSONB entity searches
-- - Partial indexes for processing queues
-- - Partitioning preparation
-- Version: 2.0.0
--
-- DEPENDENCIES:
-- - historical_documents_global (core table - required)
-- - royalty_transactions (from GARD_SCHEMA.sql)
-- - realtime_events, presence_sessions (from AVATAR_PERSISTENCE_SCHEMA.sql)
--
-- Run the dependency schemas BEFORE this optimization schema.
-- ============================================

-- ============================================
-- BRIN Indexes (Block Range Index)
-- Best for time-series and sequential data
-- 10x smaller than B-tree, ideal for CREATED_AT
-- ============================================

-- Drop existing B-tree indexes on timestamp columns if they exist
DROP INDEX IF EXISTS idx_documents_created_at;
DROP INDEX IF EXISTS idx_royalty_timestamp;

-- BRIN index on historical_documents_global (main corpus table)
CREATE INDEX IF NOT EXISTS idx_documents_created_at_brin 
ON historical_documents_global USING BRIN (CREATED_AT)
WITH (pages_per_range = 128);

-- BRIN index on royalty transactions (only if table exists)
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_tables WHERE tablename = 'royalty_transactions') THEN
        CREATE INDEX IF NOT EXISTS idx_royalty_created_at_brin 
        ON royalty_transactions USING BRIN (CREATED_AT)
        WITH (pages_per_range = 128);
    END IF;
END $$;

-- BRIN index on realtime events (only if table exists)
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_tables WHERE tablename = 'realtime_events') THEN
        CREATE INDEX IF NOT EXISTS idx_events_created_at_brin 
        ON realtime_events USING BRIN (CREATED_AT)
        WITH (pages_per_range = 128);
    END IF;
END $$;

-- ============================================
-- GIN Indexes for JSONB Searches
-- Enables fast entity and metadata queries
-- ============================================

-- GIN index for extracted entities (JSONB array)
CREATE INDEX IF NOT EXISTS idx_entities_gin 
ON historical_documents_global USING GIN (ENTITIES_EXTRACTED jsonb_path_ops);

-- GIN index for keywords/tags
CREATE INDEX IF NOT EXISTS idx_keywords_gin 
ON historical_documents_global USING GIN (KEYWORDS_TAGS);

-- GIN index for preservation events
CREATE INDEX IF NOT EXISTS idx_preservation_gin 
ON historical_documents_global USING GIN (PRESERVATION_EVENTS jsonb_path_ops);

-- GIN index for item attributes (rich metadata)
CREATE INDEX IF NOT EXISTS idx_item_attrs_gin 
ON historical_documents_global USING GIN (ITEM_ATTRIBUTES jsonb_path_ops);

-- GIN index for scenery attributes
CREATE INDEX IF NOT EXISTS idx_scenery_attrs_gin 
ON historical_documents_global USING GIN (SCENERY_ATTRIBUTES jsonb_path_ops);

-- ============================================
-- Partial Indexes for Processing Queues
-- Only index rows that match common filter conditions
-- Dramatically smaller and faster for queue operations
-- ============================================

-- Partial index for pending/processing items only
CREATE INDEX IF NOT EXISTS idx_pending_processing 
ON historical_documents_global (ASSET_ID, CREATED_AT DESC)
WHERE PROCESSING_STATUS IN ('PENDING', 'PROCESSING');

-- Partial index for failed items needing retry
CREATE INDEX IF NOT EXISTS idx_failed_items 
ON historical_documents_global (ASSET_ID, CREATED_AT DESC)
WHERE PROCESSING_STATUS = 'FAILED';

-- Partial index for unprocessed user assets
CREATE INDEX IF NOT EXISTS idx_user_pending 
ON historical_documents_global (USER_ID, CREATED_AT DESC)
WHERE PROCESSING_STATUS = 'PENDING' AND USER_ID IS NOT NULL;

-- Partial index for enterprise-only content
CREATE INDEX IF NOT EXISTS idx_enterprise_content 
ON historical_documents_global (CREATED_AT DESC)
WHERE IS_ENTERPRISE = TRUE;

-- Partial index for public domain (CC0) content
CREATE INDEX IF NOT EXISTS idx_public_domain 
ON historical_documents_global (CREATED_AT DESC)
WHERE DATA_LICENSE = 'CC0';

-- ============================================
-- Composite Indexes for Common Query Patterns
-- ============================================

-- User + status + date (common dashboard query)
CREATE INDEX IF NOT EXISTS idx_user_status_date 
ON historical_documents_global (USER_ID, PROCESSING_STATUS, CREATED_AT DESC);

-- Source collection + category (aggregation queries)
CREATE INDEX IF NOT EXISTS idx_source_category 
ON historical_documents_global (SOURCE_COLLECTION, NLP_NODE_CATEGORIZATION);

-- GIS zone + timestamp (geo-temporal queries)
CREATE INDEX IF NOT EXISTS idx_zone_timestamp 
ON historical_documents_global (LOCAL_GIS_ZONE, CREATED_AT DESC);

-- Community filtering
CREATE INDEX IF NOT EXISTS idx_community_date 
ON historical_documents_global (COMMUNITY_ID, CREATED_AT DESC)
WHERE COMMUNITY_ID IS NOT NULL;

-- ============================================
-- Index Usage Monitoring View
-- ============================================

CREATE OR REPLACE VIEW index_usage_stats AS
SELECT 
    schemaname,
    relname AS table_name,
    indexrelname AS index_name,
    idx_scan AS index_scans,
    idx_tup_read AS tuples_read,
    idx_tup_fetch AS tuples_fetched,
    pg_size_pretty(pg_relation_size(indexrelid)) AS index_size
FROM pg_stat_user_indexes
ORDER BY idx_scan DESC;

-- ============================================
-- Table Statistics View
-- ============================================

CREATE OR REPLACE VIEW table_stats AS
SELECT 
    relname AS table_name,
    n_live_tup AS live_rows,
    n_dead_tup AS dead_rows,
    CASE WHEN n_live_tup > 0 
         THEN ROUND(100.0 * n_dead_tup / n_live_tup, 2) 
         ELSE 0 
    END AS dead_row_pct,
    last_vacuum,
    last_autovacuum,
    last_analyze,
    last_autoanalyze
FROM pg_stat_user_tables
ORDER BY n_live_tup DESC;

-- ============================================
-- Cache Hit Rate Monitoring
-- ============================================

CREATE OR REPLACE VIEW cache_hit_stats AS
SELECT 
    'index hit rate' AS metric,
    ROUND(100.0 * SUM(idx_blks_hit) / NULLIF(SUM(idx_blks_hit + idx_blks_read), 0), 2) AS hit_rate_pct
FROM pg_statio_user_indexes
UNION ALL
SELECT 
    'table hit rate' AS metric,
    ROUND(100.0 * SUM(heap_blks_hit) / NULLIF(SUM(heap_blks_hit + heap_blks_read), 0), 2) AS hit_rate_pct
FROM pg_statio_user_tables;

-- ============================================
-- Slow Query Detection Function
-- ============================================

CREATE OR REPLACE FUNCTION get_slow_queries(threshold_ms INTEGER DEFAULT 1000)
RETURNS TABLE (
    query TEXT,
    calls BIGINT,
    mean_time_ms NUMERIC,
    total_time_ms NUMERIC
) AS $$
BEGIN
    -- Note: Requires pg_stat_statements extension
    RETURN QUERY
    SELECT 
        LEFT(pss.query, 200) AS query,
        pss.calls,
        ROUND((pss.mean_exec_time)::NUMERIC, 2) AS mean_time_ms,
        ROUND((pss.total_exec_time)::NUMERIC, 2) AS total_time_ms
    FROM pg_stat_statements pss
    WHERE pss.mean_exec_time > threshold_ms
    ORDER BY pss.mean_exec_time DESC
    LIMIT 20;
EXCEPTION
    WHEN undefined_table THEN
        RAISE NOTICE 'pg_stat_statements extension not enabled';
        RETURN;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- Automatic VACUUM/ANALYZE Tuning
-- ============================================

-- Aggressive autovacuum for high-churn tables
ALTER TABLE historical_documents_global SET (
    autovacuum_vacuum_scale_factor = 0.05,
    autovacuum_analyze_scale_factor = 0.02,
    autovacuum_vacuum_cost_delay = 10
);

-- Autovacuum for presence_sessions (only if table exists)
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_tables WHERE tablename = 'presence_sessions') THEN
        ALTER TABLE presence_sessions SET (
            autovacuum_vacuum_scale_factor = 0.01,
            autovacuum_analyze_scale_factor = 0.01
        );
    END IF;
END $$;

-- Autovacuum for realtime_events (only if table exists)
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_tables WHERE tablename = 'realtime_events') THEN
        ALTER TABLE realtime_events SET (
            autovacuum_vacuum_scale_factor = 0.02,
            autovacuum_analyze_scale_factor = 0.01
        );
    END IF;
END $$;

-- ============================================
-- Partitioning Preparation
-- (Apply when table exceeds 10M+ rows)
-- ============================================

-- Note: Partitioning requires table recreation.
-- This is a reference schema for future implementation.

/*
-- Step 1: Create new partitioned table
CREATE TABLE historical_documents_global_partitioned (
    LIKE historical_documents_global INCLUDING ALL
) PARTITION BY RANGE (CREATED_AT);

-- Step 2: Create partitions (quarterly)
CREATE TABLE documents_2025_q4 PARTITION OF historical_documents_global_partitioned
    FOR VALUES FROM ('2025-10-01') TO ('2026-01-01');
    
CREATE TABLE documents_2026_q1 PARTITION OF historical_documents_global_partitioned
    FOR VALUES FROM ('2026-01-01') TO ('2026-04-01');

CREATE TABLE documents_2026_q2 PARTITION OF historical_documents_global_partitioned
    FOR VALUES FROM ('2026-04-01') TO ('2026-07-01');

-- Step 3: Migrate data (during maintenance window)
INSERT INTO historical_documents_global_partitioned
SELECT * FROM historical_documents_global;

-- Step 4: Swap tables
ALTER TABLE historical_documents_global RENAME TO historical_documents_global_old;
ALTER TABLE historical_documents_global_partitioned RENAME TO historical_documents_global;

-- Step 5: Update RLS policies on new table
*/

-- ============================================
-- Data Archival Helper
-- ============================================

-- Function to count records eligible for archival
CREATE OR REPLACE FUNCTION get_archival_candidates(days_old INTEGER DEFAULT 365)
RETURNS TABLE (
    total_candidates BIGINT,
    oldest_date TIMESTAMPTZ,
    estimated_size_mb NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COUNT(*) AS total_candidates,
        MIN(CREATED_AT) AS oldest_date,
        ROUND(
            COUNT(*) * 
            (SELECT AVG(pg_column_size(t.*)) FROM historical_documents_global t LIMIT 1000) 
            / 1024.0 / 1024.0, 
            2
        ) AS estimated_size_mb
    FROM historical_documents_global
    WHERE CREATED_AT < NOW() - (days_old || ' days')::INTERVAL;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- Connection Pool Optimization
-- ============================================

-- Note: Connection settings are managed at Supabase project level.
-- Recommended settings for Supavisor:
-- - Use port 6543 for pooled connections (transaction mode)
-- - Use port 5432 only for long-running queries
-- - Set pool allocation to 40-60% for PostgREST API workloads

COMMENT ON DATABASE postgres IS 
'Optimized for GeoGraph Node v2.0.0
- BRIN indexes on timestamps
- GIN indexes on JSONB fields  
- Partial indexes for queues
- Use pooled connections (port 6543) for API calls
- Cache hit target: >99%';
