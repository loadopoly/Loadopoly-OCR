# Knowledge Graph Backfill & Spatial Tracking

This document explains how the Knowledge Graph and Spatial Tracking systems process data, both for new uploads and existing historical data.

## 1. The Two Types of Analysis

There is an important distinction between the two types of analysis for your data:

### A. Knowledge Graph Backfill (Works on ALL old data)
The `kg-backfill` Edge Function reads the OCR text of every existing asset and extracts entities (people, places, organizations, concepts) and relationships. It populates the `graph_nodes` and `graph_edges` tables.

### B. Spatial Triangulation (Requires NEW data)
The `spatial-coordinates` math (e.g., the Hoover Dam example) requires device compass heading, pitch, and FOV. Unless your old photos already saved this specific sensor data in their metadata, true spatial triangulation will only work on **new** photos taken with the updated AR Scanner/Camera. Old photos with standard GPS will just get a basic location node.

---

## 2. Automating the Backfill (Passive Background Task)

To run the analysis on existing data, you can convert it into a **passive, automated background task** using Supabase's `pg_cron` extension.

We have provided a SQL script to set this up:
**File:** `sql/SCHEDULE_KG_BACKFILL.sql`

### Instructions:
1. Open the `sql/SCHEDULE_KG_BACKFILL.sql` file.
2. Replace `<YOUR_PROJECT_REF>` with your actual Supabase project reference (e.g., `kuofzhrrpgimtomgact`).
3. Replace `<YOUR_ANON_KEY>` with your actual Supabase anon/public key.
4. Run the script in your Supabase SQL Editor.

The database will automatically wake up every 5 minutes, call your `kg-backfill` Edge Function, and process a batch of 50 old photos in the background. Once the `GRAPH_PROCESSED` flag on all your existing assets flips to `true`, the cron job will simply wake up, see there is no old data left to process, and go back to sleep, costing you zero compute.

---

## 3. Triggering the Backfill Manually

If you don't want to wait for the cron job and want to process a batch immediately, you can trigger the Edge Function from your terminal using the provided shell script:

**File:** `scripts/trigger-kg-backfill.sh`

### Instructions:
```bash
export SUPABASE_URL="https://<YOUR_PROJECT_REF>.supabase.co"
export SUPABASE_ANON_KEY="<YOUR_ANON_KEY>"
./scripts/trigger-kg-backfill.sh
```

---

## 4. Monitoring Progress

Since the cron job runs passively in the background, you can monitor its progress by running these queries in your Supabase SQL Editor:

**See how many entities and relationships have been discovered:**
```sql
SELECT 
  (SELECT count(*) FROM graph_nodes) as total_unique_entities,
  (SELECT count(*) FROM graph_edges) as total_relationships;
```

**View the most recently discovered Knowledge Graph nodes:**
```sql
SELECT "LABEL", "NODE_TYPE", "ASSET_COUNT", "CREATED_AT"
FROM graph_nodes
ORDER BY "CREATED_AT" DESC
LIMIT 10;
```

**Check the Edge Function Logs:**
Go to your **Supabase Dashboard -> Edge Functions -> kg-backfill -> Logs** to watch the function actively extracting data using Gemini in real-time every 5 minutes.
