-- ============================================
-- VECTOR EMBEDDINGS SCHEMA
-- ============================================
-- pgvector-based semantic search for deduplication
-- Enables O(n log n) similarity search vs O(n²) pairwise comparison
-- 
-- Prerequisites:
-- 1. Enable pgvector extension in Supabase dashboard
-- 2. Run: CREATE EXTENSION IF NOT EXISTS vector;
--
-- Version: 1.0.0
-- ============================================

-- ============================================
-- Enable pgvector Extension
-- ============================================

CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================
-- Add Embedding Columns to Main Table
-- ============================================

-- Text embedding (768 dimensions for Gemini/BERT-style embeddings)
-- Can also use 1536 for OpenAI ada-002 or 384 for all-MiniLM-L6-v2
ALTER TABLE historical_documents_global
ADD COLUMN IF NOT EXISTS TEXT_EMBEDDING vector(768);

-- Image embedding (for visual similarity)
ALTER TABLE historical_documents_global
ADD COLUMN IF NOT EXISTS IMAGE_EMBEDDING vector(512);

-- Combined embedding (weighted fusion)
ALTER TABLE historical_documents_global
ADD COLUMN IF NOT EXISTS COMBINED_EMBEDDING vector(768);

-- Embedding metadata
ALTER TABLE historical_documents_global
ADD COLUMN IF NOT EXISTS EMBEDDING_MODEL TEXT DEFAULT 'gemini-embedding-001';

ALTER TABLE historical_documents_global
ADD COLUMN IF NOT EXISTS EMBEDDING_UPDATED_AT TIMESTAMPTZ;

-- ============================================
-- Vector Indexes
-- ============================================

-- IVFFlat index for text embeddings (good for >10k vectors)
-- Lists parameter: sqrt(row_count) is a good starting point
CREATE INDEX IF NOT EXISTS idx_text_embedding_ivf
ON historical_documents_global 
USING ivfflat (TEXT_EMBEDDING vector_cosine_ops)
WITH (lists = 100);

-- IVFFlat index for image embeddings
CREATE INDEX IF NOT EXISTS idx_image_embedding_ivf
ON historical_documents_global 
USING ivfflat (IMAGE_EMBEDDING vector_cosine_ops)
WITH (lists = 100);

-- HNSW index for combined embeddings (better recall, slower build)
-- Only use for smaller datasets or if accuracy is critical
-- CREATE INDEX IF NOT EXISTS idx_combined_embedding_hnsw
-- ON historical_documents_global 
-- USING hnsw (COMBINED_EMBEDDING vector_cosine_ops)
-- WITH (m = 16, ef_construction = 64);

-- ============================================
-- Similarity Search Functions
-- ============================================

-- Find similar documents by text embedding
CREATE OR REPLACE FUNCTION find_similar_by_text(
    p_embedding vector(768),
    p_threshold FLOAT DEFAULT 0.8,
    p_limit INTEGER DEFAULT 10,
    p_exclude_id TEXT DEFAULT NULL
)
RETURNS TABLE (
    asset_id TEXT,
    document_title TEXT,
    similarity FLOAT
) AS $$
BEGIN
    -- Set ivfflat.probes for better recall (default is 1)
    SET LOCAL ivfflat.probes = 10;
    
    RETURN QUERY
    SELECT 
        h.ASSET_ID,
        h.DOCUMENT_TITLE,
        1 - (h.TEXT_EMBEDDING <=> p_embedding) as similarity
    FROM historical_documents_global h
    WHERE 
        h.TEXT_EMBEDDING IS NOT NULL
        AND (p_exclude_id IS NULL OR h.ASSET_ID != p_exclude_id)
        AND 1 - (h.TEXT_EMBEDDING <=> p_embedding) >= p_threshold
    ORDER BY h.TEXT_EMBEDDING <=> p_embedding
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- Find similar documents by image embedding
CREATE OR REPLACE FUNCTION find_similar_by_image(
    p_embedding vector(512),
    p_threshold FLOAT DEFAULT 0.85,
    p_limit INTEGER DEFAULT 10,
    p_exclude_id TEXT DEFAULT NULL
)
RETURNS TABLE (
    asset_id TEXT,
    document_title TEXT,
    image_url TEXT,
    similarity FLOAT
) AS $$
BEGIN
    SET LOCAL ivfflat.probes = 10;
    
    RETURN QUERY
    SELECT 
        h.ASSET_ID,
        h.DOCUMENT_TITLE,
        h.ORIGINAL_IMAGE_URL,
        1 - (h.IMAGE_EMBEDDING <=> p_embedding) as similarity
    FROM historical_documents_global h
    WHERE 
        h.IMAGE_EMBEDDING IS NOT NULL
        AND (p_exclude_id IS NULL OR h.ASSET_ID != p_exclude_id)
        AND 1 - (h.IMAGE_EMBEDDING <=> p_embedding) >= p_threshold
    ORDER BY h.IMAGE_EMBEDDING <=> p_embedding
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- Find potential duplicates for a new asset
CREATE OR REPLACE FUNCTION find_duplicates(
    p_text_embedding vector(768) DEFAULT NULL,
    p_image_embedding vector(512) DEFAULT NULL,
    p_text_threshold FLOAT DEFAULT 0.85,
    p_image_threshold FLOAT DEFAULT 0.9,
    p_limit INTEGER DEFAULT 5
)
RETURNS TABLE (
    asset_id TEXT,
    document_title TEXT,
    text_similarity FLOAT,
    image_similarity FLOAT,
    combined_score FLOAT,
    is_likely_duplicate BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    WITH text_matches AS (
        SELECT 
            h.ASSET_ID,
            h.DOCUMENT_TITLE,
            CASE WHEN p_text_embedding IS NOT NULL AND h.TEXT_EMBEDDING IS NOT NULL
                 THEN 1 - (h.TEXT_EMBEDDING <=> p_text_embedding)
                 ELSE 0 
            END as text_sim
        FROM historical_documents_global h
        WHERE h.TEXT_EMBEDDING IS NOT NULL
    ),
    image_matches AS (
        SELECT 
            h.ASSET_ID,
            CASE WHEN p_image_embedding IS NOT NULL AND h.IMAGE_EMBEDDING IS NOT NULL
                 THEN 1 - (h.IMAGE_EMBEDDING <=> p_image_embedding)
                 ELSE 0 
            END as image_sim
        FROM historical_documents_global h
        WHERE h.IMAGE_EMBEDDING IS NOT NULL
    )
    SELECT 
        t.ASSET_ID,
        t.DOCUMENT_TITLE,
        t.text_sim as text_similarity,
        COALESCE(i.image_sim, 0) as image_similarity,
        -- Weighted combination (text weighted higher for documents)
        (t.text_sim * 0.6 + COALESCE(i.image_sim, 0) * 0.4) as combined_score,
        (t.text_sim >= p_text_threshold OR COALESCE(i.image_sim, 0) >= p_image_threshold) as is_likely_duplicate
    FROM text_matches t
    LEFT JOIN image_matches i ON t.ASSET_ID = i.ASSET_ID
    WHERE t.text_sim > 0.5 OR COALESCE(i.image_sim, 0) > 0.5
    ORDER BY (t.text_sim * 0.6 + COALESCE(i.image_sim, 0) * 0.4) DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- Batch Deduplication Functions
-- ============================================

-- Find all duplicate clusters in the database
CREATE OR REPLACE FUNCTION find_duplicate_clusters(
    p_threshold FLOAT DEFAULT 0.85,
    p_max_clusters INTEGER DEFAULT 100
)
RETURNS TABLE (
    cluster_id INTEGER,
    asset_ids TEXT[],
    document_titles TEXT[],
    cluster_size INTEGER,
    avg_similarity FLOAT
) AS $$
DECLARE
    v_cluster_id INTEGER := 0;
    v_processed TEXT[] := ARRAY[]::TEXT[];
    v_row RECORD;
BEGIN
    -- Create temp table for results
    CREATE TEMP TABLE IF NOT EXISTS temp_clusters (
        cluster_id INTEGER,
        asset_id TEXT,
        document_title TEXT,
        PRIMARY KEY (cluster_id, asset_id)
    ) ON COMMIT DROP;
    
    -- Process each asset
    FOR v_row IN 
        SELECT h.ASSET_ID, h.DOCUMENT_TITLE, h.TEXT_EMBEDDING
        FROM historical_documents_global h
        WHERE h.TEXT_EMBEDDING IS NOT NULL
        ORDER BY h.CREATED_AT
    LOOP
        -- Skip if already processed
        IF v_row.ASSET_ID = ANY(v_processed) THEN
            CONTINUE;
        END IF;
        
        -- Find similar assets
        IF EXISTS (
            SELECT 1 FROM historical_documents_global h
            WHERE h.ASSET_ID != v_row.ASSET_ID
            AND h.TEXT_EMBEDDING IS NOT NULL
            AND 1 - (h.TEXT_EMBEDDING <=> v_row.TEXT_EMBEDDING) >= p_threshold
            AND NOT (h.ASSET_ID = ANY(v_processed))
        ) THEN
            v_cluster_id := v_cluster_id + 1;
            
            -- Add original asset to cluster
            INSERT INTO temp_clusters VALUES (v_cluster_id, v_row.ASSET_ID, v_row.DOCUMENT_TITLE);
            v_processed := array_append(v_processed, v_row.ASSET_ID);
            
            -- Add similar assets to cluster
            INSERT INTO temp_clusters
            SELECT v_cluster_id, h.ASSET_ID, h.DOCUMENT_TITLE
            FROM historical_documents_global h
            WHERE h.ASSET_ID != v_row.ASSET_ID
            AND h.TEXT_EMBEDDING IS NOT NULL
            AND 1 - (h.TEXT_EMBEDDING <=> v_row.TEXT_EMBEDDING) >= p_threshold
            AND NOT (h.ASSET_ID = ANY(v_processed));
            
            -- Mark as processed
            SELECT array_agg(DISTINCT tc.asset_id) INTO v_processed
            FROM (
                SELECT unnest(v_processed) as asset_id
                UNION
                SELECT asset_id FROM temp_clusters WHERE cluster_id = v_cluster_id
            ) tc;
            
            -- Check limit
            IF v_cluster_id >= p_max_clusters THEN
                EXIT;
            END IF;
        END IF;
    END LOOP;
    
    -- Return aggregated results
    RETURN QUERY
    SELECT 
        tc.cluster_id,
        array_agg(tc.asset_id) as asset_ids,
        array_agg(tc.document_title) as document_titles,
        COUNT(*)::INTEGER as cluster_size,
        0.0::FLOAT as avg_similarity -- Simplified for performance
    FROM temp_clusters tc
    GROUP BY tc.cluster_id
    HAVING COUNT(*) > 1
    ORDER BY COUNT(*) DESC;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- Embedding Generation Helpers
-- ============================================

-- Queue assets for embedding generation
CREATE TABLE IF NOT EXISTS embedding_queue (
    ID UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ASSET_ID TEXT NOT NULL REFERENCES historical_documents_global(ASSET_ID),
    EMBEDDING_TYPE TEXT NOT NULL CHECK (EMBEDDING_TYPE IN ('text', 'image', 'both')),
    STATUS TEXT DEFAULT 'PENDING' CHECK (STATUS IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED')),
    PRIORITY INTEGER DEFAULT 5,
    CREATED_AT TIMESTAMPTZ DEFAULT NOW(),
    PROCESSED_AT TIMESTAMPTZ,
    ERROR_MESSAGE TEXT
);

CREATE INDEX IF NOT EXISTS idx_embedding_queue_status 
ON embedding_queue (STATUS, PRIORITY DESC, CREATED_AT)
WHERE STATUS = 'PENDING';

-- Function to queue missing embeddings
CREATE OR REPLACE FUNCTION queue_missing_embeddings(
    p_embedding_type TEXT DEFAULT 'text',
    p_limit INTEGER DEFAULT 1000
)
RETURNS INTEGER AS $$
DECLARE
    v_queued INTEGER;
BEGIN
    WITH to_queue AS (
        SELECT h.ASSET_ID
        FROM historical_documents_global h
        LEFT JOIN embedding_queue eq ON eq.ASSET_ID = h.ASSET_ID AND eq.EMBEDDING_TYPE = p_embedding_type
        WHERE 
            (p_embedding_type = 'text' AND h.TEXT_EMBEDDING IS NULL)
            OR (p_embedding_type = 'image' AND h.IMAGE_EMBEDDING IS NULL)
            OR (p_embedding_type = 'both' AND (h.TEXT_EMBEDDING IS NULL OR h.IMAGE_EMBEDDING IS NULL))
        AND eq.ID IS NULL
        LIMIT p_limit
    )
    INSERT INTO embedding_queue (ASSET_ID, EMBEDDING_TYPE, PRIORITY)
    SELECT ASSET_ID, p_embedding_type, 5
    FROM to_queue;
    
    GET DIAGNOSTICS v_queued = ROW_COUNT;
    RETURN v_queued;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- Statistics Views
-- ============================================

CREATE OR REPLACE VIEW embedding_coverage AS
SELECT 
    COUNT(*) as total_assets,
    COUNT(TEXT_EMBEDDING) as with_text_embedding,
    COUNT(IMAGE_EMBEDDING) as with_image_embedding,
    COUNT(COMBINED_EMBEDDING) as with_combined_embedding,
    ROUND(100.0 * COUNT(TEXT_EMBEDDING) / NULLIF(COUNT(*), 0), 2) as text_coverage_pct,
    ROUND(100.0 * COUNT(IMAGE_EMBEDDING) / NULLIF(COUNT(*), 0), 2) as image_coverage_pct
FROM historical_documents_global;

CREATE OR REPLACE VIEW embedding_queue_stats AS
SELECT 
    EMBEDDING_TYPE,
    STATUS,
    COUNT(*) as count,
    MIN(CREATED_AT) as oldest,
    MAX(CREATED_AT) as newest
FROM embedding_queue
GROUP BY EMBEDDING_TYPE, STATUS
ORDER BY EMBEDDING_TYPE, STATUS;

-- ============================================
-- Comments
-- ============================================

COMMENT ON COLUMN historical_documents_global.TEXT_EMBEDDING IS 'Vector embedding of OCR text for semantic similarity search';
COMMENT ON COLUMN historical_documents_global.IMAGE_EMBEDDING IS 'Vector embedding of image for visual similarity search';
COMMENT ON FUNCTION find_similar_by_text IS 'Find documents with similar text content using vector similarity';
COMMENT ON FUNCTION find_duplicates IS 'Find potential duplicate documents using combined text and image similarity';
COMMENT ON FUNCTION find_duplicate_clusters IS 'Cluster all documents by similarity for batch deduplication';
