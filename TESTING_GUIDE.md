# Testing Guide for Anonymous Corpus Feature

This document provides a comprehensive testing guide for the anonymous corpus and failed processing handling feature.

## Prerequisites

1. **Supabase Setup**
   - Run the migration script: `ANONYMOUS_CORPUS_MIGRATION.sql`
   - Verify all new columns exist in `historical_documents_global`
   - Verify `user_role` column exists in `user_profiles`

2. **Test User Accounts**
   - Create a regular user account
   - Create a superuser account (set `user_role = 'SUPERUSER'` in database)
   - Create an enterprise user account (set `user_role = 'ENTERPRISE'`)

## Test Scenarios

### Test 1: Successful Image Processing

**Objective**: Verify that successfully processed images are stored correctly.

**Steps**:
1. Log in as a regular user
2. Upload a valid image (e.g., a document with clear text)
3. Wait for processing to complete

**Expected Results**:
- `PROCESSING_STATUS` = 'MINTED'
- `REQUIRES_SUPERUSER_REVIEW` = FALSE
- `IS_ANONYMOUS_CORPUS` = FALSE
- `ENTERPRISE_ONLY` = FALSE
- `PROCESSING_ERROR_MESSAGE` = NULL
- Asset is visible to all users
- Asset has extracted text and metadata

**SQL Query to Verify**:
```sql
SELECT "ASSET_ID", "PROCESSING_STATUS", "REQUIRES_SUPERUSER_REVIEW", 
       "IS_ANONYMOUS_CORPUS", "ENTERPRISE_ONLY", "PROCESSING_ERROR_MESSAGE"
FROM historical_documents_global
WHERE "ASSET_ID" = '<your-asset-id>'
ORDER BY created_at DESC LIMIT 1;
```

### Test 2: Failed Image Processing

**Objective**: Verify that failed processing is handled correctly.

**Steps**:
1. Log in as a regular user
2. Simulate a processing failure by:
   - Option A: Remove the Gemini API key temporarily
   - Option B: Upload an invalid/corrupted image
   - Option C: Modify `processImageWithGemini` to throw an error for testing
3. Upload an image
4. Wait for processing to complete

**Expected Results**:
- `PROCESSING_STATUS` = 'FAILED'
- `REQUIRES_SUPERUSER_REVIEW` = TRUE
- `IS_ANONYMOUS_CORPUS` = TRUE
- `ENTERPRISE_ONLY` = TRUE
- `PROCESSING_ERROR_MESSAGE` contains error details
- Asset is NOT visible to regular users
- Asset IS visible to superusers
- Image is stored in Supabase storage

**SQL Query to Verify**:
```sql
SELECT "ASSET_ID", "PROCESSING_STATUS", "REQUIRES_SUPERUSER_REVIEW", 
       "IS_ANONYMOUS_CORPUS", "ENTERPRISE_ONLY", "PROCESSING_ERROR_MESSAGE",
       original_image_url
FROM historical_documents_global
WHERE "PROCESSING_STATUS" = 'FAILED'
ORDER BY created_at DESC LIMIT 5;
```

### Test 3: Superuser Access to Failed Assets

**Objective**: Verify that superusers can view and manage failed assets.

**Steps**:
1. Create some failed assets (see Test 2)
2. Log in as a superuser
3. Query failed assets using the RLS policies

**Expected Results**:
- Superuser can see all assets including failed ones
- Regular users cannot see failed assets
- Superuser can update failed assets

**SQL Query (as superuser)**:
```sql
-- This should return results for superusers only
SELECT COUNT(*) FROM historical_documents_global
WHERE "REQUIRES_SUPERUSER_REVIEW" = TRUE;
```

**TypeScript Code Test**:
```typescript
import { fetchFailedAssets, updateAssetAfterReview } from './services/supabaseService';

// As superuser
const failedAssets = await fetchFailedAssets();
console.log('Failed assets count:', failedAssets.length);

// Update an asset after review
if (failedAssets.length > 0) {
  const asset = failedAssets[0];
  await updateAssetAfterReview(asset.id, AssetStatus.MINTED, {
    RAW_OCR_TRANSCRIPTION: 'Manually corrected text',
    DOCUMENT_TITLE: 'Corrected Title'
  });
}
```

### Test 4: Anonymous Corpus Bundle Creation

**Objective**: Verify that superusers can create enterprise bundles from failed assets.

**Steps**:
1. Ensure there are at least 10 failed assets in the database
2. Log in as a superuser
3. Execute the bundle creation function

**SQL Query**:
```sql
-- Create a bundle (as superuser)
SELECT create_anonymous_corpus_bundle(
    'Failed Processing Bundle Test',
    'Test bundle of unprocessed images',
    5000,  -- $50 base price
    10     -- Max 10 assets
);
```

**Expected Results**:
- A new package is created with `package_type = 'ANONYMOUS_CORPUS_ENTERPRISE'`
- Assets are linked via `package_assets` table
- `ANONYMOUS_CORPUS_BUNDLE_ID` is set on selected assets
- Function returns the package UUID

**Verification Query**:
```sql
-- Verify bundle was created
SELECT p.*, COUNT(pa.id) as asset_count
FROM packages p
LEFT JOIN package_assets pa ON p.id = pa.package_id
WHERE p.package_type = 'ANONYMOUS_CORPUS_ENTERPRISE'
GROUP BY p.id
ORDER BY p.created_at DESC
LIMIT 5;
```

### Test 5: Enterprise User Access to Anonymous Corpus

**Objective**: Verify that enterprise users can only access bundles they've purchased.

**Steps**:
1. Create an anonymous corpus bundle (see Test 4)
2. Create a purchase record for an enterprise user
3. Log in as that enterprise user
4. Attempt to query anonymous corpus assets

**SQL Setup**:
```sql
-- Simulate a purchase (as admin)
INSERT INTO user_purchases (user_id, package_id, purchase_type, purchased_asset_count, price_paid_cents)
VALUES (
    '<enterprise-user-uuid>',
    '<package-uuid>',
    'ANONYMOUS_CORPUS_ENTERPRISE',
    10,
    5000
);
```

**Expected Results**:
- Enterprise user can see assets in purchased bundle
- Enterprise user cannot see assets in unpurchased bundles
- Regular users cannot see any anonymous corpus assets

**SQL Query (as enterprise user)**:
```sql
-- Should return only purchased bundle assets
SELECT COUNT(*) 
FROM historical_documents_global hdg
WHERE hdg."IS_ANONYMOUS_CORPUS" = TRUE
AND hdg."ANONYMOUS_CORPUS_BUNDLE_ID" IN (
    SELECT up.package_id 
    FROM user_purchases up 
    WHERE up.user_id = auth.uid()
);
```

### Test 6: Row Level Security (RLS) Validation

**Objective**: Verify that RLS policies work correctly for different user types.

**Test Cases**:

| User Type | Can See Successful Assets | Can See Failed Assets | Can See Anonymous Corpus | Can Update Assets |
|-----------|---------------------------|------------------------|--------------------------|-------------------|
| Regular   | ✓ (non-enterprise)        | ✗                      | ✗                        | Own only          |
| Superuser | ✓ (all)                   | ✓                      | ✓                        | ✓ (all)           |
| Enterprise| ✓ (non-enterprise)        | ✗                      | ✓ (purchased)            | Own only          |
| Anonymous | ✓ (public)                | ✗                      | ✗                        | ✗                 |

**SQL Test Queries**:
```sql
-- Test as regular user (should see only non-enterprise, successful assets)
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" TO '<regular-user-uuid>';
SELECT COUNT(*) FROM historical_documents_global;

-- Test as superuser (should see all assets)
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" TO '<superuser-uuid>';
SELECT COUNT(*) FROM historical_documents_global;
```

### Test 7: Error Message Storage

**Objective**: Verify that error messages are correctly stored and retrieved.

**Steps**:
1. Trigger a processing failure with a specific error
2. Check that the error message is stored
3. Verify error message is accessible to superusers

**Expected Results**:
- `PROCESSING_ERROR_MESSAGE` contains the actual error message
- Error message is descriptive and helpful for debugging
- Error message is visible in the `fetchFailedAssets` result

### Test 8: Preservation Events

**Objective**: Verify that preservation events are logged correctly for both success and failure.

**SQL Query**:
```sql
SELECT "ASSET_ID", "PROCESSING_STATUS", "PRESERVATION_EVENTS"
FROM historical_documents_global
WHERE created_at > NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC
LIMIT 10;
```

**Expected Results**:
- Successful processing: `PRESERVATION_EVENTS` includes `GEMINI_PROCESSING` with `outcome = "SUCCESS"`
- Failed processing: `PRESERVATION_EVENTS` includes `GEMINI_PROCESSING` with `outcome = "FAILURE"`
- All events have proper timestamps

## Performance Tests

### Test 9: Index Performance

**Objective**: Verify that indexes are working correctly.

**SQL Queries**:
```sql
-- Check index usage for failed assets query
EXPLAIN ANALYZE
SELECT * FROM historical_documents_global
WHERE "REQUIRES_SUPERUSER_REVIEW" = TRUE;

-- Check index usage for anonymous corpus query
EXPLAIN ANALYZE
SELECT * FROM historical_documents_global
WHERE "IS_ANONYMOUS_CORPUS" = TRUE;

-- Check index usage for processing status query
EXPLAIN ANALYZE
SELECT * FROM historical_documents_global
WHERE "PROCESSING_STATUS" = 'FAILED';
```

**Expected Results**:
- All queries should use indexes (Index Scan, not Seq Scan)
- Query execution time should be < 10ms for < 1000 records

## Integration Tests

### Test 10: Complete Workflow

**Objective**: Test the complete workflow from upload to bundle creation.

**Steps**:
1. Upload 20 images (10 succeed, 10 fail)
2. Verify all are stored correctly
3. Log in as superuser
4. Review failed assets
5. Create an anonymous corpus bundle
6. Purchase bundle as enterprise user
7. Verify enterprise user can access the bundle

**Success Criteria**:
- All 20 images are in database
- 10 have status MINTED, 10 have status FAILED
- Failed assets are not visible to regular users
- Bundle is created with 10 failed assets
- Enterprise user can access purchased bundle assets

## Cleanup

After testing, clean up test data:

```sql
-- Delete test packages
DELETE FROM package_assets WHERE package_id IN (
    SELECT id FROM packages WHERE package_type = 'ANONYMOUS_CORPUS_ENTERPRISE'
);
DELETE FROM packages WHERE package_type = 'ANONYMOUS_CORPUS_ENTERPRISE';

-- Delete test assets
DELETE FROM historical_documents_global WHERE "ASSET_ID" LIKE 'TEST_%';

-- Reset user roles
UPDATE user_profiles SET user_role = 'USER' WHERE user_role != 'USER';
```

## Troubleshooting

### Issue: Regular users can see failed assets
**Solution**: Check RLS policies are enabled and correctly configured

### Issue: Superusers cannot see failed assets
**Solution**: Verify `user_role = 'SUPERUSER'` is set in `user_profiles` table

### Issue: Bundle creation fails
**Solution**: Check that superuser has proper permissions and assets exist

### Issue: Processing always fails
**Solution**: Verify Gemini API key is configured correctly in `.env.local`

## Monitoring Queries

Use these queries to monitor the system:

```sql
-- Count assets by status
SELECT "PROCESSING_STATUS", COUNT(*) 
FROM historical_documents_global 
GROUP BY "PROCESSING_STATUS";

-- Count anonymous corpus assets
SELECT COUNT(*) FROM historical_documents_global 
WHERE "IS_ANONYMOUS_CORPUS" = TRUE;

-- Count assets requiring superuser review
SELECT COUNT(*) FROM historical_documents_global 
WHERE "REQUIRES_SUPERUSER_REVIEW" = TRUE;

-- Average processing success rate (last 7 days)
SELECT 
    COUNT(CASE WHEN "PROCESSING_STATUS" = 'MINTED' THEN 1 END)::FLOAT / COUNT(*) * 100 as success_rate_percent
FROM historical_documents_global
WHERE created_at > NOW() - INTERVAL '7 days';

-- Most common error messages
SELECT "PROCESSING_ERROR_MESSAGE", COUNT(*) as occurrence
FROM historical_documents_global
WHERE "PROCESSING_ERROR_MESSAGE" IS NOT NULL
GROUP BY "PROCESSING_ERROR_MESSAGE"
ORDER BY occurrence DESC
LIMIT 10;
```
