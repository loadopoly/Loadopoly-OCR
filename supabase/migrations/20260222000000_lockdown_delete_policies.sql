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
-- Date: 2026-02-22
-- =============================================================================

-- =============================================================================
-- 1. PROCESSING QUEUE - No client-side deletes allowed
-- =============================================================================
-- Drop any existing permissive delete policies
DROP POLICY IF EXISTS "Users delete own queue items" ON processing_queue;
DROP POLICY IF EXISTS "Users can delete own queue items" ON processing_queue;

-- Only service_role can delete queue items (Edge Functions, admin operations)
CREATE POLICY "Service role delete queue items"
  ON processing_queue FOR DELETE
  TO service_role
  USING (true);

-- =============================================================================
-- 2. HISTORICAL DOCUMENTS GLOBAL - Lock down delete to service_role
-- =============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'historical_documents_global') THEN
    -- Remove dangerous wide-open delete policies
    DROP POLICY IF EXISTS "Public Anonymous Delete" ON historical_documents_global;
    DROP POLICY IF EXISTS "Users delete own documents" ON historical_documents_global;
    DROP POLICY IF EXISTS "delete_own_documents" ON historical_documents_global;

    -- Only service_role can delete documents
    EXECUTE 'CREATE POLICY "Service role delete documents" ON historical_documents_global FOR DELETE TO service_role USING (true)';
  END IF;
END $$;

-- =============================================================================
-- 3. DIGITAL ASSET BUNDLES - Lock down delete to service_role
-- =============================================================================
DROP POLICY IF EXISTS "Users manage own bundles" ON digital_asset_bundles;
DROP POLICY IF EXISTS "Users delete own bundles" ON digital_asset_bundles;
DROP POLICY IF EXISTS "Users view own bundles" ON digital_asset_bundles;
DROP POLICY IF EXISTS "Users insert own bundles" ON digital_asset_bundles;
DROP POLICY IF EXISTS "Users update own bundles" ON digital_asset_bundles;
DROP POLICY IF EXISTS "Service role delete bundles" ON digital_asset_bundles;

-- Re-create the manage policy for INSERT/UPDATE/SELECT only (not DELETE)
CREATE POLICY "Users view own bundles"
  ON digital_asset_bundles FOR SELECT
  USING ((select auth.uid()) = "USER_ID" OR (select auth.role()) = 'service_role');

CREATE POLICY "Users insert own bundles"
  ON digital_asset_bundles FOR INSERT
  WITH CHECK ((select auth.uid()) = "USER_ID");

CREATE POLICY "Users update own bundles"
  ON digital_asset_bundles FOR UPDATE
  USING ((select auth.uid()) = "USER_ID");

CREATE POLICY "Service role delete bundles"
  ON digital_asset_bundles FOR DELETE
  TO service_role
  USING (true);

-- =============================================================================
-- 4. GRAPH NODES - Ensure no user-level delete
-- =============================================================================
DROP POLICY IF EXISTS "graph_nodes_delete_own" ON graph_nodes;
DROP POLICY IF EXISTS "graph_nodes_delete_all" ON graph_nodes;

-- graph_nodes_service already covers service_role FOR ALL
-- Explicitly ensure no authenticated delete path exists

-- =============================================================================
-- 5. GRAPH EDGES - Ensure no user-level delete
-- =============================================================================
DROP POLICY IF EXISTS "graph_edges_delete" ON graph_edges;
DROP POLICY IF EXISTS "graph_edges_delete_own" ON graph_edges;

-- graph_edges_service already covers service_role FOR ALL

-- =============================================================================
-- 6. ASSET GRAPH NODES (junction) - Ensure no user-level delete
-- =============================================================================
DROP POLICY IF EXISTS "asset_graph_nodes_delete" ON asset_graph_nodes;
DROP POLICY IF EXISTS "asset_graph_nodes_delete_own" ON asset_graph_nodes;

-- asset_graph_nodes_service already covers service_role FOR ALL

-- =============================================================================
-- 7. SPATIAL ANCHORS - Lock down delete to service_role only
-- =============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'spatial_anchors') THEN
    DROP POLICY IF EXISTS "spatial_anchors_delete_own" ON spatial_anchors;
    DROP POLICY IF EXISTS "Service role delete spatial_anchors" ON spatial_anchors;

    EXECUTE 'CREATE POLICY "Service role delete spatial_anchors" ON spatial_anchors FOR DELETE TO service_role USING (true)';
  END IF;
END $$;

-- =============================================================================
-- 8. SHARD & TOKEN TABLES - Ensure no user-level delete
-- =============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'shard_holdings') THEN
    DROP POLICY IF EXISTS "shard_holdings_delete" ON shard_holdings;
    EXECUTE 'CREATE POLICY "Service role delete shard_holdings" ON shard_holdings FOR DELETE TO service_role USING (true)';
  END IF;
  
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'gard_tokenized_assets') THEN
    DROP POLICY IF EXISTS "gard_tokenized_assets_delete" ON gard_tokenized_assets;
    EXECUTE 'CREATE POLICY "Service role delete gard_tokenized_assets" ON gard_tokenized_assets FOR DELETE TO service_role USING (true)';
  END IF;
  
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'pending_rewards') THEN
    DROP POLICY IF EXISTS "pending_rewards_delete" ON pending_rewards;
    EXECUTE 'CREATE POLICY "Service role delete pending_rewards" ON pending_rewards FOR DELETE TO service_role USING (true)';
  END IF;
END $$;

-- =============================================================================
-- COMMENTS
-- =============================================================================
COMMENT ON POLICY "Service role delete queue items" ON processing_queue IS
  'DELETE on processing_queue restricted to service_role. Users cannot mass-delete queue items from the client.';
