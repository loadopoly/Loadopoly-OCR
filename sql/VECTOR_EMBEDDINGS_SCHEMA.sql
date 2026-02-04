-- ============================================
-- Vector Embeddings Schema for Deduplication
-- ============================================
-- Requires pgvector extension in Supabase
-- Enables O(n log n) similarity search vs O(n²)
-- 
-- Usage:
-- 1. Enable pgvector: CREATE EXTENSION vector;
-- 2. Run this schema
-- 3. Use deduplicationServiceV3 for vector-based dedup
-- ============================================

-- Enable pgvector extension (requires Supabase dashboard or superuser)
-- Note: Run this separately in Supabase SQL Editor with admin privileges
-- CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================
-- Document Embeddings Table
-- ============================================
-- Stores vector embeddings for each document for fast similarity search

CREATE TABLE IF NOT EXISTS document_embeddings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    asset_id UUID NOT NULL UNIQUE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- Text embeddings (768 dimensions for Gemini embeddings)
    title_embedding VECTOR(768),
    content_embedding VECTOR(768),
    entity_embedding VECTOR(768),
    
    -- Combined embedding for overall similarity
    combined_embedding VECTOR(768),
    
    -- Metadata for filtering
    document_title TEXT,
    source_collection TEXT,
    gis_zone TEXT,
    scan_type TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Hash for quick exact-match detection
    content_hash TEXT,
    
    -- Cluster assignment (for pre-computed clusters)
    cluster_id UUID,
    cluster_confidence FLOAT DEFAULT 0
);

-- ============================================
-- Indexes for Vector Similarity Search
-- ============================================

-- IVFFlat index for approximate nearest neighbor search
-- Lists = sqrt(n) for optimal performance, adjust based on table size
CREATE INDEX IF NOT EXISTS idx_embeddings_combined_ivfflat 
ON document_embeddings 
USING ivfflat (combined_embedding vector_cosine_ops)
WITH (lists = 100);

-- HNSW index (alternative, better for smaller datasets)
-- Uncomment if preferred over IVFFlat
-- CREATE INDEX IF NOT EXISTS idx_embeddings_combined_hnsw 
-- ON document_embeddings 
-- USING hnsw (combined_embedding vector_cosine_ops)
-- WITH (m = 16, ef_construction = 64);

-- Standard indexes for filtering
CREATE INDEX IF NOT EXISTS idx_embeddings_user_id ON document_embeddings(user_id);
CREATE INDEX IF NOT EXISTS idx_embeddings_asset_id ON document_embeddings(asset_id);
CREATE INDEX IF NOT EXISTS idx_embeddings_cluster_id ON document_embeddings(cluster_id);
CREATE INDEX IF NOT EXISTS idx_embeddings_content_hash ON document_embeddings(content_hash);
CREATE INDEX IF NOT EXISTS idx_embeddings_source_collection ON document_embeddings(source_collection);

-- ============================================
-- Duplicate Clusters Table
-- ============================================
-- Pre-computed similarity clusters for efficient dedup

CREATE TABLE IF NOT EXISTS duplicate_clusters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- Cluster metadata
    primary_asset_id UUID NOT NULL,
    duplicate_asset_ids UUID[] DEFAULT '{}',
    member_count INT DEFAULT 1,
    
    -- Similarity scores
    avg_similarity FLOAT DEFAULT 0,
    min_similarity FLOAT DEFAULT 0,
    max_similarity FLOAT DEFAULT 1,
    
    -- Consolidated metadata from cluster
    consolidated_title TEXT,
    consolidated_entities TEXT[],
    consolidated_keywords TEXT[],
    
    -- Status tracking
    status TEXT DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'REVIEWED', 'MERGED', 'SPLIT', 'DISMISSED')),
    reviewed_by UUID,
    reviewed_at TIMESTAMPTZ,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_clusters_user_id ON duplicate_clusters(user_id);
CREATE INDEX IF NOT EXISTS idx_clusters_status ON duplicate_clusters(status);
CREATE INDEX IF NOT EXISTS idx_clusters_primary_asset ON duplicate_clusters(primary_asset_id);

-- ============================================
-- Functions for Vector Operations
-- ============================================

-- Find similar documents using vector similarity
CREATE OR REPLACE FUNCTION find_similar_documents(
    p_embedding VECTOR(768),
    p_user_id UUID DEFAULT NULL,
    p_threshold FLOAT DEFAULT 0.7,
    p_limit INT DEFAULT 10,
    p_exclude_asset_id UUID DEFAULT NULL
)
RETURNS TABLE (
    asset_id UUID,
    document_title TEXT,
    similarity FLOAT,
    source_collection TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        de.asset_id,
        de.document_title,
        1 - (de.combined_embedding <=> p_embedding) AS similarity,
        de.source_collection
    FROM document_embeddings de
    WHERE 
        (p_user_id IS NULL OR de.user_id = p_user_id)
        AND (p_exclude_asset_id IS NULL OR de.asset_id != p_exclude_asset_id)
        AND 1 - (de.combined_embedding <=> p_embedding) >= p_threshold
    ORDER BY de.combined_embedding <=> p_embedding
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- Batch find duplicates within a user's corpus
CREATE OR REPLACE FUNCTION find_duplicate_candidates(
    p_user_id UUID,
    p_threshold FLOAT DEFAULT 0.75,
    p_limit INT DEFAULT 100
)
RETURNS TABLE (
    asset_a UUID,
    asset_b UUID,
    similarity FLOAT,
    title_a TEXT,
    title_b TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        de1.asset_id AS asset_a,
        de2.asset_id AS asset_b,
        1 - (de1.combined_embedding <=> de2.combined_embedding) AS similarity,
        de1.document_title AS title_a,
        de2.document_title AS title_b
    FROM document_embeddings de1
    CROSS JOIN LATERAL (
        SELECT de2.*
        FROM document_embeddings de2
        WHERE de2.user_id = p_user_id
          AND de2.asset_id > de1.asset_id  -- Avoid duplicates (a,b) and (b,a)
          AND 1 - (de1.combined_embedding <=> de2.combined_embedding) >= p_threshold
        ORDER BY de1.combined_embedding <=> de2.combined_embedding
        LIMIT 5  -- Top 5 matches per document
    ) de2
    WHERE de1.user_id = p_user_id
    ORDER BY similarity DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- Upsert embedding for a document
CREATE OR REPLACE FUNCTION upsert_document_embedding(
    p_asset_id UUID,
    p_user_id UUID,
    p_title_embedding VECTOR(768),
    p_content_embedding VECTOR(768),
    p_combined_embedding VECTOR(768),
    p_document_title TEXT,
    p_source_collection TEXT DEFAULT NULL,
    p_gis_zone TEXT DEFAULT NULL,
    p_scan_type TEXT DEFAULT NULL,
    p_content_hash TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    v_id UUID;
BEGIN
    INSERT INTO document_embeddings (
        asset_id, user_id, 
        title_embedding, content_embedding, combined_embedding,
        document_title, source_collection, gis_zone, scan_type, content_hash
    )
    VALUES (
        p_asset_id, p_user_id,
        p_title_embedding, p_content_embedding, p_combined_embedding,
        p_document_title, p_source_collection, p_gis_zone, p_scan_type, p_content_hash
    )
    ON CONFLICT (asset_id) DO UPDATE SET
        title_embedding = EXCLUDED.title_embedding,
        content_embedding = EXCLUDED.content_embedding,
        combined_embedding = EXCLUDED.combined_embedding,
        document_title = EXCLUDED.document_title,
        source_collection = EXCLUDED.source_collection,
        gis_zone = EXCLUDED.gis_zone,
        scan_type = EXCLUDED.scan_type,
        content_hash = EXCLUDED.content_hash
    RETURNING id INTO v_id;
    
    RETURN v_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- Row Level Security
-- ============================================

ALTER TABLE document_embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE duplicate_clusters ENABLE ROW LEVEL SECURITY;

-- Users can only see their own embeddings
CREATE POLICY "Users can view own embeddings" ON document_embeddings
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own embeddings" ON document_embeddings
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own embeddings" ON document_embeddings
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own embeddings" ON document_embeddings
    FOR DELETE USING (auth.uid() = user_id);

-- Users can only see their own clusters
CREATE POLICY "Users can view own clusters" ON duplicate_clusters
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own clusters" ON duplicate_clusters
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own clusters" ON duplicate_clusters
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own clusters" ON duplicate_clusters
    FOR DELETE USING (auth.uid() = user_id);

-- ============================================
-- Migration: Add embedding column to historical_documents_global
-- ============================================
-- Run this if you want embeddings stored directly on the main table

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT FROM information_schema.columns 
        WHERE table_name = 'historical_documents_global' 
        AND column_name = 'content_embedding'
    ) THEN
        ALTER TABLE historical_documents_global 
        ADD COLUMN content_embedding VECTOR(768);
        
        CREATE INDEX IF NOT EXISTS idx_hdg_embedding_ivfflat 
        ON historical_documents_global 
        USING ivfflat (content_embedding vector_cosine_ops)
        WITH (lists = 100);
    END IF;
END $$;

-- ============================================
-- Comments
-- ============================================

COMMENT ON TABLE document_embeddings IS 'Vector embeddings for document similarity search using pgvector';
COMMENT ON TABLE duplicate_clusters IS 'Pre-computed duplicate clusters for efficient deduplication workflow';
COMMENT ON FUNCTION find_similar_documents IS 'Find documents similar to a given embedding vector';
COMMENT ON FUNCTION find_duplicate_candidates IS 'Batch find potential duplicate pairs within a user corpus';
COMMENT ON FUNCTION upsert_document_embedding IS 'Insert or update document embedding';
