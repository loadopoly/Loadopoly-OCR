-- =============================================================================
-- Knowledge Graph Nodes & Edges Migration
-- Persistent entity graph derived from OCR content and spatial anchors.
-- Enables entity deduplication, cross-asset relationships, and backfill.
-- =============================================================================

-- =============================================================================
-- TABLE: graph_nodes
-- One row per unique real-world entity (place, person, concept, document, etc.)
-- Deduplication key: (node_type + canonical_id) or label normalization.
-- =============================================================================
CREATE TABLE IF NOT EXISTS graph_nodes (
  "ID"                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "CREATED_AT"        TIMESTAMPTZ NOT NULL DEFAULT now(),
  "UPDATED_AT"        TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Entity identity
  "LABEL"             TEXT NOT NULL,                          -- display name
  "CANONICAL_ID"      TEXT,                                   -- external ID (wikidata QID, geonames ID, etc.)
  "NODE_TYPE"         TEXT NOT NULL DEFAULT 'entity'
                      CHECK ("NODE_TYPE" IN (
                        'entity',       -- generic named entity
                        'location',     -- physical place with coordinates
                        'person',       -- individual (historical or current)
                        'organization', -- institution, agency, company
                        'concept',      -- abstract idea, era, theme
                        'document',     -- a specific document/asset
                        'spatial'       -- derived from spatial_anchors
                      )),

  -- Geospatial (for location-type nodes)
  "LAT"               DOUBLE PRECISION,
  "LNG"               DOUBLE PRECISION,
  "ALT_M"             DOUBLE PRECISION,
  "GEO_POINT"         extensions.geometry(Point, 4326),       -- PostGIS column

  -- Provenance & statistics
  "ASSET_COUNT"       INTEGER NOT NULL DEFAULT 0,             -- # assets mentioning this node
  "ANCHOR_COUNT"      INTEGER NOT NULL DEFAULT 0,             -- # spatial_anchors linked
  "FIRST_SEEN_AT"     TIMESTAMPTZ NOT NULL DEFAULT now(),
  "LAST_SEEN_AT"      TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- AI-generated enrichment
  "DESCRIPTION"       TEXT,
  "ALIASES"           TEXT[],                                 -- alternative names/spellings
  "WIKIPEDIA_URL"     TEXT,
  "WIKIDATA_QID"      TEXT,

  -- Backfill processing state
  "GRAPH_PROCESSED"   BOOLEAN NOT NULL DEFAULT false,         -- used by backfill Edge Function
  "EMBEDDING"         VECTOR(768),                            -- optional semantic embedding

  -- Owner (null = global/shared node)
  "USER_ID"           UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Constraints
  UNIQUE ("NODE_TYPE", "CANONICAL_ID")
);

-- =============================================================================
-- TABLE: graph_edges
-- Directed relationships between graph_nodes.
-- =============================================================================
CREATE TABLE IF NOT EXISTS graph_edges (
  "ID"                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "CREATED_AT"        TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Direction
  "FROM_NODE_ID"      UUID NOT NULL REFERENCES graph_nodes("ID") ON DELETE CASCADE,
  "TO_NODE_ID"        UUID NOT NULL REFERENCES graph_nodes("ID") ON DELETE CASCADE,

  -- Relationship semantics
  "RELATIONSHIP"      TEXT NOT NULL,                          -- e.g. 'mentions', 'located_at', 'part_of', 'created_by'
  "WEIGHT"            DOUBLE PRECISION DEFAULT 1.0,           -- co-occurrence frequency or confidence
  "CONFIDENCE"        DOUBLE PRECISION DEFAULT 0.5,           -- AI extraction confidence 0-1
  "IS_SPATIAL"        BOOLEAN DEFAULT false,                  -- derived from spatial triangulation

  -- Source assets that established this edge
  "ASSET_IDS"         UUID[] DEFAULT '{}',

  -- Deduplication: one edge per (from, to, relationship)
  UNIQUE ("FROM_NODE_ID", "TO_NODE_ID", "RELATIONSHIP")
);

-- =============================================================================
-- TABLE: asset_graph_nodes  (junction)
-- Links digital assets to the graph_nodes they mention.
-- =============================================================================
CREATE TABLE IF NOT EXISTS asset_graph_nodes (
  "ASSET_ID"          UUID NOT NULL,
  "NODE_ID"           UUID NOT NULL REFERENCES graph_nodes("ID") ON DELETE CASCADE,
  "CREATED_AT"        TIMESTAMPTZ NOT NULL DEFAULT now(),
  "CONFIDENCE"        DOUBLE PRECISION DEFAULT 1.0,
  "CONTEXT_SNIPPET"   TEXT,   -- the text fragment that established this link

  PRIMARY KEY ("ASSET_ID", "NODE_ID")
);

-- =============================================================================
-- INDEXES
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_graph_nodes_label       ON graph_nodes("LABEL");
CREATE INDEX IF NOT EXISTS idx_graph_nodes_type        ON graph_nodes("NODE_TYPE");
CREATE INDEX IF NOT EXISTS idx_graph_nodes_canonical   ON graph_nodes("CANONICAL_ID") WHERE "CANONICAL_ID" IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_graph_nodes_user        ON graph_nodes("USER_ID") WHERE "USER_ID" IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_graph_nodes_processed   ON graph_nodes("GRAPH_PROCESSED") WHERE "GRAPH_PROCESSED" = false;
CREATE INDEX IF NOT EXISTS idx_graph_nodes_assets      ON graph_nodes("ASSET_COUNT" DESC);
CREATE INDEX IF NOT EXISTS idx_graph_nodes_geo         ON graph_nodes USING GIST ("GEO_POINT") WHERE "GEO_POINT" IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_graph_edges_from        ON graph_edges("FROM_NODE_ID");
CREATE INDEX IF NOT EXISTS idx_graph_edges_to          ON graph_edges("TO_NODE_ID");
CREATE INDEX IF NOT EXISTS idx_graph_edges_rel         ON graph_edges("RELATIONSHIP");
CREATE INDEX IF NOT EXISTS idx_graph_edges_spatial     ON graph_edges("IS_SPATIAL") WHERE "IS_SPATIAL" = true;

CREATE INDEX IF NOT EXISTS idx_asset_graph_nodes_asset ON asset_graph_nodes("ASSET_ID");
CREATE INDEX IF NOT EXISTS idx_asset_graph_nodes_node  ON asset_graph_nodes("NODE_ID");

-- =============================================================================
-- TRIGGERS: auto-update timestamps + sync geo column
-- =============================================================================
CREATE OR REPLACE FUNCTION update_graph_node_timestamps()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  NEW."UPDATED_AT" := now();
  -- Sync PostGIS geometry if lat/lng set
  IF NEW."LAT" IS NOT NULL AND NEW."LNG" IS NOT NULL THEN
    NEW."GEO_POINT" := extensions.ST_SetSRID(
      extensions.ST_MakePoint(NEW."LNG", NEW."LAT"),
      4326
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_graph_node_timestamps ON graph_nodes;
CREATE TRIGGER trg_graph_node_timestamps
  BEFORE INSERT OR UPDATE ON graph_nodes
  FOR EACH ROW EXECUTE FUNCTION update_graph_node_timestamps();

-- Increment asset_count on junction insert
CREATE OR REPLACE FUNCTION increment_node_asset_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE graph_nodes
  SET "ASSET_COUNT" = "ASSET_COUNT" + 1,
      "LAST_SEEN_AT" = now()
  WHERE "ID" = NEW."NODE_ID";
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_increment_node_asset_count ON asset_graph_nodes;
CREATE TRIGGER trg_increment_node_asset_count
  AFTER INSERT ON asset_graph_nodes
  FOR EACH ROW EXECUTE FUNCTION increment_node_asset_count();

-- Decrement on junction delete
CREATE OR REPLACE FUNCTION decrement_node_asset_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE graph_nodes
  SET "ASSET_COUNT" = GREATEST(0, "ASSET_COUNT" - 1)
  WHERE "ID" = OLD."NODE_ID";
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_decrement_node_asset_count ON asset_graph_nodes;
CREATE TRIGGER trg_decrement_node_asset_count
  AFTER DELETE ON asset_graph_nodes
  FOR EACH ROW EXECUTE FUNCTION decrement_node_asset_count();

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================
ALTER TABLE graph_nodes        ENABLE ROW LEVEL SECURITY;
ALTER TABLE graph_edges        ENABLE ROW LEVEL SECURITY;
ALTER TABLE asset_graph_nodes  ENABLE ROW LEVEL SECURITY;

-- Graph nodes: public read (global entities), own write
CREATE POLICY "graph_nodes_read_all"    ON graph_nodes FOR SELECT TO authenticated USING (true);
CREATE POLICY "graph_nodes_insert_own"  ON graph_nodes FOR INSERT TO authenticated WITH CHECK (auth.uid() = "USER_ID" OR "USER_ID" IS NULL);
CREATE POLICY "graph_nodes_update_own"  ON graph_nodes FOR UPDATE TO authenticated USING (auth.uid() = "USER_ID" OR "USER_ID" IS NULL);
CREATE POLICY "graph_nodes_service"     ON graph_nodes FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Edges: public read, service_role write (Edge Function populates)
CREATE POLICY "graph_edges_read_all"    ON graph_edges FOR SELECT TO authenticated USING (true);
CREATE POLICY "graph_edges_service"     ON graph_edges FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Junction: users can see their own asset links
CREATE POLICY "asset_graph_nodes_read"  ON asset_graph_nodes FOR SELECT TO authenticated USING (true);
CREATE POLICY "asset_graph_nodes_service" ON asset_graph_nodes FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE graph_nodes IS
  'Persistent entity graph nodes. NODE_TYPE=location nodes carry PostGIS geometry derived from spatial_anchors triangulation. GRAPH_PROCESSED=false rows are picked up by the kg-backfill Edge Function.';
COMMENT ON TABLE graph_edges IS
  'Directed relationships between graph_nodes. Populated by the spatial-coordinates and kg-backfill Edge Functions. IS_SPATIAL=true indicates triangulation-derived edge.';
COMMENT ON TABLE asset_graph_nodes IS
  'Junction table linking digital assets to graph nodes they mention.';
