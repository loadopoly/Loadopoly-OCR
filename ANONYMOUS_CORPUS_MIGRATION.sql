-- Migration: Add Anonymous Corpus and Superuser Review Fields
-- Date: 2025-12-20
-- Description: This migration adds support for failed image processing, anonymous corpus,
--              and enterprise-only access for bundles of unprocessed/failed images.

-- Add new columns to historical_documents_global
ALTER TABLE public.historical_documents_global 
ADD COLUMN IF NOT EXISTS "PROCESSING_ERROR_MESSAGE" TEXT,
ADD COLUMN IF NOT EXISTS "REQUIRES_SUPERUSER_REVIEW" BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS "IS_ANONYMOUS_CORPUS" BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS "ANONYMOUS_CORPUS_BUNDLE_ID" UUID,
ADD COLUMN IF NOT EXISTS "ENTERPRISE_ONLY" BOOLEAN DEFAULT FALSE;

-- Add user_role to user_profiles if not exists
ALTER TABLE public.user_profiles 
ADD COLUMN IF NOT EXISTS user_role TEXT DEFAULT 'USER';

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_hdg_processing_status 
ON public.historical_documents_global("PROCESSING_STATUS");

CREATE INDEX IF NOT EXISTS idx_hdg_superuser_review 
ON public.historical_documents_global("REQUIRES_SUPERUSER_REVIEW") 
WHERE "REQUIRES_SUPERUSER_REVIEW" = TRUE;

CREATE INDEX IF NOT EXISTS idx_hdg_anonymous_corpus 
ON public.historical_documents_global("IS_ANONYMOUS_CORPUS") 
WHERE "IS_ANONYMOUS_CORPUS" = TRUE;

CREATE INDEX IF NOT EXISTS idx_hdg_enterprise_only 
ON public.historical_documents_global("ENTERPRISE_ONLY") 
WHERE "ENTERPRISE_ONLY" = TRUE;

-- Drop old policies
DROP POLICY IF EXISTS "Public Read" ON public.historical_documents_global;

-- Create new RLS policies

-- Public can read successfully processed assets that aren't enterprise-only
CREATE POLICY "Public Read Non-Enterprise" ON public.historical_documents_global 
FOR SELECT USING (
    ("ENTERPRISE_ONLY" = FALSE OR "ENTERPRISE_ONLY" IS NULL) AND
    ("PROCESSING_STATUS" = 'MINTED' OR "PROCESSING_STATUS" = 'PENDING')
);

-- Enterprise users can read anonymous corpus items they've purchased
CREATE POLICY "Enterprise Read Anonymous Corpus" ON public.historical_documents_global 
FOR SELECT USING (
    "IS_ANONYMOUS_CORPUS" = TRUE AND 
    "ENTERPRISE_ONLY" = TRUE AND
    EXISTS (
        SELECT 1 FROM public.user_purchases up
        JOIN public.packages p ON up.package_id = p.id
        WHERE up.user_id = auth.uid()
        AND p.package_type = 'ANONYMOUS_CORPUS_ENTERPRISE'
    )
);

-- Superusers can view all assets including failed ones
CREATE POLICY "Superusers View All" ON public.historical_documents_global 
FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM public.user_profiles 
        WHERE id = auth.uid() AND user_role = 'SUPERUSER'
    )
);

-- Users can view their own assets
CREATE POLICY "Users View Own Assets" ON public.historical_documents_global 
FOR SELECT USING (
    auth.uid() = user_id
);

-- Users and system can update their own assets or failed assets
CREATE POLICY "Update Own or Failed Assets" ON public.historical_documents_global 
FOR UPDATE USING (
    auth.uid() = user_id OR 
    "PROCESSING_STATUS" = 'FAILED' OR 
    "PROCESSING_STATUS" = 'PENDING'
);

-- Create a function to bundle anonymous corpus items for enterprise customers
CREATE OR REPLACE FUNCTION create_anonymous_corpus_bundle(
    p_package_name TEXT,
    p_description TEXT,
    p_base_price_cents INTEGER,
    p_max_assets INTEGER DEFAULT 100
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_package_id UUID;
    v_asset_count INTEGER;
BEGIN
    -- Only superusers can create bundles
    IF NOT EXISTS (
        SELECT 1 FROM public.user_profiles 
        WHERE id = auth.uid() AND user_role = 'SUPERUSER'
    ) THEN
        RAISE EXCEPTION 'Only superusers can create anonymous corpus bundles';
    END IF;

    -- Create the package
    INSERT INTO public.packages (
        package_name,
        package_type,
        grouping_key,
        description,
        base_price_cents,
        price_per_asset_cents,
        is_active
    ) VALUES (
        p_package_name,
        'ANONYMOUS_CORPUS_ENTERPRISE',
        'ANONYMOUS_CORPUS',
        p_description,
        p_base_price_cents,
        10, -- $0.10 per asset
        TRUE
    ) RETURNING id INTO v_package_id;

    -- Add anonymous corpus assets to the package (limit to p_max_assets)
    WITH selected_assets AS (
        SELECT da.id
        FROM public.data_assets da
        JOIN public.historical_documents_global hdg ON da.asset_id = hdg."ASSET_ID"
        WHERE hdg."IS_ANONYMOUS_CORPUS" = TRUE
        AND hdg."ENTERPRISE_ONLY" = TRUE
        AND hdg."ANONYMOUS_CORPUS_BUNDLE_ID" IS NULL
        ORDER BY hdg.created_at DESC
        LIMIT p_max_assets
    )
    INSERT INTO public.package_assets (package_id, asset_id)
    SELECT v_package_id, id FROM selected_assets;

    -- Update the bundle reference in historical_documents_global
    UPDATE public.historical_documents_global
    SET "ANONYMOUS_CORPUS_BUNDLE_ID" = v_package_id
    WHERE "ASSET_ID" IN (
        SELECT da.asset_id 
        FROM public.package_assets pa
        JOIN public.data_assets da ON pa.asset_id = da.id
        WHERE pa.package_id = v_package_id
    );

    -- Get asset count
    SELECT COUNT(*) INTO v_asset_count
    FROM public.package_assets
    WHERE package_id = v_package_id;

    -- Update package with asset count
    UPDATE public.packages
    SET total_assets = v_asset_count
    WHERE id = v_package_id;

    RETURN v_package_id;
END;
$$;

-- Grant execute permission on the function
GRANT EXECUTE ON FUNCTION create_anonymous_corpus_bundle(TEXT, TEXT, INTEGER, INTEGER) TO authenticated;

COMMENT ON COLUMN public.historical_documents_global."PROCESSING_ERROR_MESSAGE" IS 'Error message if processing failed';
COMMENT ON COLUMN public.historical_documents_global."REQUIRES_SUPERUSER_REVIEW" IS 'Flag indicating the asset requires superuser review';
COMMENT ON COLUMN public.historical_documents_global."IS_ANONYMOUS_CORPUS" IS 'Flag indicating the asset is part of anonymous corpus (failed/unprocessed)';
COMMENT ON COLUMN public.historical_documents_global."ANONYMOUS_CORPUS_BUNDLE_ID" IS 'Reference to the enterprise bundle this asset belongs to';
COMMENT ON COLUMN public.historical_documents_global."ENTERPRISE_ONLY" IS 'Flag indicating the asset can only be accessed by enterprise customers';
COMMENT ON COLUMN public.user_profiles.user_role IS 'User role: USER, SUPERUSER, or ENTERPRISE';
COMMENT ON FUNCTION create_anonymous_corpus_bundle IS 'Creates an enterprise bundle from anonymous corpus assets';
