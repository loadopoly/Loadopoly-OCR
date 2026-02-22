-- =============================================================================
-- Spatial Anchors Migration
-- Stores GPS + compass data captured at photo time for each recognized object.
-- Enables cross-session triangulation and GIS-based Knowledge Graph enrichment.
--
-- IDEMPOTENT — safe to run multiple times.
-- PostGIS geometry columns are added separately so the CREATE TABLE succeeds
-- even when the PostGIS extension is not yet available.
-- =============================================================================

-- Enable PostGIS extension for geospatial operations (idempotent)
CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA extensions;

-- =============================================================================
-- TABLE: spatial_anchors
-- One row per recognized object per capture.
-- devices provide GPS + compass; subject coordinates are computed server-side.
-- =============================================================================
CREATE TABLE IF NOT EXISTS spatial_anchors (
  "ID"                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "CREATED_AT"            TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Owning user and asset linkage
  "USER_ID"               UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  "ASSET_ID"              UUID,  -- FK to digital_assets if/when created from this capture
  "CAPTURE_SESSION_ID"    TEXT,  -- client-generated session identifier for batch triangulation

  -- Device position at capture time (WGS84 decimal degrees)
  "DEVICE_LAT"            DOUBLE PRECISION NOT NULL,
  "DEVICE_LNG"            DOUBLE PRECISION NOT NULL,
  "DEVICE_ALT_M"          DOUBLE PRECISION DEFAULT 0,         -- altitude in meters
  "DEVICE_ACCURACY_M"     DOUBLE PRECISION,                   -- GPS horizontal accuracy radius

  -- Device orientation at capture time
  "COMPASS_HEADING_DEG"   DOUBLE PRECISION NOT NULL,          -- 0-360, true north
  "DEVICE_PITCH_DEG"      DOUBLE PRECISION DEFAULT 0,         -- tilt: 0=horizontal, 90=straight up
  "DEVICE_ROLL_DEG"       DOUBLE PRECISION DEFAULT 0,

  -- Camera field of view (from device/user configuration)
  "FOV_HORIZONTAL_DEG"    DOUBLE PRECISION DEFAULT 60,
  "FOV_VERTICAL_DEG"      DOUBLE PRECISION DEFAULT 45,
  "IMAGE_WIDTH_PX"        INTEGER DEFAULT 1920,
  "IMAGE_HEIGHT_PX"       INTEGER DEFAULT 1080,

  -- Detected object bounding box within image (normalized 0-1)
  "BBOX_X"                DOUBLE PRECISION,    -- left edge
  "BBOX_Y"                DOUBLE PRECISION,    -- top edge
  "BBOX_W"                DOUBLE PRECISION,    -- width
  "BBOX_H"                DOUBLE PRECISION,    -- height

  -- OCR / AI recognition result for this object
  "RECOGNIZED_TEXT"        TEXT,
  "RECOGNIZED_LABEL"       TEXT,               -- e.g. "Hoover Dam", "Exit Sign", "License Plate"
  "RECOGNITION_CONFIDENCE" DOUBLE PRECISION,   -- 0-1

  -- Computed subject coordinates (filled by Edge Function after raycast)
  "SUBJECT_LAT"           DOUBLE PRECISION,
  "SUBJECT_LNG"           DOUBLE PRECISION,
  "SUBJECT_ALT_M"         DOUBLE PRECISION,
  "SUBJECT_BEARING_DEG"   DOUBLE PRECISION,   -- absolute bearing device→subject
  "SUBJECT_DISTANCE_M"    DOUBLE PRECISION,   -- estimated distance in meters

  -- Cross-session triangulation quality
  "TRIANGULATION_COUNT"   INTEGER DEFAULT 0,  -- how many sessions contributed to this fix
  "TRIANGULATION_RMSE_M"  DOUBLE PRECISION,   -- root-mean-square error of triangulation

  -- Metadata
  "GRAPH_NODE_ID"         UUID,               -- link to graph_nodes once entity is resolved
  "PROCESSING_STATUS"     TEXT DEFAULT 'pending'
                          CHECK ("PROCESSING_STATUS" IN ('pending', 'processed', 'triangulated', 'failed'))
);

-- PostGIS geometry columns — added separately so the table can be created even
-- if PostGIS is not yet loaded.  `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`
-- prevents errors on re-runs.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'postgis') THEN
    -- Device position point
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'spatial_anchors' AND column_name = 'DEVICE_POINT'
    ) THEN
      ALTER TABLE spatial_anchors ADD COLUMN "DEVICE_POINT" extensions.geometry(Point, 4326);
    END IF;
    -- Estimated subject position point
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'spatial_anchors' AND column_name = 'SUBJECT_POINT'
    ) THEN
      ALTER TABLE spatial_anchors ADD COLUMN "SUBJECT_POINT" extensions.geometry(Point, 4326);
    END IF;
  END IF;
END $$;

-- =============================================================================
-- INDEXES
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_spatial_anchors_user    ON spatial_anchors("USER_ID");
CREATE INDEX IF NOT EXISTS idx_spatial_anchors_asset   ON spatial_anchors("ASSET_ID") WHERE "ASSET_ID" IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_spatial_anchors_session ON spatial_anchors("CAPTURE_SESSION_ID") WHERE "CAPTURE_SESSION_ID" IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_spatial_anchors_status  ON spatial_anchors("PROCESSING_STATUS");
CREATE INDEX IF NOT EXISTS idx_spatial_anchors_label   ON spatial_anchors("RECOGNIZED_LABEL") WHERE "RECOGNIZED_LABEL" IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_spatial_anchors_node    ON spatial_anchors("GRAPH_NODE_ID") WHERE "GRAPH_NODE_ID" IS NOT NULL;

-- Spatial indexes (only created when PostGIS geometry columns exist)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'spatial_anchors' AND column_name = 'DEVICE_POINT'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_spatial_anchors_device_geo
      ON spatial_anchors USING GIST ("DEVICE_POINT") WHERE "DEVICE_POINT" IS NOT NULL';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_spatial_anchors_subject_geo
      ON spatial_anchors USING GIST ("SUBJECT_POINT") WHERE "SUBJECT_POINT" IS NOT NULL';
  END IF;
END $$;

-- =============================================================================
-- TRIGGER: auto-populate PostGIS geometry columns from lat/lng on insert/update
-- Only creates the trigger when PostGIS geometry columns are present.
-- =============================================================================
CREATE OR REPLACE FUNCTION sync_spatial_anchor_geometry()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  -- Device position
  IF NEW."DEVICE_LAT" IS NOT NULL AND NEW."DEVICE_LNG" IS NOT NULL THEN
    BEGIN
      NEW."DEVICE_POINT" := extensions.ST_SetSRID(
        extensions.ST_MakePoint(NEW."DEVICE_LNG", NEW."DEVICE_LAT"),
        4326
      );
    EXCEPTION WHEN undefined_column OR undefined_function THEN
      -- PostGIS or geometry columns not available — skip silently
      NULL;
    END;
  END IF;
  -- Subject position (computed async by Edge Function)
  IF NEW."SUBJECT_LAT" IS NOT NULL AND NEW."SUBJECT_LNG" IS NOT NULL THEN
    BEGIN
      NEW."SUBJECT_POINT" := extensions.ST_SetSRID(
        extensions.ST_MakePoint(NEW."SUBJECT_LNG", NEW."SUBJECT_LAT"),
        4326
      );
    EXCEPTION WHEN undefined_column OR undefined_function THEN
      NULL;
    END;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_spatial_anchor_geometry ON spatial_anchors;
CREATE TRIGGER trg_spatial_anchor_geometry
  BEFORE INSERT OR UPDATE ON spatial_anchors
  FOR EACH ROW EXECUTE FUNCTION sync_spatial_anchor_geometry();

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================
ALTER TABLE spatial_anchors ENABLE ROW LEVEL SECURITY;

-- Users can read/write their own anchors
DROP POLICY IF EXISTS "spatial_anchors_select_own" ON spatial_anchors;
CREATE POLICY "spatial_anchors_select_own" ON spatial_anchors
  FOR SELECT TO authenticated
  USING (auth.uid() = "USER_ID");

DROP POLICY IF EXISTS "spatial_anchors_insert_own" ON spatial_anchors;
CREATE POLICY "spatial_anchors_insert_own" ON spatial_anchors
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = "USER_ID");

DROP POLICY IF EXISTS "spatial_anchors_update_own" ON spatial_anchors;
CREATE POLICY "spatial_anchors_update_own" ON spatial_anchors
  FOR UPDATE TO authenticated
  USING (auth.uid() = "USER_ID");

-- DELETE restricted to service_role only (via spatial_anchors_service_role policy).
-- Users must submit explicit deletion requests; mass deletes only from Supabase dashboard.

-- Edge Functions / service_role can read/write all anchors for triangulation
DROP POLICY IF EXISTS "spatial_anchors_service_role" ON spatial_anchors;
CREATE POLICY "spatial_anchors_service_role" ON spatial_anchors
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE spatial_anchors IS
  'GPS + compass + FOV data captured per recognized object. Subject coordinates are computed by the spatial-coordinates Edge Function using haversine bearing raycast, then refined across sessions via PostGIS triangulation.';
