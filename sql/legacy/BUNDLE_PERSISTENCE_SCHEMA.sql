-- ============================================
-- BUNDLE PERSISTENCE SCHEMA
-- Version: 1.0.0
-- Description: Supports semantic deduplication and manual curation
-- ============================================

-- 1. Create the Bundles table to store consolidated metadata
CREATE TABLE IF NOT EXISTS digital_asset_bundles (
    ID UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    USER_ID UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    TITLE TEXT NOT NULL,
    DESCRIPTION TEXT,
    CONSOLIDATED_METADATA JSONB DEFAULT '{}',
    IMAGE_URLS TEXT[] DEFAULT '{}',
    ASSET_COUNT INTEGER DEFAULT 1,
    IS_AUTO_GENERATED BOOLEAN DEFAULT false,
    CREATED_AT TIMESTAMPTZ DEFAULT NOW(),
    UPDATED_AT TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Add BUNDLE_ID to your main asset table to support the many-to-one relationship
ALTER TABLE historical_documents_global 
ADD COLUMN IF NOT EXISTS BUNDLE_ID UUID REFERENCES digital_asset_bundles(ID) ON DELETE SET NULL;

-- 3. Enable RLS
ALTER TABLE digital_asset_bundles ENABLE ROW LEVEL SECURITY;

-- 4. Policies
DROP POLICY IF EXISTS "Public view bundles" ON digital_asset_bundles;
CREATE POLICY "Public view bundles" ON digital_asset_bundles FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users manage own bundles" ON digital_asset_bundles;
CREATE POLICY "Users manage own bundles" ON digital_asset_bundles FOR ALL USING (USER_ID = auth.uid());

-- 5. Indexes for fast retrieval in Structured DB and World view
CREATE INDEX IF NOT EXISTS idx_asset_bundle_link ON historical_documents_global(BUNDLE_ID);
CREATE INDEX IF NOT EXISTS idx_bundle_user ON digital_asset_bundles(USER_ID);

-- 6. Function to update asset count automatically
CREATE OR REPLACE FUNCTION update_bundle_asset_count()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') AND NEW.BUNDLE_ID IS NOT NULL THEN
        UPDATE digital_asset_bundles 
        SET ASSET_COUNT = (SELECT count(*) FROM historical_documents_global WHERE BUNDLE_ID = NEW.BUNDLE_ID),
            UPDATED_AT = NOW()
        WHERE ID = NEW.BUNDLE_ID;
    END IF;
    RETURN NEW;   
END;
$$ LANGUAGE plpgsql;

-- 7. Trigger for automatic count updates
DROP TRIGGER IF EXISTS trg_update_bundle_count ON historical_documents_global;
CREATE TRIGGER trg_update_bundle_count
AFTER INSERT OR UPDATE OF BUNDLE_ID ON historical_documents_global
FOR EACH ROW EXECUTE FUNCTION update_bundle_asset_count();
