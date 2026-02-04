-- ============================================
-- STRUCTURED CLUSTER CLASSIFICATION SCHEMA
-- ============================================
-- Adds 6 thematic cluster columns for LLM-synchronized dimension values.
-- Enables correlation between unstructured/derived values and structured classifications.
-- Supports corpus improvement through accumulated datum correlations.

-- ============================================
-- ADD STRUCTURED CLUSTER COLUMNS
-- ============================================

-- Add structured classification columns to historical_documents_global
ALTER TABLE historical_documents_global
ADD COLUMN IF NOT EXISTS "STRUCTURED_TEMPORAL" JSONB DEFAULT NULL,
ADD COLUMN IF NOT EXISTS "STRUCTURED_SPATIAL" JSONB DEFAULT NULL,
ADD COLUMN IF NOT EXISTS "STRUCTURED_CONTENT" JSONB DEFAULT NULL,
ADD COLUMN IF NOT EXISTS "STRUCTURED_KNOWLEDGE_GRAPH" JSONB DEFAULT NULL,
ADD COLUMN IF NOT EXISTS "STRUCTURED_PROVENANCE" JSONB DEFAULT NULL,
ADD COLUMN IF NOT EXISTS "STRUCTURED_DISCOVERY" JSONB DEFAULT NULL,
ADD COLUMN IF NOT EXISTS "CLASSIFICATION_LLM" TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS "CLASSIFICATION_DATE" TIMESTAMPTZ DEFAULT NULL,
ADD COLUMN IF NOT EXISTS "CLASSIFICATION_VERSION" TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS "CLASSIFICATION_CONFIDENCE" NUMERIC(4,3) DEFAULT NULL;

-- ============================================
-- STRUCTURED CLUSTER VALUE SCHEMA
-- ============================================

-- STRUCTURED_TEMPORAL schema:
-- {
--   "era": "1920s",
--   "historicalPeriod": ["Roaring Twenties", "Jazz Age"],
--   "documentAge": "Historic",
--   "derivedFromFields": ["OCR_DERIVED_TIMESTAMP", "NLP_DERIVED_TIMESTAMP"],
--   "confidence": 0.85
-- }

-- STRUCTURED_SPATIAL schema:
-- {
--   "zone": "Urban Core",
--   "geographicScale": "Local",
--   "placeType": "Commercial",
--   "derivedFromFields": ["LOCAL_GIS_ZONE", "OCR_DERIVED_GIS_ZONE"],
--   "confidence": 0.92
-- }

-- STRUCTURED_CONTENT schema:
-- {
--   "category": "Commercial Document",
--   "scanType": "DOCUMENT",
--   "mediaType": "Receipt",
--   "subjectMatter": "Commerce",
--   "derivedFromFields": ["NLP_NODE_CATEGORIZATION", "SCAN_TYPE"],
--   "confidence": 0.78
-- }

-- STRUCTURED_KNOWLEDGE_GRAPH schema:
-- {
--   "nodeType": "DOCUMENT",
--   "connectionDensity": "Hub",
--   "narrativeRole": "Evidence",
--   "graphNodeCount": 15,
--   "graphEdgeCount": 28,
--   "derivedFromFields": ["NODE_COUNT", "ENTITIES_EXTRACTED"],
--   "confidence": 0.88
-- }

-- STRUCTURED_PROVENANCE schema:
-- {
--   "license": "CC0",
--   "confidence": 0.91,
--   "verificationLevel": "Community",
--   "contested": false,
--   "derivedFromFields": ["DATA_LICENSE", "CONFIDENCE_SCORE", "ACCESS_RESTRICTIONS"],
--   "confidence": 0.95
-- }

-- STRUCTURED_DISCOVERY schema:
-- {
--   "source": "Geograph Corpus",
--   "status": "MINTED",
--   "entityTypes": ["PERSON", "LOCATION", "DATE"],
--   "serendipityScore": "high",
--   "researchPotential": "medium",
--   "derivedFromFields": ["SOURCE_COLLECTION", "PROCESSING_STATUS", "ENTITIES_EXTRACTED"],
--   "confidence": 0.82
-- }

-- ============================================
-- CLASSIFICATION MAPPING TABLE
-- ============================================
-- Stores learned correlations between unstructured values and structured classifications
-- Enables similarity-based proxy classification for new data

CREATE TABLE IF NOT EXISTS structured_classification_mappings (
    "ID" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Cluster identification
    "CLUSTER_TYPE" TEXT NOT NULL CHECK ("CLUSTER_TYPE" IN (
        'TEMPORAL', 'SPATIAL', 'CONTENT', 
        'KNOWLEDGE_GRAPH', 'PROVENANCE', 'DISCOVERY'
    )),
    "DIMENSION_NAME" TEXT NOT NULL,
    
    -- Raw/unstructured input value (what we observed)
    "RAW_VALUE" TEXT NOT NULL,
    "RAW_VALUE_NORMALIZED" TEXT NOT NULL, -- Lowercase, trimmed for matching
    
    -- Structured classification (what we assigned)
    "STRUCTURED_VALUE" TEXT NOT NULL,
    
    -- Relationship metadata
    "MAPPING_TYPE" TEXT CHECK ("MAPPING_TYPE" IN (
        'EXACT',      -- Direct 1:1 mapping
        'SYNONYM',    -- Semantic equivalence
        'PARENT',     -- Hierarchical (structured is broader)
        'CHILD',      -- Hierarchical (structured is narrower)
        'RELATED',    -- Associative relationship
        'LEARNED'     -- ML/LLM derived correlation
    )) DEFAULT 'LEARNED',
    
    -- Confidence and provenance
    "CONFIDENCE" NUMERIC(4,3) NOT NULL,
    "OCCURRENCE_COUNT" INTEGER DEFAULT 1,
    "FIRST_OBSERVED" TIMESTAMPTZ DEFAULT NOW(),
    "LAST_OBSERVED" TIMESTAMPTZ DEFAULT NOW(),
    
    -- LLM that created this mapping
    "CREATED_BY_LLM" TEXT NOT NULL,
    "CREATED_AT" TIMESTAMPTZ DEFAULT NOW(),
    
    -- For learning improvements
    "IS_VALIDATED" BOOLEAN DEFAULT FALSE,
    "VALIDATED_BY" UUID REFERENCES auth.users(id),
    "VALIDATED_AT" TIMESTAMPTZ,
    
    UNIQUE("CLUSTER_TYPE", "DIMENSION_NAME", "RAW_VALUE_NORMALIZED", "STRUCTURED_VALUE")
);

-- ============================================
-- CLASSIFICATION AUDIT LOG
-- ============================================
-- Tracks all classification operations for provenance and rollback

CREATE TABLE IF NOT EXISTS classification_audit_log (
    "ID" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- What was classified
    "ASSET_ID" TEXT REFERENCES historical_documents_global("ASSET_ID"),
    "CLUSTER_TYPE" TEXT NOT NULL,
    
    -- Classification details
    "PREVIOUS_VALUE" JSONB,
    "NEW_VALUE" JSONB,
    "CHANGE_TYPE" TEXT CHECK ("CHANGE_TYPE" IN ('CREATE', 'UPDATE', 'DELETE', 'BULK_SYNC')),
    
    -- Operation context
    "LLM_USED" TEXT NOT NULL,
    "PROMPT_HASH" TEXT, -- Hash of prompt used for reproducibility
    "BATCH_ID" UUID, -- For bulk operations
    
    -- Metadata
    "CREATED_BY" UUID REFERENCES auth.users(id),
    "CREATED_AT" TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- CORPUS STATISTICS TABLE
-- ============================================
-- Tracks dimension value distributions for similarity matching and improvements

CREATE TABLE IF NOT EXISTS cluster_dimension_statistics (
    "ID" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    "CLUSTER_TYPE" TEXT NOT NULL,
    "DIMENSION_NAME" TEXT NOT NULL,
    "STRUCTURED_VALUE" TEXT NOT NULL,
    
    -- Usage statistics
    "OCCURRENCE_COUNT" INTEGER DEFAULT 0,
    "PERCENTAGE_OF_CORPUS" NUMERIC(5,2) DEFAULT 0,
    
    -- Co-occurrence patterns (for correlation learning)
    "CO_OCCURS_WITH" JSONB DEFAULT '{}', -- {dimension: {value: count}}
    
    -- Temporal trends
    "FIRST_USED" TIMESTAMPTZ DEFAULT NOW(),
    "LAST_USED" TIMESTAMPTZ DEFAULT NOW(),
    "USAGE_TREND" TEXT CHECK ("USAGE_TREND" IN ('INCREASING', 'STABLE', 'DECREASING')),
    
    "UPDATED_AT" TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE("CLUSTER_TYPE", "DIMENSION_NAME", "STRUCTURED_VALUE")
);

-- ============================================
-- INDEXES FOR PERFORMANCE
-- ============================================

CREATE INDEX IF NOT EXISTS idx_structured_temporal 
ON historical_documents_global USING GIN ("STRUCTURED_TEMPORAL");

CREATE INDEX IF NOT EXISTS idx_structured_spatial 
ON historical_documents_global USING GIN ("STRUCTURED_SPATIAL");

CREATE INDEX IF NOT EXISTS idx_structured_content 
ON historical_documents_global USING GIN ("STRUCTURED_CONTENT");

CREATE INDEX IF NOT EXISTS idx_structured_knowledge_graph 
ON historical_documents_global USING GIN ("STRUCTURED_KNOWLEDGE_GRAPH");

CREATE INDEX IF NOT EXISTS idx_structured_provenance 
ON historical_documents_global USING GIN ("STRUCTURED_PROVENANCE");

CREATE INDEX IF NOT EXISTS idx_structured_discovery 
ON historical_documents_global USING GIN ("STRUCTURED_DISCOVERY");

CREATE INDEX IF NOT EXISTS idx_classification_llm 
ON historical_documents_global ("CLASSIFICATION_LLM");

CREATE INDEX IF NOT EXISTS idx_classification_date 
ON historical_documents_global ("CLASSIFICATION_DATE");

CREATE INDEX IF NOT EXISTS idx_mapping_cluster_dim 
ON structured_classification_mappings ("CLUSTER_TYPE", "DIMENSION_NAME");

CREATE INDEX IF NOT EXISTS idx_mapping_raw_value 
ON structured_classification_mappings ("RAW_VALUE_NORMALIZED");

CREATE INDEX IF NOT EXISTS idx_mapping_structured_value 
ON structured_classification_mappings ("STRUCTURED_VALUE");

CREATE INDEX IF NOT EXISTS idx_audit_asset 
ON classification_audit_log ("ASSET_ID");

CREATE INDEX IF NOT EXISTS idx_audit_batch 
ON classification_audit_log ("BATCH_ID");

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Function to find similar structured values for unstructured input
CREATE OR REPLACE FUNCTION find_structured_mapping(
    p_cluster_type TEXT,
    p_dimension_name TEXT,
    p_raw_value TEXT,
    p_min_confidence NUMERIC DEFAULT 0.6
)
RETURNS TABLE(
    structured_value TEXT,
    confidence NUMERIC,
    mapping_type TEXT,
    occurrence_count INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        m."STRUCTURED_VALUE",
        m."CONFIDENCE",
        m."MAPPING_TYPE",
        m."OCCURRENCE_COUNT"
    FROM structured_classification_mappings m
    WHERE m."CLUSTER_TYPE" = p_cluster_type
      AND m."DIMENSION_NAME" = p_dimension_name
      AND m."RAW_VALUE_NORMALIZED" = LOWER(TRIM(p_raw_value))
      AND m."CONFIDENCE" >= p_min_confidence
    ORDER BY m."CONFIDENCE" DESC, m."OCCURRENCE_COUNT" DESC
    LIMIT 5;
END;
$$ LANGUAGE plpgsql;

-- Function to get corpus statistics for a dimension
CREATE OR REPLACE FUNCTION get_dimension_distribution(
    p_cluster_type TEXT,
    p_dimension_name TEXT
)
RETURNS TABLE(
    structured_value TEXT,
    occurrence_count INTEGER,
    percentage NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        s."STRUCTURED_VALUE",
        s."OCCURRENCE_COUNT",
        s."PERCENTAGE_OF_CORPUS"
    FROM cluster_dimension_statistics s
    WHERE s."CLUSTER_TYPE" = p_cluster_type
      AND s."DIMENSION_NAME" = p_dimension_name
    ORDER BY s."OCCURRENCE_COUNT" DESC;
END;
$$ LANGUAGE plpgsql;

-- Function to record a new classification mapping
CREATE OR REPLACE FUNCTION upsert_classification_mapping(
    p_cluster_type TEXT,
    p_dimension_name TEXT,
    p_raw_value TEXT,
    p_structured_value TEXT,
    p_confidence NUMERIC,
    p_mapping_type TEXT,
    p_llm_name TEXT
)
RETURNS UUID AS $$
DECLARE
    v_mapping_id UUID;
    v_normalized TEXT := LOWER(TRIM(p_raw_value));
BEGIN
    INSERT INTO structured_classification_mappings (
        "CLUSTER_TYPE", "DIMENSION_NAME", "RAW_VALUE", "RAW_VALUE_NORMALIZED",
        "STRUCTURED_VALUE", "MAPPING_TYPE", "CONFIDENCE", "CREATED_BY_LLM"
    )
    VALUES (
        p_cluster_type, p_dimension_name, p_raw_value, v_normalized,
        p_structured_value, p_mapping_type, p_confidence, p_llm_name
    )
    ON CONFLICT ("CLUSTER_TYPE", "DIMENSION_NAME", "RAW_VALUE_NORMALIZED", "STRUCTURED_VALUE")
    DO UPDATE SET
        "OCCURRENCE_COUNT" = structured_classification_mappings."OCCURRENCE_COUNT" + 1,
        "LAST_OBSERVED" = NOW(),
        "CONFIDENCE" = GREATEST(structured_classification_mappings."CONFIDENCE", EXCLUDED."CONFIDENCE")
    RETURNING "ID" INTO v_mapping_id;
    
    RETURN v_mapping_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- RLS POLICIES
-- ============================================

ALTER TABLE structured_classification_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE classification_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE cluster_dimension_statistics ENABLE ROW LEVEL SECURITY;

-- Anyone can read mappings (public knowledge base)
CREATE POLICY "Public read access to classification mappings"
ON structured_classification_mappings FOR SELECT
USING (true);

-- Only authenticated users can create mappings
CREATE POLICY "Authenticated users can create mappings"
ON structured_classification_mappings FOR INSERT
TO authenticated
WITH CHECK (true);

-- Only validated users or original creators can update
CREATE POLICY "Update own or validated mappings"
ON structured_classification_mappings FOR UPDATE
TO authenticated
USING (true);

-- Public read for statistics
CREATE POLICY "Public read access to dimension statistics"
ON cluster_dimension_statistics FOR SELECT
USING (true);

-- Audit log readable by authenticated users
CREATE POLICY "Authenticated users can read audit log"
ON classification_audit_log FOR SELECT
TO authenticated
USING (true);

-- ============================================
-- COMMENTS FOR DOCUMENTATION
-- ============================================

COMMENT ON COLUMN historical_documents_global."STRUCTURED_TEMPORAL" IS 
'LLM-synchronized temporal classification: era, historicalPeriod, documentAge';

COMMENT ON COLUMN historical_documents_global."STRUCTURED_SPATIAL" IS 
'LLM-synchronized spatial classification: zone, geographicScale, placeType';

COMMENT ON COLUMN historical_documents_global."STRUCTURED_CONTENT" IS 
'LLM-synchronized content classification: category, scanType, mediaType, subjectMatter';

COMMENT ON COLUMN historical_documents_global."STRUCTURED_KNOWLEDGE_GRAPH" IS 
'LLM-synchronized graph classification: nodeType, connectionDensity, narrativeRole';

COMMENT ON COLUMN historical_documents_global."STRUCTURED_PROVENANCE" IS 
'LLM-synchronized provenance classification: license, confidence, verificationLevel, contested';

COMMENT ON COLUMN historical_documents_global."STRUCTURED_DISCOVERY" IS 
'LLM-synchronized discovery classification: source, status, entityTypes, serendipityScore, researchPotential';

COMMENT ON COLUMN historical_documents_global."CLASSIFICATION_LLM" IS 
'Name of the LLM provider that performed the structured classification';

COMMENT ON COLUMN historical_documents_global."CLASSIFICATION_DATE" IS 
'Timestamp when the structured classification was performed';

COMMENT ON COLUMN historical_documents_global."CLASSIFICATION_VERSION" IS 
'Version of the classification schema used (e.g., "v1.0", "v2.0")';

COMMENT ON TABLE structured_classification_mappings IS 
'Learned correlations between raw/unstructured values and structured classifications. Enables proxy classification through similarity matching.';

COMMENT ON TABLE classification_audit_log IS 
'Audit trail for all classification operations. Enables provenance tracking and rollback.';

COMMENT ON TABLE cluster_dimension_statistics IS 
'Corpus-wide statistics for structured dimension values. Supports co-occurrence analysis and trend detection.';
