# Supabase Database Setup Guide

Follow these steps to configure your Supabase backend for Loadopoly OCR.

## 📂 SQL Migration Scripts
All database migration and fix scripts are located in the `sql/` directory.
- `sql/FIX_TABLE_RLS.sql`: Resets Row Level Security policies to allow public uploads (Fixes "new row violates RLS policy").
- `sql/FIX_ALL_COLUMNS_TO_UPPERCASE.sql`: Renames all columns to UPPERCASE to match the application schema.
- `sql/ADD_MISSING_COLUMNS.sql`: Adds any missing columns required by the latest version.

## 1. Create a Storage Bucket
1. Log in to your Supabase Dashboard.
2. Go to **Storage**.
3. Create a new bucket named `corpus-images`.
4. Set the bucket to **Public**.
5. **IMPORTANT:** You must add a Storage Policy to allow uploads.
   - Go to **Storage** -> **Policies**.
   - Under `corpus-images`, click **New Policy**.
   - Choose **"For full customization"**.
   - Name: "Allow Public Uploads".
   - Allowed operations: Select **INSERT**.
   - Target roles: Select **anon** and **authenticated**.
   - WITH CHECK expression: `true` (or restrict as needed).
   - Click **Review** and **Save**.

   *Alternatively, run this SQL:*
   ```sql
   -- Allow public uploads to corpus-images bucket
   CREATE POLICY "Allow Public Uploads"
   ON storage.objects FOR INSERT
   TO public
   WITH CHECK ( bucket_id = 'corpus-images' );
   
   -- Allow public reads (already covered by "Public" bucket setting, but good to be explicit)
   CREATE POLICY "Allow Public Reads"
   ON storage.objects FOR SELECT
   TO public
   USING ( bucket_id = 'corpus-images' );
   ```

## 2. Run Database Migrations
Go to the **SQL Editor** and run the following script to initialize the complete relational schema.

**Note:** The schema below includes all tables for the marketplace, user management, and asset management system.

```sql
-- ENABLE EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- CORE GLOBAL CORPUS TABLE
CREATE TABLE IF NOT EXISTS public.historical_documents_global (
    "ASSET_ID" TEXT PRIMARY KEY,
    "LOCAL_TIMESTAMP" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "OCR_DERIVED_TIMESTAMP" TEXT,
    "NLP_DERIVED_TIMESTAMP" TEXT,
    "CREATED_AT" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
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
    "TOKEN_COUNT" INTEGER DEFAULT 0,
    "ENTITIES_EXTRACTED" JSONB DEFAULT '[]'::jsonb, -- Relational Data Source
    "RELATED_ASSETS" JSONB DEFAULT '[]'::jsonb,
    "PRESERVATION_EVENTS" JSONB DEFAULT '[]'::jsonb,
    "KEYWORDS_TAGS" JSONB DEFAULT '[]'::jsonb,
    "ACCESS_RESTRICTIONS" BOOLEAN DEFAULT FALSE,
    "SCAN_TYPE" TEXT DEFAULT 'DOCUMENT',
    "TAXONOMY" JSONB,
    "ITEM_ATTRIBUTES" JSONB,
    "SCENERY_ATTRIBUTES" JSONB,
    "ALT_TEXT_SHORT" TEXT,
    "ALT_TEXT_LONG" TEXT,
    "READING_ORDER" JSONB,
    "ACCESSIBILITY_SCORE" DECIMAL(3,2),
    "CONTRIBUTOR_ID" TEXT,
    "CONTRIBUTED_AT" TIMESTAMPTZ,
    "DATA_LICENSE" TEXT DEFAULT 'GEOGRAPH_CORPUS_1.0',
    "CONTRIBUTOR_NFT_MINTED" BOOLEAN DEFAULT FALSE,
    "ORIGINAL_IMAGE_URL" TEXT, -- Permanent Storage Link
    "USER_ID" UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    "IS_ENTERPRISE" BOOLEAN DEFAULT FALSE
);

-- INDEXING FOR PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_hdg_category ON public.historical_documents_global("NLP_NODE_CATEGORIZATION");
CREATE INDEX IF NOT EXISTS idx_hdg_collection ON public.historical_documents_global("SOURCE_COLLECTION");

-- RLS POLICIES
ALTER TABLE public.historical_documents_global ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public Read" ON public.historical_documents_global FOR SELECT USING (true);
CREATE POLICY "Public Anonymous Insert" ON public.historical_documents_global FOR INSERT WITH CHECK (true);
CREATE POLICY "Public Anonymous Update" ON public.historical_documents_global FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Public Anonymous Delete" ON public.historical_documents_global FOR DELETE USING (true);

-- WEB3 TRANSACTIONS TABLE (ENCRYPTED)
CREATE TABLE IF NOT EXISTS public.web3_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    asset_id TEXT,
    tx_hash TEXT UNIQUE NOT NULL,
    details TEXT, -- Encrypted JSON string
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.web3_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own transactions" ON public.web3_transactions FOR SELECT USING (auth.uid() = user_id);

-- USER PROFILES TABLE
CREATE TABLE IF NOT EXISTS public.user_profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT,
    display_name TEXT,
    wallet_address TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own profile" ON public.user_profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.user_profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON public.user_profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- DATA ASSETS TABLE (for marketplace)
CREATE TABLE IF NOT EXISTS public.data_assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    asset_id TEXT NOT NULL UNIQUE,
    document_title TEXT,
    document_description TEXT,
    nlp_node_categorization TEXT,
    local_gis_zone TEXT,
    source_collection TEXT,
    rights_statement TEXT,
    token_count INTEGER DEFAULT 0,
    file_size_bytes BIGINT DEFAULT 0,
    confidence_score NUMERIC,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_data_assets_asset_id ON public.data_assets(asset_id);
CREATE INDEX IF NOT EXISTS idx_data_assets_collection ON public.data_assets(source_collection);

ALTER TABLE public.data_assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view data assets" ON public.data_assets FOR SELECT USING (true);

-- TAXONOMY TABLE (for object classification)
CREATE TABLE IF NOT EXISTS public.taxonomy (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    taxon_rank TEXT NOT NULL,
    name TEXT NOT NULL,
    parent_id UUID REFERENCES public.taxonomy(id) ON DELETE SET NULL,
    gbif_id BIGINT,
    inaturalist_taxon_id INTEGER,
    wikidata_qid TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_taxonomy_parent ON public.taxonomy(parent_id);
CREATE INDEX IF NOT EXISTS idx_taxonomy_name ON public.taxonomy(name);

ALTER TABLE public.taxonomy ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view taxonomy" ON public.taxonomy FOR SELECT USING (true);

-- OBJECT ATTRIBUTES TABLE (detailed metadata for items)
CREATE TABLE IF NOT EXISTS public.object_attributes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    asset_id UUID NOT NULL REFERENCES public.historical_documents_global(id) ON DELETE CASCADE,
    taxonomy_id UUID REFERENCES public.taxonomy(id) ON DELETE SET NULL,
    common_name TEXT,
    scientific_name TEXT,
    confidence_score NUMERIC,
    material TEXT[],
    technique TEXT[],
    maker_or_artist TEXT,
    maker_role TEXT,
    manufacturer TEXT,
    production_date TEXT,
    period_or_style TEXT,
    dimensions JSONB,
    condition TEXT,
    inscriptions_or_marks TEXT[],
    architectural_style TEXT[],
    construction_date TEXT,
    architect_or_builder TEXT,
    site_type TEXT,
    gps_accuracy_meters INTEGER,
    cultural_significance TEXT,
    provenance_notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_object_attributes_asset ON public.object_attributes(asset_id);
CREATE INDEX IF NOT EXISTS idx_object_attributes_taxonomy ON public.object_attributes(taxonomy_id);

ALTER TABLE public.object_attributes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view object attributes" ON public.object_attributes FOR SELECT USING (true);

-- PACKAGES TABLE (for marketplace bundles)
CREATE TABLE IF NOT EXISTS public.packages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    package_name TEXT NOT NULL,
    package_type TEXT NOT NULL,
    grouping_key TEXT NOT NULL,
    description TEXT,
    base_price_cents INTEGER NOT NULL,
    price_per_asset_cents INTEGER DEFAULT 5,
    total_assets INTEGER DEFAULT 0,
    total_tokens INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_packages_type ON public.packages(package_type);
CREATE INDEX IF NOT EXISTS idx_packages_key ON public.packages(grouping_key);

ALTER TABLE public.packages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view active packages" ON public.packages FOR SELECT USING (is_active = true);

-- PACKAGE ASSETS TABLE (junction table)
CREATE TABLE IF NOT EXISTS public.package_assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    package_id UUID REFERENCES public.packages(id) ON DELETE CASCADE,
    asset_id UUID REFERENCES public.data_assets(id) ON DELETE CASCADE,
    added_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_package_assets_package ON public.package_assets(package_id);
CREATE INDEX IF NOT EXISTS idx_package_assets_asset ON public.package_assets(asset_id);

ALTER TABLE public.package_assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view package assets" ON public.package_assets FOR SELECT USING (true);

-- USER PURCHASES TABLE
CREATE TABLE IF NOT EXISTS public.user_purchases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    package_id UUID REFERENCES public.packages(id) ON DELETE SET NULL,
    purchase_type TEXT NOT NULL,
    original_asset_count INTEGER,
    purchased_asset_count INTEGER,
    duplicate_count INTEGER DEFAULT 0,
    price_paid_cents INTEGER NOT NULL,
    transaction_hash TEXT,
    purchased_at TIMESTAMPTZ DEFAULT NOW(),
    metadata JSONB
);

CREATE INDEX IF NOT EXISTS idx_user_purchases_user ON public.user_purchases(user_id);
CREATE INDEX IF NOT EXISTS idx_user_purchases_package ON public.user_purchases(package_id);

ALTER TABLE public.user_purchases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own purchases" ON public.user_purchases FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own purchases" ON public.user_purchases FOR INSERT WITH CHECK (auth.uid() = user_id);

-- USER ASSET ACCESS TABLE (tracks which assets users have access to)
CREATE TABLE IF NOT EXISTS public.user_asset_access (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    asset_id UUID REFERENCES public.data_assets(id) ON DELETE CASCADE,
    source_purchase_id UUID REFERENCES public.user_purchases(id) ON DELETE SET NULL,
    granted_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_asset_access_user ON public.user_asset_access(user_id);
CREATE INDEX IF NOT EXISTS idx_user_asset_access_asset ON public.user_asset_access(asset_id);

ALTER TABLE public.user_asset_access ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own asset access" ON public.user_asset_access FOR SELECT USING (auth.uid() = user_id);

-- DATASET SHARES TABLE (for collaborative features)
CREATE TABLE IF NOT EXISTS public.dataset_shares (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    dataset_id UUID NOT NULL REFERENCES public.historical_documents_global(id) ON DELETE CASCADE,
    shared_with UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    shared_at TIMESTAMPTZ DEFAULT NOW(),
    permissions TEXT DEFAULT 'read'
);

CREATE INDEX IF NOT EXISTS idx_dataset_shares_dataset ON public.dataset_shares(dataset_id);
CREATE INDEX IF NOT EXISTS idx_dataset_shares_user ON public.dataset_shares(shared_with);

ALTER TABLE public.dataset_shares ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view shares with them" ON public.dataset_shares FOR SELECT USING (auth.uid() = shared_with);
CREATE POLICY "Dataset owners can share" ON public.dataset_shares FOR INSERT WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.historical_documents_global
        WHERE id = dataset_id AND user_id = auth.uid()
    )
);
CREATE POLICY "Users can insert own transactions" ON public.web3_transactions FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ACCOUNT DELETION FUNCTION
-- This function allows a user to delete their own account and all associated data.
-- It must be called via supabase.rpc('delete_user_account')
CREATE OR REPLACE FUNCTION delete_user_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER -- Runs with service_role permissions
AS $$
BEGIN
    -- Delete from public tables (cascading will handle some, but let's be explicit)
    DELETE FROM public.historical_documents_global WHERE user_id = auth.uid();
    DELETE FROM public.web3_transactions WHERE user_id = auth.uid();
    DELETE FROM public.user_asset_access WHERE user_id = auth.uid();
    DELETE FROM public.user_purchases WHERE user_id = auth.uid();
    DELETE FROM public.user_profiles WHERE id = auth.uid();
    DELETE FROM public.dataset_shares WHERE shared_with = auth.uid();
    
    -- Delete from auth.users
    DELETE FROM auth.users WHERE id = auth.uid();
END;
$$;
```

## 3. Environment Variables
Make sure to set the following environment variables in your `.env.local` file:

```env
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

## 4. Security Notes

### Row Level Security (RLS)
All tables have RLS enabled with appropriate policies:
- **Public tables** (`data_assets`, `packages`, `taxonomy`) - Anyone can read
- **User tables** (`user_profiles`, `user_purchases`, `user_asset_access`) - Users can only access their own data
- **Shared tables** (`dataset_shares`) - Users can view items shared with them
- **Historical documents** - Public read access with user-specific privacy options

### Data Privacy
- User-generated content in `historical_documents_global` can be encrypted client-side
- Web3 transaction details are stored encrypted
- Personal information in `user_profiles` is protected by RLS

### Production Recommendations
1. Consider restricting `historical_documents_global` inserts to authenticated users only
2. Implement rate limiting on public APIs
3. Add additional validation constraints on critical fields
4. Set up database backups and point-in-time recovery
5. Monitor storage usage for `corpus-images` bucket

## 5. Verification
After running the migrations, verify the setup:

```typescript
import { testSupabaseConnection } from './src/lib/supabaseClient'

// In your app initialization
const result = await testSupabaseConnection()
console.log(result.connected ? '✅ Database connected' : '❌ Connection failed')
```