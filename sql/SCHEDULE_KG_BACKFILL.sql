-- =============================================================================
-- Knowledge Graph Backfill Cron Job
-- =============================================================================
-- This script schedules the kg-backfill Edge Function to run automatically
-- every 5 minutes in the background. It processes old assets and extracts
-- entities and relationships to populate the Knowledge Graph.
--
-- INSTRUCTIONS:
-- 1. Replace <YOUR_PROJECT_REF> with your Supabase project reference (e.g., kuofzhrrpgimtomgact)
-- 2. Replace <YOUR_ANON_KEY> with your Supabase anon/public key
-- 3. Run this script in your Supabase SQL Editor
-- =============================================================================

-- Enable the required extensions for cron and network requests
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Remove the job if it already exists to avoid duplicates
SELECT cron.unschedule('passive-kg-backfill');

-- Schedule the backfill to run every 5 minutes automatically
SELECT cron.schedule(
  'passive-kg-backfill',
  '*/5 * * * *', -- Runs every 5 minutes
  $$
  SELECT net.http_post(
      url:='https://<YOUR_PROJECT_REF>.supabase.co/functions/v1/kg-backfill',
      headers:='{"Authorization": "Bearer <YOUR_ANON_KEY>", "Content-Type": "application/json"}'::jsonb,
      body:='{"batchSize": 50, "onlyUnprocessed": true}'::jsonb
  )
  $$
);

-- =============================================================================
-- HELPER QUERIES (Do not run these as part of the setup, just for reference)
-- =============================================================================

/*
-- Check if the job is scheduled correctly:
SELECT * FROM cron.job;

-- Monitor progress (Total entities and relationships):
SELECT 
  (SELECT count(*) FROM graph_nodes) as total_unique_entities,
  (SELECT count(*) FROM graph_edges) as total_relationships;

-- View the most recently discovered Knowledge Graph nodes:
SELECT "LABEL", "NODE_TYPE", "ASSET_COUNT", "CREATED_AT"
FROM graph_nodes
ORDER BY "CREATED_AT" DESC
LIMIT 10;
*/
