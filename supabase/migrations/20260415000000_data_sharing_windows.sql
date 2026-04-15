-- ============================================================
-- Data Sharing Windows & Seed Datasets
-- ============================================================
-- Allows power users to define time periods of data as either
-- shareable, locked, or designated as active seed datasets for
-- onboarding new users.
--
-- Design principles:
--   • Additive only — no existing tables are altered.
--   • Idempotent  — safe to run multiple times (IF NOT EXISTS).
--   • RLS-native  — consistent with the existing security model.
-- ============================================================

-- ============================================================
-- ENUM: sharing_status
-- ============================================================
DO $$ BEGIN
  CREATE TYPE sharing_status AS ENUM ('shareable', 'locked', 'seed');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ============================================================
-- ENUM: window_visibility
-- ============================================================
DO $$ BEGIN
  CREATE TYPE window_visibility AS ENUM ('private', 'community', 'public');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ============================================================
-- TABLE: data_sharing_windows
-- ============================================================
-- A "sharing window" is a named time range that a power user
-- attaches a sharing policy to. Any historical document whose
-- OCR-derived or ingested timestamp falls within the window
-- inherits the window's sharing_status for access-control
-- purposes.
-- ============================================================
CREATE TABLE IF NOT EXISTS data_sharing_windows (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Human-readable label, e.g. "Q1 2025 Historical Maps"
  label            TEXT NOT NULL,

  -- The time range of *document data* this window covers.
  -- NULL start_date means "from the beginning of time".
  -- NULL end_date means "up to and including now".
  start_date       TIMESTAMPTZ,
  end_date         TIMESTAMPTZ,

  -- Sharing policy for documents within this window
  sharing_status   sharing_status NOT NULL DEFAULT 'locked',

  -- Who can see this window definition (not the documents)
  visibility       window_visibility NOT NULL DEFAULT 'private',

  -- Optional: restrict window to documents owned by a specific community
  community_id     UUID,

  -- Optional license override applied to documents within this window
  -- when sharing_status = 'shareable' or 'seed'.
  -- If NULL, each document's own DATA_LICENSE field is respected.
  license_override TEXT,

  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-update updated_at on every change
CREATE OR REPLACE FUNCTION update_sharing_window_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sharing_window_updated_at ON data_sharing_windows;
CREATE TRIGGER trg_sharing_window_updated_at
  BEFORE UPDATE ON data_sharing_windows
  FOR EACH ROW EXECUTE FUNCTION update_sharing_window_updated_at();

-- Indexes
CREATE INDEX IF NOT EXISTS idx_sharing_windows_user_id
  ON data_sharing_windows(user_id);

CREATE INDEX IF NOT EXISTS idx_sharing_windows_status
  ON data_sharing_windows(sharing_status);

CREATE INDEX IF NOT EXISTS idx_sharing_windows_visibility
  ON data_sharing_windows(visibility);

CREATE INDEX IF NOT EXISTS idx_sharing_windows_dates
  ON data_sharing_windows(start_date, end_date);

-- ============================================================
-- TABLE: seed_datasets
-- ============================================================
-- A "seed dataset" is a frozen, curated snapshot derived from
-- one or more sharing windows. It is delivered to new users
-- during onboarding so they immediately experience the app's
-- integrative features (OCR → Graph → GIS → GARD).
-- ============================================================
CREATE TABLE IF NOT EXISTS seed_datasets (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  title              TEXT NOT NULL,
  description        TEXT,

  -- Optional link to the sharing window this was snapshotted from
  sharing_window_id  UUID REFERENCES data_sharing_windows(id) ON DELETE SET NULL,

  -- Ordered list of historical document UUIDs included in this seed
  document_ids       UUID[] NOT NULL DEFAULT '{}',

  -- Serialised knowledge graph (nodes + edges) for offline/Dexie hydration
  graph_snapshot     JSONB,

  -- Serialised cluster/classification data for offline hydration
  cluster_snapshot   JSONB,

  -- Bounding box {minLat, maxLat, minLng, maxLng} of spatial data in this seed
  gis_bounds         JSONB,

  -- When true, this seed is offered to new users at onboarding time.
  -- Only one seed should be active at a time; enforced at app level.
  is_active          BOOLEAN NOT NULL DEFAULT FALSE,

  -- Feature tags this seed showcases, e.g. ['ocr','graph','gis','gard','metaverse']
  feature_highlights TEXT[] NOT NULL DEFAULT '{}',

  -- Cumulative count of distinct users who have loaded this seed
  adoption_count     INTEGER NOT NULL DEFAULT 0,

  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_seed_datasets_creator_id
  ON seed_datasets(creator_id);

CREATE INDEX IF NOT EXISTS idx_seed_datasets_is_active
  ON seed_datasets(is_active) WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_seed_datasets_window_id
  ON seed_datasets(sharing_window_id);

-- ============================================================
-- TABLE: seed_adoptions
-- ============================================================
-- Tracks which users have loaded which seed datasets so we can
-- compute adoption_count and drive GARD sharing-incentive rewards.
-- ============================================================
CREATE TABLE IF NOT EXISTS seed_adoptions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seed_id        UUID NOT NULL REFERENCES seed_datasets(id) ON DELETE CASCADE,
  user_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  adopted_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(seed_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_seed_adoptions_seed_id
  ON seed_adoptions(seed_id);

CREATE INDEX IF NOT EXISTS idx_seed_adoptions_user_id
  ON seed_adoptions(user_id);

-- Trigger: increment adoption_count on seed_datasets when a new adoption is recorded
CREATE OR REPLACE FUNCTION increment_seed_adoption_count()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  UPDATE seed_datasets
  SET adoption_count = adoption_count + 1
  WHERE id = NEW.seed_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_seed_adoption_count ON seed_adoptions;
CREATE TRIGGER trg_seed_adoption_count
  AFTER INSERT ON seed_adoptions
  FOR EACH ROW EXECUTE FUNCTION increment_seed_adoption_count();

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

-- data_sharing_windows
ALTER TABLE data_sharing_windows ENABLE ROW LEVEL SECURITY;

-- Owner can do anything with their own windows
CREATE POLICY "sharing_windows_owner_all"
  ON data_sharing_windows FOR ALL
  USING  ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

-- Any authenticated user can read community-visible windows
CREATE POLICY "sharing_windows_community_read"
  ON data_sharing_windows FOR SELECT
  USING (visibility = 'community' AND (SELECT auth.role()) = 'authenticated');

-- Anyone (including anon) can read public windows
CREATE POLICY "sharing_windows_public_read"
  ON data_sharing_windows FOR SELECT
  USING (visibility = 'public');

-- Service role has full access
CREATE POLICY "sharing_windows_service_all"
  ON data_sharing_windows FOR ALL
  USING ((SELECT auth.role()) = 'service_role');

-- seed_datasets
ALTER TABLE seed_datasets ENABLE ROW LEVEL SECURITY;

-- Owner can manage their own seeds
CREATE POLICY "seed_datasets_owner_all"
  ON seed_datasets FOR ALL
  USING  ((SELECT auth.uid()) = creator_id)
  WITH CHECK ((SELECT auth.uid()) = creator_id);

-- Any authenticated user can read active seed datasets (for onboarding hydration)
CREATE POLICY "seed_datasets_active_read"
  ON seed_datasets FOR SELECT
  USING (is_active = TRUE AND (SELECT auth.role()) = 'authenticated');

-- Service role has full access (for background jobs, adoption counting)
CREATE POLICY "seed_datasets_service_all"
  ON seed_datasets FOR ALL
  USING ((SELECT auth.role()) = 'service_role');

-- seed_adoptions
ALTER TABLE seed_adoptions ENABLE ROW LEVEL SECURITY;

-- Users can insert and read their own adoption records
CREATE POLICY "seed_adoptions_self_all"
  ON seed_adoptions FOR ALL
  USING  ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

-- Seed creators can read adoptions for their seeds
CREATE POLICY "seed_adoptions_creator_read"
  ON seed_adoptions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM seed_datasets sd
      WHERE sd.id = seed_adoptions.seed_id
        AND sd.creator_id = (SELECT auth.uid())
    )
  );

-- Service role has full access
CREATE POLICY "seed_adoptions_service_all"
  ON seed_adoptions FOR ALL
  USING ((SELECT auth.role()) = 'service_role');

-- ============================================================
-- HELPER FUNCTION: get_sharing_status_for_document
-- ============================================================
-- Returns the effective sharing_status for a given document
-- (identified by its ingest / OCR timestamp) for a given owner.
-- If multiple windows overlap, the most-restrictive status wins:
-- locked > seed > shareable.
-- ============================================================
CREATE OR REPLACE FUNCTION get_sharing_status_for_document(
  p_user_id   UUID,
  p_doc_date  TIMESTAMPTZ
)
RETURNS sharing_status
LANGUAGE SQL STABLE AS $$
  SELECT
    CASE
      WHEN bool_or(sharing_status = 'locked')    THEN 'locked'::sharing_status
      WHEN bool_or(sharing_status = 'seed')      THEN 'seed'::sharing_status
      WHEN bool_or(sharing_status = 'shareable') THEN 'shareable'::sharing_status
      ELSE 'locked'::sharing_status
    END
  FROM data_sharing_windows
  WHERE user_id = p_user_id
    AND (start_date IS NULL OR start_date <= p_doc_date)
    AND (end_date   IS NULL OR end_date   >= p_doc_date);
$$;

-- Grant execute to authenticated users so they can call it from the client
GRANT EXECUTE ON FUNCTION get_sharing_status_for_document(UUID, TIMESTAMPTZ)
  TO authenticated;

-- ============================================================
-- COLUMN COMMENTS (schema self-documentation)
-- ============================================================

COMMENT ON COLUMN data_sharing_windows.start_date IS
  'Inclusive lower bound of the document data period. NULL = "from the beginning of time".';
COMMENT ON COLUMN data_sharing_windows.end_date IS
  'Inclusive upper bound of the document data period. NULL = "up to and including now".';
COMMENT ON COLUMN data_sharing_windows.sharing_status IS
  'Policy applied to documents whose timestamp falls within [start_date, end_date]: '
  '"locked" keeps data local-only, "shareable" allows cloud sync, '
  '"seed" marks data as eligible for onboarding seed datasets.';
COMMENT ON COLUMN data_sharing_windows.visibility IS
  'Who can see this window definition itself (not the document content): '
  '"private" = owner only, "community" = community members, "public" = anyone.';
COMMENT ON COLUMN data_sharing_windows.license_override IS
  'Optional license string (e.g. "CC0") that supersedes per-document DATA_LICENSE '
  'when sharing_status is "shareable" or "seed". NULL = respect each document''s own license.';

COMMENT ON COLUMN seed_datasets.is_active IS
  'Only one seed dataset should be active (true) at a time. '
  'The active seed is delivered to new users during onboarding.';
COMMENT ON COLUMN seed_datasets.feature_highlights IS
  'Array of feature areas this seed showcases, e.g. ARRAY[''ocr'',''graph'',''gis'',''gard'',''metaverse'']. '
  'Used to guide the onboarding tour.';
COMMENT ON COLUMN seed_datasets.adoption_count IS
  'Automatically incremented by the trg_seed_adoption_count trigger. '
  'Counts distinct users who have loaded this seed via seed_adoptions.';

