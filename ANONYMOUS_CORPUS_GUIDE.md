# Anonymous Corpus and Failed Processing Handling

## Overview

This document describes the anonymous corpus feature that handles failed image processing and makes these assets available to enterprise customers for manual review and training data.

## Features

### 1. Failed Processing Detection

When an image fails to process through the Gemini API, the system:
- Captures the error message
- Sets `PROCESSING_STATUS` to `FAILED`
- Flags the asset with `REQUIRES_SUPERUSER_REVIEW = TRUE`
- Marks the asset as part of anonymous corpus (`IS_ANONYMOUS_CORPUS = TRUE`)
- Makes the asset enterprise-only (`ENTERPRISE_ONLY = TRUE`)
- Stores the image in Supabase for superuser review

### 2. Anonymous Corpus

Failed and unprocessed images are automatically added to an "anonymous corpus" that:
- Cannot be viewed by regular users
- Can be reviewed and processed manually by superusers
- Can be bundled and sold to enterprise customers
- Is stored separately from successfully processed images

### 3. Access Control

Three levels of access:
1. **Regular Users**: Can view successfully processed, non-enterprise assets
2. **Superusers**: Can view all assets including failed ones requiring review
3. **Enterprise Customers**: Can access anonymous corpus bundles they've purchased

## Database Schema Changes

### New Fields in `historical_documents_global`

```sql
PROCESSING_ERROR_MESSAGE TEXT              -- Error message if processing failed
REQUIRES_SUPERUSER_REVIEW BOOLEAN          -- Flag for superuser review
IS_ANONYMOUS_CORPUS BOOLEAN                -- Part of anonymous corpus
ANONYMOUS_CORPUS_BUNDLE_ID UUID            -- Link to enterprise bundle
ENTERPRISE_ONLY BOOLEAN                    -- Enterprise-only access
```

### New Field in `user_profiles`

```sql
user_role TEXT DEFAULT 'USER'              -- USER, SUPERUSER, or ENTERPRISE
```

## Row Level Security (RLS) Policies

### Public Read Policy
Regular users can read:
- Successfully processed assets (`PROCESSING_STATUS = 'MINTED'`)
- Assets that are not enterprise-only

### Enterprise Policy
Enterprise users can read:
- Anonymous corpus items in bundles they've purchased
- Through the `user_purchases` and `packages` tables

### Superuser Policy
Superusers can read:
- All assets including failed ones
- Identified by `user_role = 'SUPERUSER'` in `user_profiles`

## Creating Anonymous Corpus Bundles

Superusers can create enterprise bundles using the SQL function:

```sql
SELECT create_anonymous_corpus_bundle(
    'Failed Processing Bundle Q4 2024',           -- Package name
    'Collection of unprocessed images for manual review',  -- Description
    5000,                                         -- Base price in cents ($50)
    100                                          -- Max assets in bundle
);
```

This function:
1. Creates a new package with type `ANONYMOUS_CORPUS_ENTERPRISE`
2. Selects up to `max_assets` from the anonymous corpus
3. Links the assets to the package via `package_assets`
4. Updates the bundle reference in each asset
5. Returns the package ID

## Usage Flow

### For Image Processing (Automated)

```typescript
// In App.tsx - processAssetPipeline
try {
  // Process with Gemini
  const analysis = await processImageWithGemini(file, location, scanType);
  // Update to MINTED status
  // Store in Supabase with processingFailed = false
} catch (error) {
  // Handle failure
  // Set FAILED status
  // Mark as anonymous corpus
  // Store in Supabase with processingFailed = true
}
```

### For Superusers (Manual Review)

1. Query failed assets:
```sql
SELECT * FROM historical_documents_global
WHERE REQUIRES_SUPERUSER_REVIEW = TRUE
ORDER BY created_at DESC;
```

2. Review and fix assets manually
3. Update status to `MINTED` after successful processing
4. Remove from anonymous corpus if appropriate

### For Enterprise Customers

1. Purchase an anonymous corpus bundle
2. Access is granted via RLS policies
3. Can download and process assets as training data
4. Assets remain in anonymous corpus until processed

## API Changes

### `contributeAssetToGlobalCorpus` Function

New parameters:
- `processingFailed: boolean` - Indicates if processing failed
- `errorMessage?: string` - Error message to store

The function now:
- Sets anonymous corpus flags for failed processing
- Stores error messages
- Marks assets as enterprise-only when appropriate

## Indexing

New indexes for performance:
- `idx_hdg_processing_status` - On `PROCESSING_STATUS`
- `idx_hdg_superuser_review` - On `REQUIRES_SUPERUSER_REVIEW` (partial index)
- `idx_hdg_anonymous_corpus` - On `IS_ANONYMOUS_CORPUS` (partial index)
- `idx_hdg_enterprise_only` - On `ENTERPRISE_ONLY` (partial index)

## Migration

To apply this feature to an existing database, run:

```bash
psql -h your-supabase-host -d postgres -U postgres -f ANONYMOUS_CORPUS_MIGRATION.sql
```

Or use the Supabase Dashboard SQL Editor to execute the migration script.

## Security Considerations

1. **Failed images contain sensitive data**: Even failed processing may expose personal or confidential information
2. **Superuser role assignment**: Should be carefully controlled and audited
3. **Enterprise bundles**: Should be priced appropriately to cover manual review costs
4. **Anonymous corpus access**: Limited to verified enterprise customers only

## Future Enhancements

1. Auto-retry failed processing with different parameters
2. Batch superuser review interface
3. Analytics on failure rates and common error types
4. Automated quality scoring for anonymous corpus assets
5. Tiered pricing based on asset quality and metadata completeness
