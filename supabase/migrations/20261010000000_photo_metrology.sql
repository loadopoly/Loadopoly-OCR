-- ============================================================
-- Migration: photogrammetric connection (holon.metrology/1)
-- ============================================================
-- One shared place where every app's photo scale observations meet,
-- keyed by the photo's content hash (photo_key = 'sha256:<hex>' of the
-- original bytes). GeoGraph OCR writes here with the signed-in user's
-- session; StockOpoly mirrors its public view here with the service key
-- (stockopoly/supabase_sync.py, table "metrology_obs_public").
--
-- Contract: Metrology/photometrology.py (umbrella repo); TS port
-- src/lib/photoMetrology.ts. All lengths are millimetres. Game units
-- ("tile") never appear here.
--
-- Privacy (firewall, like bakugo_scans):
--   * metrology_standards are PERSONAL (a person's calibrated finger, palm,
--     shoe). Owner-only RLS, consent timestamp required, never readable by
--     anyone else, never exported.
--   * An observation that used a personal standard stores its scale but not
--     its pixel span (pixels × scale would reveal the body measurement) —
--     enforced by CHECK.
--   * No GPS / location / part identifiers here: those stay in each app's
--     own RLS'd tables. photo_key alone identifies nothing.
-- ============================================================

-- ── Photos (camera facts only) ───────────────────────────────
CREATE TABLE IF NOT EXISTS metrology_photos (
    photo_key TEXT PRIMARY KEY
        CHECK (photo_key ~ '^sha256:[0-9a-f]{64}$'),
    width_px INTEGER CHECK (width_px > 0),
    height_px INTEGER CHECK (height_px > 0),
    focal_35mm DOUBLE PRECISION CHECK (focal_35mm > 0),
    focus_distance_m DOUBLE PRECISION CHECK (focus_distance_m > 0),
    camera_model TEXT,
    first_seen_app TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Published reference sizes (identical to photometrology.REFERENCES) ──
CREATE TABLE IF NOT EXISTS metrology_references (
    ref_key TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    length_mm DOUBLE PRECISION NOT NULL CHECK (length_mm > 0),
    sigma_mm DOUBLE PRECISION NOT NULL CHECK (sigma_mm > 0),
    note TEXT,
    -- link to the older graph_nodes sizing seeds where one exists
    graph_node_canonical_id TEXT
);

INSERT INTO metrology_references (ref_key, name, length_mm, sigma_mm, note, graph_node_canonical_id) VALUES
  ('iso_id1.width',           'ISO/IEC 7810 ID-1 card, long edge',        85.60,  0.13, 'bank/credit card', 'ref_credit_card_iso'),
  ('iso_id1.height',          'ISO/IEC 7810 ID-1 card, short edge',       53.98,  0.13, NULL, 'ref_credit_card_iso'),
  ('tcg_standard.width',      'Standard TCG card (Pokémon), short edge',  63.0,   0.5,  'caliper reading 62.47 mm on 2026-08-14 sits inside this spread', NULL),
  ('tcg_standard.height',     'Standard TCG card (Pokémon), long edge',   88.0,   0.5,  NULL, NULL),
  ('pegboard.pitch_1in',      'Pegboard hole pitch (1 in grid)',          25.4,   0.25, NULL, NULL),
  ('rack.teardrop_pitch_2in', 'Teardrop pallet-rack upright punch pitch', 50.8,   0.5,  'industry-typical; confirm on site with one tape shot', NULL),
  ('pallet.gma.length',       'GMA pallet, 48 in side',                   1219.2, 6.0,  NULL, NULL),
  ('pallet.gma.width',        'GMA pallet, 40 in side',                   1016.0, 6.0,  NULL, NULL),
  ('paper.us_letter.width',   'US Letter, short edge',                    215.9,  0.5,  NULL, 'ref_paper_us_letter'),
  ('paper.a4.width',          'A4, short edge',                           210.0,  0.5,  NULL, 'ref_paper_a4')
ON CONFLICT (ref_key) DO UPDATE SET
  name = EXCLUDED.name, length_mm = EXCLUDED.length_mm, sigma_mm = EXCLUDED.sigma_mm,
  note = EXCLUDED.note, graph_node_canonical_id = EXCLUDED.graph_node_canonical_id;

-- ── Personal local standards ─────────────────────────────────
CREATE TABLE IF NOT EXISTS metrology_standards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_uid UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    part TEXT NOT NULL,                 -- e.g. finger.index.middle_phalanx.width
    definition TEXT,
    value_mm DOUBLE PRECISION NOT NULL CHECK (value_mm > 0),
    sigma_mm DOUBLE PRECISION NOT NULL CHECK (sigma_mm > 0),
    method TEXT,
    calibrated_at DATE,
    valid_until DATE,
    evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
    privacy TEXT NOT NULL DEFAULT 'personal' CHECK (privacy = 'personal'),
    consent_at TIMESTAMPTZ NOT NULL,    -- the owner agreed to store this measurement
    source_app TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (owner_uid, part)
);

-- ── Observations: one scale source on one photo ──────────────
CREATE TABLE IF NOT EXISTS metrology_observations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    photo_key TEXT NOT NULL CHECK (photo_key ~ '^sha256:[0-9a-f]{64}$'),
    source_app TEXT NOT NULL,           -- 'geograph' | 'stockopoly' | ...
    local_id BIGINT,                    -- the app's own row id (idempotent mirroring)
    node TEXT,                          -- StockOpoly's sync tag
    observer_uid UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    ref_kind TEXT NOT NULL CHECK (ref_kind IN ('standard', 'reference', 'exif', 'grid', 'tape')),
    ref_key TEXT,                       -- metrology_references.ref_key for 'reference'
    source_class TEXT NOT NULL CHECK (source_class IN ('measured', 'recorded', 'projected', 'simulated')),
    plane TEXT NOT NULL DEFAULT 'default',
    pixels DOUBLE PRECISION CHECK (pixels > 0),
    pixel_sigma DOUBLE PRECISION CHECK (pixel_sigma >= 0),
    ln_mm_per_px DOUBLE PRECISION NOT NULL,
    sigma_ln DOUBLE PRECISION NOT NULL CHECK (sigma_ln > 0),
    mm_per_px DOUBLE PRECISION GENERATED ALWAYS AS (exp(ln_mm_per_px)) STORED,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT metrology_obs_no_game_units CHECK (source_class <> 'simulated'),
    CONSTRAINT metrology_obs_standard_span_withheld CHECK (ref_kind <> 'standard' OR (pixels IS NULL AND pixel_sigma IS NULL)),
    CONSTRAINT metrology_obs_app_local UNIQUE (source_app, local_id)
);

CREATE INDEX IF NOT EXISTS idx_metrology_obs_photo ON metrology_observations (photo_key, plane);
CREATE INDEX IF NOT EXISTS idx_metrology_obs_observer ON metrology_observations (observer_uid);

-- ── Row level security ───────────────────────────────────────
ALTER TABLE metrology_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE metrology_references ENABLE ROW LEVEL SECURITY;
ALTER TABLE metrology_standards ENABLE ROW LEVEL SECURITY;
ALTER TABLE metrology_observations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "metrology_refs_read" ON metrology_references;
CREATE POLICY "metrology_refs_read" ON metrology_references
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "metrology_photos_read" ON metrology_photos;
CREATE POLICY "metrology_photos_read" ON metrology_photos
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "metrology_photos_insert" ON metrology_photos;
CREATE POLICY "metrology_photos_insert" ON metrology_photos
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "metrology_standards_owner" ON metrology_standards;
CREATE POLICY "metrology_standards_owner" ON metrology_standards
  FOR ALL TO authenticated
  USING (owner_uid = (select auth.uid()))
  WITH CHECK (owner_uid = (select auth.uid()));

DROP POLICY IF EXISTS "metrology_obs_read" ON metrology_observations;
CREATE POLICY "metrology_obs_read" ON metrology_observations
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "metrology_obs_insert_own" ON metrology_observations;
CREATE POLICY "metrology_obs_insert_own" ON metrology_observations
  FOR INSERT TO authenticated WITH CHECK (observer_uid = (select auth.uid()));
DROP POLICY IF EXISTS "metrology_obs_modify_own" ON metrology_observations;
CREATE POLICY "metrology_obs_modify_own" ON metrology_observations
  FOR DELETE TO authenticated USING (observer_uid = (select auth.uid()));
-- (service role — StockOpoly's mirror — bypasses RLS)

-- ── Fused scale per photo/plane (anchored sources only) ──────
CREATE OR REPLACE VIEW metrology_photo_scales WITH (security_invoker = true) AS
SELECT
    photo_key,
    plane,
    count(*)                                                          AS n_sources,
    sum(ln_mm_per_px / (sigma_ln * sigma_ln)) / sum(1.0 / (sigma_ln * sigma_ln)) AS ln_mm_per_px,
    1.0 / sqrt(sum(1.0 / (sigma_ln * sigma_ln)))                      AS sigma_ln,
    exp(sum(ln_mm_per_px / (sigma_ln * sigma_ln)) / sum(1.0 / (sigma_ln * sigma_ln))) AS mm_per_px,
    array_agg(DISTINCT source_app)                                    AS apps,
    max(created_at)                                                   AS updated_at
FROM metrology_observations
WHERE source_class IN ('measured', 'recorded')
GROUP BY photo_key, plane;

-- ── Unit-free EXIF error statistics by lens (what Perceptopoly may read) ──
CREATE OR REPLACE VIEW metrology_exif_error_stats WITH (security_invoker = true) AS
WITH anchored AS (
    SELECT photo_key,
           sum(ln_mm_per_px / (sigma_ln * sigma_ln)) / sum(1.0 / (sigma_ln * sigma_ln)) AS ln_ref
    FROM metrology_observations
    WHERE source_class IN ('measured', 'recorded')
    GROUP BY photo_key
), resid AS (
    SELECT o.photo_key, o.ln_mm_per_px - a.ln_ref AS log_err,
           coalesce(p.focal_35mm::int::text, '') AS lens
    FROM metrology_observations o
    JOIN anchored a USING (photo_key)
    LEFT JOIN metrology_photos p USING (photo_key)
    WHERE o.ref_kind = 'exif'
)
SELECT 'holon.metrology/1'::text AS schema, 'error_stat'::text AS kind,
       'exif'::text AS estimator, lens, count(*) AS n,
       round(avg(log_err)::numeric, 6)::double precision AS mean_log_err,
       round(stddev_samp(log_err)::numeric, 6)::double precision AS sd_log_err
FROM resid
GROUP BY lens;

COMMENT ON TABLE metrology_standards IS
  'Personal calibrated body/object dimensions (holon.metrology/1). Owner-only; never exported. Applied only to the owner''s own photos.';
COMMENT ON TABLE metrology_observations IS
  'Scale sources per photo (sha256 content key) from every app. Personal-standard rows carry the scale but not the pixel span.';
