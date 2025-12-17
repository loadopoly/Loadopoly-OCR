# Supabase Database Setup

This directory contains the database migrations for GeoGraph Node's Supabase backend.

## Quick Start

### 1. Create Supabase Project
1. Go to [supabase.com](https://supabase.com) and create a new project
2. Note your **Project URL** and **Anon Key** from Settings → API

### 2. Run Migrations

Execute these SQL scripts **in order** via the Supabase Dashboard SQL Editor (Dashboard > SQL Editor > New Query).

#### Script 1: Initial Schema (Core Tables)

```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS public.historical_documents_global (
    "ASSET_ID" TEXT PRIMARY KEY,
    "LOCAL_TIMESTAMP" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "OCR_DERIVED_TIMESTAMP" TEXT,
    "NLP_DERIVED_TIMESTAMP" TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "LOCAL_GIS_ZONE" TEXT,
    "OCR_DERIVED_GIS_ZONE" TEXT,
    "NLP_DERIVED_GIS_ZONE" TEXT,
    "NODE_COUNT" INTEGER DEFAULT 0,
    "NLP_NODE_CATEGORIZATION" TEXT,
    "RAW_OCR_TRANSCRIPTION" TEXT,
    "PREPROCESS_OCR_TRANSCRIPTION" TEXT,
    "SOURCE_COLLECTION" TEXT,
    "DOCUMENT_TITLE" TEXT,
    "DOCUMENT_DESCRIPTION" TEXT,
    "FILE_FORMAT" TEXT,
    "FILE_SIZE_BYTES" BIGINT DEFAULT 0,
    "RESOLUTION_DPI" INTEGER DEFAULT 72,
    "COLOR_MODE" TEXT DEFAULT 'RGB',
    "CREATOR_AGENT" TEXT,
    "RIGHTS_STATEMENT" TEXT,
    "LANGUAGE_CODE" TEXT DEFAULT 'en-US',
    "FIXITY_CHECKSUM" TEXT,
    "INGEST_DATE" TIMESTAMPTZ DEFAULT NOW(),
    "LAST_MODIFIED" TIMESTAMPTZ DEFAULT NOW(),
    "PROCESSING_STATUS" TEXT DEFAULT 'PENDING',
    "CONFIDENCE_SCORE" DECIMAL(3,2) DEFAULT 0.00,
    "ENTITIES_EXTRACTED" JSONB DEFAULT '[]'::jsonb,
    "RELATED_ASSETS" JSONB DEFAULT '[]'::jsonb,
    "PRESERVATION_EVENTS" JSONB DEFAULT '[]'::jsonb,
    "KEYWORDS_TAGS" JSONB DEFAULT '[]'::jsonb,
    "ACCESS_RESTRICTIONS" BOOLEAN DEFAULT FALSE,
    scan_type TEXT DEFAULT 'DOCUMENT',
    "TAXONOMY" JSONB,
    "ITEM_ATTRIBUTES" JSONB,
    "SCENERY_ATTRIBUTES" JSONB,
    alt_text_short TEXT,
    alt_text_long TEXT,
    reading_order JSONB,
    accessibility_score DECIMAL(3,2),
    "CONTRIBUTOR_ID" TEXT,
    "CONTRIBUTED_AT" TIMESTAMPTZ,
    "DATA_LICENSE" TEXT DEFAULT 'GEOGRAPH_CORPUS_1.0',
    "CONTRIBUTOR_NFT_MINTED" BOOLEAN DEFAULT FALSE,
    original_image_url TEXT,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_hdg_user_id ON public.historical_documents_global(user_id);
CREATE INDEX IF NOT EXISTS idx_hdg_contributor ON public.historical_documents_global("CONTRIBUTOR_ID");
CREATE INDEX IF NOT EXISTS idx_hdg_category ON public.historical_documents_global("NLP_NODE_CATEGORIZATION");

ALTER TABLE public.historical_documents_global ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read access" ON public.historical_documents_global FOR SELECT USING (true);
CREATE POLICY "Authenticated insert" ON public.historical_documents_global FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Anonymous insert" ON public.historical_documents_global FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Owner update" ON public.historical_documents_global FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
```

#### Script 2: Web3 Infrastructure

```sql
CREATE TABLE IF NOT EXISTS public.nft_minting_records (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    asset_id TEXT NOT NULL,
    tx_hash TEXT NOT NULL UNIQUE,
    block_number BIGINT,
    chain_id INTEGER NOT NULL DEFAULT 137,
    contract_address TEXT NOT NULL,
    token_id TEXT NOT NULL,
    minter_address TEXT NOT NULL,
    contributor_id TEXT,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    shards_minted INTEGER NOT NULL DEFAULT 1000,
    status TEXT NOT NULL DEFAULT 'PENDING',
    minted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    confirmed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.shard_balances (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    wallet_address TEXT NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    asset_id TEXT NOT NULL,
    token_id TEXT NOT NULL,
    balance INTEGER NOT NULL DEFAULT 0,
    shards_required_for_redemption INTEGER DEFAULT 1000,
    last_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(wallet_address, asset_id)
);

CREATE TABLE IF NOT EXISTS public.bundle_purchases (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    buyer_address TEXT NOT NULL,
    buyer_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    bundle_id TEXT NOT NULL,
    bundle_title TEXT,
    total_assets INTEGER NOT NULL,
    new_assets INTEGER NOT NULL,
    duplicate_assets INTEGER NOT NULL DEFAULT 0,
    full_price_wei NUMERIC(78,0),
    actual_price_wei NUMERIC(78,0),
    discount_wei NUMERIC(78,0) DEFAULT 0,
    tx_hash TEXT,
    status TEXT NOT NULL DEFAULT 'PENDING',
    purchased_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    asset_ids JSONB NOT NULL DEFAULT '[]'::jsonb
);

ALTER TABLE public.nft_minting_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shard_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bundle_purchases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read minting records" ON public.nft_minting_records FOR SELECT USING (true);
CREATE POLICY "Public read shard balances" ON public.shard_balances FOR SELECT USING (true);
CREATE POLICY "Authenticated manage shard balances" ON public.shard_balances FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Users view own purchases" ON public.bundle_purchases FOR SELECT TO authenticated USING (buyer_user_id = auth.uid());
```

#### Script 3: Helper Functions

```sql
CREATE OR REPLACE FUNCTION public.get_corpus_stats()
RETURNS TABLE (
    total_assets BIGINT,
    total_nodes BIGINT,
    unique_contributors BIGINT,
    categories JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COUNT(*)::BIGINT,
        COALESCE(SUM("NODE_COUNT"), 0)::BIGINT,
        COUNT(DISTINCT "CONTRIBUTOR_ID")::BIGINT,
        (
            SELECT COALESCE(jsonb_agg(jsonb_build_object('category', cat, 'count', cnt)), '[]'::jsonb)
            FROM (
                SELECT "NLP_NODE_CATEGORIZATION" as cat, COUNT(*) as cnt
                FROM public.historical_documents_global
                WHERE "NLP_NODE_CATEGORIZATION" IS NOT NULL
                GROUP BY "NLP_NODE_CATEGORIZATION"
                ORDER BY cnt DESC
                LIMIT 10
            ) sub
        )
    FROM public.historical_documents_global;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_corpus_stats() TO anon, authenticated;
```

### 3. Create Storage Bucket

**Manual step required** (cannot be done via SQL easily):

1. Go to **Storage** in Supabase Dashboard
2. Click **New bucket**
3. Name: `corpus-images`
4. Toggle **Public bucket** ON
5. Set file size limit: `50MB`
6. Allowed MIME types: `image/*`

### 4. Configure Auth

In **Authentication → URL Configuration**:

| Setting | Value |
|---------|-------|
| Site URL | `https://your-app.vercel.app` |
| Redirect URLs | `http://localhost:3000/**`, `https://your-app.vercel.app/**` |

### 5. Set Environment Variables

In your Vercel project (or `.env` locally):

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...your-anon-key
```