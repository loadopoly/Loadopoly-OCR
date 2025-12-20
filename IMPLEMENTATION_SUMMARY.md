# Implementation Summary: Anonymous Corpus & Failed Processing

## Overview
This implementation adds comprehensive handling for failed image processing and creates an enterprise-accessible anonymous corpus system.

## Problem Statement Requirements ✅

1. **Update database upon completion of processed images**
   - ✅ Implemented automatic database sync for authenticated users
   - ✅ Updates happen for both successful and failed processing
   - ✅ Status tracked in `PROCESSING_STATUS` field

2. **Handle failed processing - set aside for superuser review**
   - ✅ Error handling in `processAssetPipeline` catches all failures
   - ✅ Failed assets marked with `REQUIRES_SUPERUSER_REVIEW = TRUE`
   - ✅ Error messages stored in `PROCESSING_ERROR_MESSAGE`
   - ✅ Superusers can query and manage failed assets

3. **Assign to anonymous corpus**
   - ✅ Failed assets automatically flagged with `IS_ANONYMOUS_CORPUS = TRUE`
   - ✅ Anonymous corpus items hidden from regular users
   - ✅ Can only be viewed as part of enterprise bundles

4. **Bundle for enterprise customers only**
   - ✅ SQL function `create_anonymous_corpus_bundle()` creates bundles
   - ✅ Bundles marked as `package_type = 'ANONYMOUS_CORPUS_ENTERPRISE'`
   - ✅ RLS policies ensure only purchased bundles are accessible
   - ✅ Enterprise users verified by `ANONYMOUS_CORPUS_BUNDLE_ID`

## Architecture

### Database Schema
```
historical_documents_global:
  - PROCESSING_ERROR_MESSAGE (TEXT) - Error details
  - REQUIRES_SUPERUSER_REVIEW (BOOLEAN) - Flags for review
  - IS_ANONYMOUS_CORPUS (BOOLEAN) - Part of anonymous corpus
  - ANONYMOUS_CORPUS_BUNDLE_ID (UUID) - Link to bundle
  - ENTERPRISE_ONLY (BOOLEAN) - Access restriction

user_profiles:
  - user_role (TEXT) - USER, SUPERUSER, ENTERPRISE
```

### Access Control Matrix

| User Type  | Successful Assets | Failed Assets | Anonymous Corpus | Can Update |
|------------|-------------------|---------------|------------------|------------|
| Regular    | ✓ (public only)   | ✗             | ✗                | Own only   |
| Superuser  | ✓ (all)           | ✓             | ✓                | All        |
| Enterprise | ✓ (public only)   | ✗             | ✓ (purchased)    | Own only   |
| Anonymous  | ✓ (public only)   | ✗             | ✗                | ✗          |

### Workflow

```
Image Upload
    ↓
Processing (Gemini API)
    ↓
    ├─→ Success
    │   ├─ Status: MINTED
    │   ├─ IS_ANONYMOUS_CORPUS: FALSE
    │   ├─ REQUIRES_SUPERUSER_REVIEW: FALSE
    │   └─ Visible to: All users
    │
    └─→ Failure
        ├─ Status: FAILED
        ├─ IS_ANONYMOUS_CORPUS: TRUE
        ├─ REQUIRES_SUPERUSER_REVIEW: TRUE
        ├─ ENTERPRISE_ONLY: TRUE
        ├─ Error message stored
        └─ Visible to: Superusers only

Superuser Review
    ├─→ Create Bundle
    │   ├─ SQL: create_anonymous_corpus_bundle()
    │   ├─ Groups failed assets
    │   ├─ Sets ANONYMOUS_CORPUS_BUNDLE_ID
    │   └─ Available for enterprise purchase
    │
    └─→ Manual Fix
        ├─ updateAssetAfterReview()
        ├─ Change status to MINTED
        └─ Remove from anonymous corpus

Enterprise Purchase
    ↓
user_purchases record created
    ↓
RLS grants access to bundle assets
    ↓
Enterprise user can download/process
```

## Implementation Details

### Error Handling
```typescript
try {
  // Process with Gemini API
  const analysis = await processImageWithGemini(file, location, scanType);
  // ... success handling
} catch (processingError) {
  // Failure handling
  const failedAsset = {
    status: AssetStatus.FAILED,
    errorMessage: processingError.message,
    sqlRecord: {
      PROCESSING_STATUS: AssetStatus.FAILED,
      PROCESSING_ERROR_MESSAGE: errorMessage,
      REQUIRES_SUPERUSER_REVIEW: true,
      IS_ANONYMOUS_CORPUS: true,
      ENTERPRISE_ONLY: true
    }
  };
  // Store in Supabase for review
  await contributeAssetToGlobalCorpus(failedAsset, userId, license, true, true, errorMessage);
}
```

### RLS Policies
```sql
-- Public: Only successful, non-enterprise assets
CREATE POLICY "Public Read Non-Enterprise" 
FOR SELECT USING (
    ("ENTERPRISE_ONLY" = FALSE OR "ENTERPRISE_ONLY" IS NULL) AND
    ("PROCESSING_STATUS" = 'MINTED' OR "PROCESSING_STATUS" = 'PENDING')
);

-- Enterprise: Only purchased bundles
CREATE POLICY "Enterprise Read Anonymous Corpus" 
FOR SELECT USING (
    "IS_ANONYMOUS_CORPUS" = TRUE AND 
    "ENTERPRISE_ONLY" = TRUE AND
    "ANONYMOUS_CORPUS_BUNDLE_ID" IN (
        SELECT package_id FROM user_purchases WHERE user_id = auth.uid()
    )
);

-- Superuser: All assets
CREATE POLICY "Superusers View All" 
FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM user_profiles 
        WHERE id = auth.uid() AND user_role = 'SUPERUSER'
    )
);
```

### Bundle Creation
```sql
-- Create bundle (superusers only)
SELECT create_anonymous_corpus_bundle(
    'Failed Processing Q4 2024',
    'Collection of unprocessed images for manual review',
    5000,  -- $50 base price
    100    -- Max assets
);

-- Function automatically:
-- 1. Creates data_assets entries for failed items
-- 2. Creates package with ANONYMOUS_CORPUS_ENTERPRISE type
-- 3. Links assets to package via package_assets
-- 4. Sets ANONYMOUS_CORPUS_BUNDLE_ID on assets
-- 5. Returns package UUID
```

## Key Features

### 1. Automatic Database Updates
- All processing results sync to Supabase for authenticated users
- Both successful and failed processing updates are captured
- Preservation events log the processing history

### 2. Failure Detection & Storage
- Single source of truth: `asset.status`
- Error messages preserved for debugging
- Images uploaded to storage even on failure
- Metadata captured for later analysis

### 3. Role-Based Access Control
- Three distinct user roles with different permissions
- RLS policies enforce access restrictions at database level
- Bundle-specific access prevents unauthorized data exposure

### 4. Enterprise Bundle System
- Superusers can create curated bundles from failed assets
- Bundles priced per asset with base price
- Purchase tracking via user_purchases table
- Automatic access grants upon purchase

### 5. Code Quality
- Consistent agent naming via exported constants
- Inline parameter comments for complex function calls
- Proper TypeScript typing without excessive `as any`
- Clear documentation throughout

## Migration Path

### For New Installations
Run `ANONYMOUS_CORPUS_MIGRATION.sql` on fresh Supabase instance.

### For Existing Installations
1. Backup database
2. Run migration script
3. Verify new columns exist
4. Update user roles as needed
5. Test RLS policies with different user types

### Rollback
```sql
-- Remove new columns
ALTER TABLE historical_documents_global 
DROP COLUMN IF EXISTS "PROCESSING_ERROR_MESSAGE",
DROP COLUMN IF EXISTS "REQUIRES_SUPERUSER_REVIEW",
DROP COLUMN IF EXISTS "IS_ANONYMOUS_CORPUS",
DROP COLUMN IF EXISTS "ANONYMOUS_CORPUS_BUNDLE_ID",
DROP COLUMN IF EXISTS "ENTERPRISE_ONLY";

ALTER TABLE user_profiles 
DROP COLUMN IF EXISTS user_role;

-- Drop function
DROP FUNCTION IF EXISTS create_anonymous_corpus_bundle;

-- Restore simple RLS policies
-- (See DATABASE_SETUP.md pre-migration version)
```

## Testing

Comprehensive testing guide available in `TESTING_GUIDE.md`:
- 10+ test scenarios
- SQL verification queries
- Performance benchmarks
- Security validation
- Monitoring queries

## Performance Considerations

### Indexes Created
- `idx_hdg_processing_status` - On PROCESSING_STATUS
- `idx_hdg_superuser_review` - Partial index on REQUIRES_SUPERUSER_REVIEW
- `idx_hdg_anonymous_corpus` - Partial index on IS_ANONYMOUS_CORPUS
- `idx_hdg_enterprise_only` - Partial index on ENTERPRISE_ONLY

### Query Optimization
- Partial indexes on boolean columns reduce index size
- Bundle queries leverage user_purchases join
- RLS policies use efficient EXISTS clauses

## Security

### Data Protection
- Failed assets hidden from regular users
- Bundle access verified at database level
- Error messages sanitized in public views
- Encryption for sensitive data maintained

### Access Control
- Multi-tier RLS policies
- Bundle-specific access checks
- Superuser role carefully controlled
- Enterprise verification via purchases

## Future Enhancements

1. **Auto-Retry**: Retry failed processing with different parameters
2. **Batch Review**: UI for superusers to review multiple assets
3. **Analytics**: Dashboard for failure rates and patterns
4. **Quality Scoring**: Automated assessment of corpus value
5. **Tiered Pricing**: Variable pricing based on asset quality

## Documentation

- `ANONYMOUS_CORPUS_GUIDE.md` - Feature documentation
- `TESTING_GUIDE.md` - Testing scenarios
- `ANONYMOUS_CORPUS_MIGRATION.sql` - Migration script
- `DATABASE_SETUP.md` - Updated schema reference
- `README.md` - Feature overview

## Support

For questions or issues:
1. Review documentation files
2. Check testing guide for examples
3. Examine RLS policies for access issues
4. Verify user roles in database
5. Contact: support@geograph.foundation
