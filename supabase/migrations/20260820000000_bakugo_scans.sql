-- ============================================================
-- Migration: Bakugo (card centering) scans + labels
-- ============================================================
-- Shares this Supabase *project* with Loadopoly-OCR.
-- Does NOT reuse historical_documents_global: that table is OCR
-- documents (UPPERCASE columns, USER_ID RLS). Bakugo is metrology
-- + provenance labels and must keep the contamination firewall.
--
-- Pages / Pyodide can INSERT with the anon key (metadata only).
-- Photos stay on-device unless a future opt-in upload is added.
-- Certified labels without a cert_number are rejected by CHECK + RLS.
-- ============================================================

CREATE TABLE IF NOT EXISTS bakugo_scans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    local_id INTEGER,
    device_id TEXT NOT NULL,
    card_key TEXT NOT NULL DEFAULT 'unidentified',
    holder TEXT NOT NULL DEFAULT 'raw',
    worst_ratio_pct DOUBLE PRECISION NOT NULL,
    worst_ratio_sigma DOUBLE PRECISION,
    worst_axis TEXT,
    h_ratio_pct DOUBLE PRECISION,
    v_ratio_pct DOUBLE PRECISION,
    left_mm DOUBLE PRECISION,
    right_mm DOUBLE PRECISION,
    top_mm DOUBLE PRECISION,
    bottom_mm DOUBLE PRECISION,
    px_per_mm DOUBLE PRECISION,
    inner_confidence DOUBLE PRECISION,
    refraction_applied BOOLEAN DEFAULT false,
    warnings TEXT,
    phash BIGINT,
    source TEXT,
    engine_version TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (device_id, local_id)
);

CREATE TABLE IF NOT EXISTS bakugo_labels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scan_id UUID NOT NULL REFERENCES bakugo_scans(id) ON DELETE CASCADE,
    local_id INTEGER,
    device_id TEXT NOT NULL,
    grader TEXT NOT NULL,
    grade TEXT NOT NULL,
    centering_subgrade TEXT,
    kind TEXT NOT NULL CHECK (
        kind IN ('certified', 'self_reported', 'marketplace_vote', 'model_predicted')
    ),
    cert_number TEXT,
    attributed_to TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT bakugo_labels_certified_needs_cert CHECK (
        kind <> 'certified'
        OR (cert_number IS NOT NULL AND length(trim(cert_number)) > 0)
    ),
    UNIQUE (device_id, local_id)
);

CREATE INDEX IF NOT EXISTS idx_bakugo_scans_device ON bakugo_scans(device_id);
CREATE INDEX IF NOT EXISTS idx_bakugo_scans_created ON bakugo_scans(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bakugo_labels_scan ON bakugo_labels(scan_id);
CREATE INDEX IF NOT EXISTS idx_bakugo_labels_kind ON bakugo_labels(kind);

ALTER TABLE bakugo_scans ENABLE ROW LEVEL SECURITY;
ALTER TABLE bakugo_labels ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT ON bakugo_scans TO anon, authenticated;
GRANT SELECT, INSERT ON bakugo_labels TO anon, authenticated;

DROP POLICY IF EXISTS bakugo_scans_select ON bakugo_scans;
CREATE POLICY bakugo_scans_select ON bakugo_scans
    FOR SELECT TO anon, authenticated
    USING (true);

DROP POLICY IF EXISTS bakugo_scans_insert ON bakugo_scans;
CREATE POLICY bakugo_scans_insert ON bakugo_scans
    FOR INSERT TO anon, authenticated
    WITH CHECK (device_id IS NOT NULL AND length(trim(device_id)) > 0);

DROP POLICY IF EXISTS bakugo_labels_select ON bakugo_labels;
CREATE POLICY bakugo_labels_select ON bakugo_labels
    FOR SELECT TO anon, authenticated
    USING (true);

DROP POLICY IF EXISTS bakugo_labels_insert ON bakugo_labels;
CREATE POLICY bakugo_labels_insert ON bakugo_labels
    FOR INSERT TO anon, authenticated
    WITH CHECK (
        device_id IS NOT NULL
        AND length(trim(device_id)) > 0
        AND (
            kind <> 'certified'
            OR (cert_number IS NOT NULL AND length(trim(cert_number)) > 0)
        )
    );

COMMENT ON TABLE bakugo_scans IS
    'Bakugo card-centering measurements. Same Supabase project as Loadopoly-OCR; not OCR documents.';
COMMENT ON TABLE bakugo_labels IS
    'Bakugo grade labels. kind=certified requires cert_number. Predictions must never train.';
