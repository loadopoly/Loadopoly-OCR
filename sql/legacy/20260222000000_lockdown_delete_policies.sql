-- =============================================================================
-- DELETE Policy Lockdown Migration
-- 
-- Ensures that DELETE operations on all core tables are restricted to
-- service_role ONLY. Regular authenticated users cannot mass-delete data.
-- 
-- Users who need data deleted must submit an explicit deletion request.
-- Mass deletions can only be performed from the Supabase dashboard by
-- the database owner (service_role / admin).
--
-- IDEMPOTENT — safe to run multiple times. Every table reference is
-- wrapped in a DO $$ IF EXISTS block so this migration never errors on
-- tables that have not been created yet.
--
-- Date: 2026-02-22
-- =============================================================================

-- =============================================================================
-- 1. PROCESSING QUEUE — No client-side deletes allowed
-- =============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'processing_queue') THEN
    DROP POLICY IF EXISTS "Users delete own queue items"     ON processing_queue;
    DROP POLICY IF EXISTS "Users can delete own queue items" ON processing_queue;
    DROP POLICY IF EXISTS "Service role delete queue items"  ON processing_queue;

    EXECUTE 'CREATE POLICY "Service role delete queue items"
      ON processing_queue FOR DELETE TO service_role USING (true)';
  END IF;
END $$;

-- =============================================================================
-- 2. HISTORICAL DOCUMENTS GLOBAL — Lock down delete to service_role
-- =============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'historical_documents_global') THEN
    DROP POLICY IF EXISTS "Public Anonymous Delete"       ON historical_documents_global;
    DROP POLICY IF EXISTS "Users delete own documents"    ON historical_documents_global;
    DROP POLICY IF EXISTS "delete_own_documents"          ON historical_documents_global;
    DROP POLICY IF EXISTS "Service role delete documents" ON historical_documents_global;

    EXECUTE 'CREATE POLICY "Service role delete documents"
      ON historical_documents_global FOR DELETE TO service_role USING (true)';
  END IF;
END $$;

-- =============================================================================
-- 3. DIGITAL ASSET BUNDLES — Lock down delete to service_role
-- =============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'digital_asset_bundles') THEN
    DROP POLICY IF EXISTS "Users manage own bundles"   ON digital_asset_bundles;
    DROP POLICY IF EXISTS "Users delete own bundles"   ON digital_asset_bundles;
    DROP POLICY IF EXISTS "Users view own bundles"     ON digital_asset_bundles;
    DROP POLICY IF EXISTS "Users insert own bundles"   ON digital_asset_bundles;
    DROP POLICY IF EXISTS "Users update own bundles"   ON digital_asset_bundles;
    DROP POLICY IF EXISTS "Service role delete bundles" ON digital_asset_bundles;

    -- Re-create SELECT / INSERT / UPDATE for authenticated (no DELETE)
    EXECUTE 'CREATE POLICY "Users view own bundles"
      ON digital_asset_bundles FOR SELECT
      USING ((select auth.uid()) = "USER_ID" OR (select auth.role()) = ''service_role'')';

    EXECUTE 'CREATE POLICY "Users insert own bundles"
      ON digital_asset_bundles FOR INSERT
      WITH CHECK ((select auth.uid()) = "USER_ID")';

    EXECUTE 'CREATE POLICY "Users update own bundles"
      ON digital_asset_bundles FOR UPDATE
      USING ((select auth.uid()) = "USER_ID")';

    EXECUTE 'CREATE POLICY "Service role delete bundles"
      ON digital_asset_bundles FOR DELETE TO service_role USING (true)';
  END IF;
END $$;

-- =============================================================================
-- 4. GRAPH NODES — Ensure no user-level delete
-- =============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'graph_nodes') THEN
    DROP POLICY IF EXISTS "graph_nodes_delete_own" ON graph_nodes;
    DROP POLICY IF EXISTS "graph_nodes_delete_all" ON graph_nodes;
    -- graph_nodes_service already covers service_role FOR ALL
  END IF;
END $$;

-- =============================================================================
-- 5. GRAPH EDGES — Ensure no user-level delete
-- =============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'graph_edges') THEN
    DROP POLICY IF EXISTS "graph_edges_delete"     ON graph_edges;
    DROP POLICY IF EXISTS "graph_edges_delete_own" ON graph_edges;
    -- graph_edges_service already covers service_role FOR ALL
  END IF;
END $$;

-- =============================================================================
-- 6. ASSET GRAPH NODES (junction) — Ensure no user-level delete
-- =============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'asset_graph_nodes') THEN
    DROP POLICY IF EXISTS "asset_graph_nodes_delete"     ON asset_graph_nodes;
    DROP POLICY IF EXISTS "asset_graph_nodes_delete_own" ON asset_graph_nodes;
    -- asset_graph_nodes_service already covers service_role FOR ALL
  END IF;
END $$;

-- =============================================================================
-- 7. SPATIAL ANCHORS — Lock down delete to service_role only
-- =============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'spatial_anchors') THEN
    DROP POLICY IF EXISTS "spatial_anchors_delete_own"             ON spatial_anchors;
    DROP POLICY IF EXISTS "Service role delete spatial_anchors"    ON spatial_anchors;

    EXECUTE 'CREATE POLICY "Service role delete spatial_anchors"
      ON spatial_anchors FOR DELETE TO service_role USING (true)';
  END IF;
END $$;

-- =============================================================================
-- 8. SHARD & TOKEN TABLES — Ensure no user-level delete
-- =============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'shard_holdings') THEN
    DROP POLICY IF EXISTS "shard_holdings_delete" ON shard_holdings;
    DROP POLICY IF EXISTS "Service role delete shard_holdings" ON shard_holdings;
    EXECUTE 'CREATE POLICY "Service role delete shard_holdings"
      ON shard_holdings FOR DELETE TO service_role USING (true)';
  END IF;

  IF EXISTS (SELECT FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'gard_tokenized_assets') THEN
    DROP POLICY IF EXISTS "gard_tokenized_assets_delete" ON gard_tokenized_assets;
    DROP POLICY IF EXISTS "Service role delete gard_tokenized_assets" ON gard_tokenized_assets;
    EXECUTE 'CREATE POLICY "Service role delete gard_tokenized_assets"
      ON gard_tokenized_assets FOR DELETE TO service_role USING (true)';
  END IF;

  IF EXISTS (SELECT FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'pending_rewards') THEN
    DROP POLICY IF EXISTS "pending_rewards_delete" ON pending_rewards;
    DROP POLICY IF EXISTS "Service role delete pending_rewards" ON pending_rewards;
    EXECUTE 'CREATE POLICY "Service role delete pending_rewards"
      ON pending_rewards FOR DELETE TO service_role USING (true)';
  END IF;
END $$;
