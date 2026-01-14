# Supabase Integration Documentation

## Overview
This document describes the complete Supabase integration for the Loadopoly OCR application, including all database tables, relationships, and how they connect to the application code.

## Database Schema

### Core Tables

#### 1. `historical_documents_global`
Main table for storing OCR-processed documents and their metadata.

**Key Features:**
- Stores document metadata, OCR transcriptions, and processing results
- Supports multiple scan types: DOCUMENT, ITEM, SCENERY
- Includes accessibility features (alt text, audio descriptions, reading order)
- Web3 integration fields (shard tokens, NFT tokens, redemption)
- Standardized UPPERCASE field names for PostgREST compatibility

**Used in:**
- [src/services/supabaseService.ts](src/services/supabaseService.ts) - `fetchGlobalCorpus()`, `fetchUserAssets()`, `contributeAssetToGlobalCorpus()`

#### 2. `data_assets`
Marketplace-specific asset metadata table.

**Key Features:**
- Simplified asset metadata for marketplace operations
- Token count and file size tracking
- Confidence scores for data quality
- Generic JSONB metadata field for extensibility

**Relationships:**
- Referenced by `package_assets` and `user_asset_access`

#### 3. `user_profiles`
User account information and settings.

**Key Features:**
- Links to auth.users via primary key
- Wallet address storage for Web3 features
- Display name and email

**Relationships:**
- Referenced by `user_purchases`, `user_asset_access`

#### 4. `packages`
Marketplace data packages/bundles.

**Key Features:**
- Dynamic pricing based on asset count
- Package types and grouping keys for categorization
- Active/inactive status for management

**Relationships:**
- Referenced by `package_assets` and `user_purchases`

#### 5. `package_assets`
Junction table linking packages to their contained assets.

**Relationships:**
- Links `packages` to `data_assets`

#### 6. `user_purchases`
Purchase transaction records.

**Key Features:**
- Tracks original vs. purchased asset counts
- Handles duplicate detection
- Stores blockchain transaction hashes
- JSONB metadata for flexible purchase information

**Relationships:**
- Links to `user_profiles` and `packages`
- Referenced by `user_asset_access`

#### 7. `user_asset_access`
Tracks which assets users have purchased/accessed.

**Key Features:**
- Grants access to specific assets
- Links back to source purchase for audit trail

**Relationships:**
- Links `user_profiles` to `data_assets` via `user_purchases`

#### 8. `taxonomy`
Hierarchical classification system for objects.

**Key Features:**
- Self-referencing parent-child relationships
- Integration with external taxonomies (GBIF, iNaturalist, Wikidata)
- Supports any taxonomic rank

**Relationships:**
- Self-referencing via `parent_id`
- Referenced by `object_attributes`

#### 9. `object_attributes`
Detailed metadata for physical objects and items.

**Key Features:**
- Material, technique, maker information
- Architectural and cultural significance data
- Production dates and provenance
- Array fields for multiple values (materials, techniques, etc.)

**Relationships:**
- Links to `historical_documents_global` and `taxonomy`

#### 10. `dataset_shares`
Collaborative sharing of datasets between users.

**Key Features:**
- Permission levels (read, write, admin)
- Share tracking with timestamps

**Relationships:**
- Links `historical_documents_global` to `auth.users`

#### 11. `web3_transactions`
Blockchain transaction records (encrypted).

**Key Features:**
- Stores encrypted transaction details
- Unique transaction hash tracking
- User-specific with RLS

**Used in:**
- [src/services/supabaseService.ts](src/services/supabaseService.ts) - `recordWeb3Transaction()`

## Type Definitions

All database types are defined in [src/lib/database.types.ts](src/lib/database.types.ts).

### Generated Types:
```typescript
Database['public']['Tables']['table_name']['Row']      // Full row type
Database['public']['Tables']['table_name']['Insert']   // Insert payload type
Database['public']['Tables']['table_name']['Update']   // Update payload type
```

### Helper Types:
```typescript
HistoricalDocument
DataAsset
UserProfile
Package
UserPurchase
Taxonomy
ObjectAttributes
```

## Service Integration

### [src/lib/supabaseClient.ts](src/lib/supabaseClient.ts)
Core Supabase client initialization.

**Functions:**
- `supabase` - Typed Supabase client instance
- `isSupabaseConfigured()` - Check if credentials are set
- `testSupabaseConnection()` - Verify database connectivity

### [src/services/supabaseService.ts](src/services/supabaseService.ts)
High-level service functions for database operations.

**Functions:**
- `fetchGlobalCorpus()` - Retrieve all public documents
- `fetchUserAssets(userId)` - Get user-specific documents
- `contributeAssetToGlobalCorpus(asset, userId, license, isAutoSave)` - Upload new document
- `recordWeb3Transaction(userId, assetId, txHash, details)` - Log blockchain transaction
- `subscribeToAssetUpdates(userId, onUpdated, onInserted)` - **v2.8.1+** Real-time subscription to asset changes

### [src/services/processingQueueService.ts](src/services/processingQueueService.ts)
Background processing queue management for server-side OCR.

**Functions:**
- `init(userId)` - Initialize service with user context
- `queueFile(file, options, existingAssetId)` - Queue file for edge processing
- `queueFiles(files, options, onProgress)` - Batch queue multiple files
- `getStats()` - Get queue statistics (pending, processing, completed, failed)
- `getUserJobs(options)` - Fetch user's job history
- `getJobById(jobId)` - Fetch specific job with result data
- `cancelJob(jobId)` - Cancel pending job
- `retryJob(jobId)` - Retry failed job
- `setCallbacks(callbacks)` - Set progress/completion callbacks

**Callbacks:**
- `onJobStarted(job)` - Triggered when job begins processing
- `onJobProgress(job)` - Triggered on progress updates
- `onJobCompleted(job)` - Triggered when job completes successfully
- `onJobFailed(job)` - Triggered on job failure

## API Endpoints

### [api/mint-shards.ts](api/mint-shards.ts)
Vercel serverless function for minting shard tokens.

**Process:**
1. Verifies asset ownership in `historical_documents_global`
2. Mints on-chain shard tokens
3. Updates database with transaction details

### [api/datasets/[id].ts](api/datasets/[id].ts)
API endpoint for exporting user datasets.

**Features:**
- Authentication with Supabase JWT
- Format support: JSONL, Parquet
- RLS-protected data access

## Row Level Security (RLS)

All tables have RLS enabled with appropriate policies:

### Public Access
- `data_assets` - Anyone can SELECT
- `packages` (active only) - Anyone can SELECT
- `package_assets` - Anyone can SELECT
- `taxonomy` - Anyone can SELECT
- `object_attributes` - Anyone can SELECT
- `historical_documents_global` - Anyone can SELECT and INSERT (configurable)

### User-Scoped Access
- `user_profiles` - Users can only access their own profile
- `user_purchases` - Users can only view their own purchases
- `user_asset_access` - Users can only view their own access grants
- `web3_transactions` - Users can only access their own transactions
- `dataset_shares` - Users can view datasets shared with them

## Environment Variables

Required in `.env.local`:
```env
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

For API routes (Vercel):
```env
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_ANON_KEY=your-anon-key-here
```

## Setup Instructions

1. **Create Supabase Project**
   - Sign up at [supabase.com](https://supabase.com)
   - Create a new project
   - Note your project URL and anon key

2. **Run Migrations**
   - Open SQL Editor in Supabase dashboard
   - Copy and run the complete schema from [DATABASE_SETUP.md](DATABASE_SETUP.md)

3. **Configure Storage**
   - Create bucket named `corpus-images`
   - Set to public access
   - Configure CORS if needed

4. **Set Environment Variables**
   - Copy `.env.example` to `.env.local`
   - Fill in your Supabase credentials
   - For Vercel deployment, add to project settings

5. **Test Connection**
   ```typescript
   import { testSupabaseConnection } from './src/lib/supabaseClient'
   const result = await testSupabaseConnection()
   ```

## Data Flow

### Document Upload Flow
```
User captures image
  → OCR processing (Gemini API)
  → Local storage (IndexedDB)
  → (Optional) Upload to Supabase
    → Image stored in corpus-images bucket
    → Metadata inserted into historical_documents_global
    → Encrypted if user authenticated
```

### Marketplace Purchase Flow
```
User browses packages
  → User purchases package
    → Record in user_purchases
    → Grant access via user_asset_access
    → (Optional) Blockchain transaction via web3_transactions
```

### Asset Access Check
```
User requests asset
  → Check user_asset_access for user_id + asset_id
  → If exists: grant access
  → If not: check if public or require purchase
```

## Security Best Practices

1. **Always use RLS** - All tables should have RLS enabled
2. **Encrypt sensitive data** - Use client-side encryption for PII
3. **Validate inputs** - Use database constraints and application validation
4. **Audit trails** - Track purchases and access grants
5. **Rate limiting** - Implement on public endpoints
6. **Token management** - Rotate anon keys periodically

## Troubleshooting

### Connection Issues
- Verify environment variables are set
- Check Supabase project is not paused
- Ensure network allows connections to Supabase

### RLS Errors
- Make sure user is authenticated
- Check policy conditions match your use case. Note: v1.7.3+ includes "Public Anonymous Update/Delete" policies for the global corpus to ensure seamless ingestion.
- Use service role key for admin operations (API routes only)

### Type Mismatches
- Regenerate types: `npx supabase gen types typescript --project-id YOUR_PROJECT_ID`
- Check for UPPERCASE vs lowercase field naming
- Verify JSONB fields are properly typed

## Migration from Old Schema

If upgrading from the old schema:

1. **Backup existing data**
2. **Run new migrations** from DATABASE_SETUP.md
3. **Update application code** to use new table names
4. **Test thoroughly** before deploying

## Future Enhancements

Potential improvements:
- [x] **Real-time subscriptions for asset updates** - Implemented in v2.8.1 via `subscribeToAssetUpdates()`
- [x] **Edge Functions for OCR processing** - `api/process-ocr` handles server-side OCR
- [ ] Full-text search using Supabase FTS
- [ ] PostgREST views for common queries
- [ ] Automated backups and versioning
- [ ] Data archival strategies

## Support

For issues or questions:
- Check [Supabase Documentation](https://supabase.com/docs)
- Review [DATABASE_SETUP.md](DATABASE_SETUP.md)
- Open an issue in the repository
