# Queue Management and Binary Downloads

## Overview

This document describes the queue management and binary download features added to the Loadopoly-OCR platform. These features enable continuous processing of uploads to Supabase, remote queue management for handling stuck jobs, and binary asset downloads.

**Version:** 1.0  
**Last Updated:** 2026-02-06  
**Related PRs:** #[PR_NUMBER]

---

## Table of Contents

- [Architecture](#architecture)
- [Queue Management](#queue-management)
- [Binary Downloads](#binary-downloads)
- [Database Schema](#database-schema)
- [API Reference](#api-reference)
- [Usage Examples](#usage-examples)
- [Troubleshooting](#troubleshooting)
- [Security Considerations](#security-considerations)

---

## Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────┐
│                    Client Application                    │
├─────────────────────────────────────────────────────────┤
│  ┌──────────────────┐  ┌──────────────────────────────┐ │
│  │ QueueMonitor UI  │  │   ProcessingQueueService     │ │
│  │  - Reset Server  │  │   - Health Monitoring        │ │
│  │  - Release Locks │  │   - Auto Recovery            │ │
│  │  - View Stats    │  │   - Job Flushing             │ │
│  └──────────────────┘  └──────────────────────────────┘ │
│                                                           │
│  ┌──────────────────────────────────────────────────────┐│
│  │            DownloadService                           ││
│  │  - Single/Batch Downloads                           ││
│  │  - Progress Tracking                                 ││
│  │  - ZIP Archive Support                               ││
│  └──────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────┐
│                   Supabase Backend                       │
├─────────────────────────────────────────────────────────┤
│  ┌────────────────────────────────────────────────────┐ │
│  │  Database RPCs                                     │ │
│  │  - get_queue_health()                              │ │
│  │  - reset_user_queue(user_id)                       │ │
│  │  - cleanup_completed_jobs(days_old)                │ │
│  │  - force_reset_stuck_jobs()                        │ │
│  │  - release_stale_locks()                           │ │
│  └────────────────────────────────────────────────────┘ │
│                                                           │
│  ┌────────────────────────────────────────────────────┐ │
│  │  Edge Functions                                    │ │
│  │  - download-asset: Signed URL generation          │ │
│  └────────────────────────────────────────────────────┘ │
│                                                           │
│  ┌────────────────────────────────────────────────────┐ │
│  │  Storage Buckets                                   │ │
│  │  - processing-uploads                              │ │
│  │  - corpus-images                                   │ │
│  └────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

### Data Flow

#### Queue Processing Flow
1. Client uploads image → Supabase Storage
2. Job inserted into `processing_queue` table (STATUS='PENDING')
3. Edge Function claims job via `claim_processing_job()` RPC
4. Job processes with progress updates (PROCESSING)
5. Result saved, job marked COMPLETED
6. Client receives updates via Realtime or polling

#### Download Flow
1. User requests download → Client calls `downloadService.downloadAsset()`
2. Service requests signed URL from `download-asset` Edge Function
3. Edge Function validates ownership and generates signed URL (1hr expiry)
4. Client downloads file directly from storage using signed URL
5. Progress tracked and reported to UI

---

## Queue Management

### Features

#### Automatic Monitoring
The system includes continuous monitoring that:
- Checks queue health every 60 seconds
- Releases stale locks every 5 minutes
- Flushes pending local jobs when connectivity returns
- Falls back to polling when Realtime is unavailable
- Uses exponential backoff with jitter for reconnection

#### Manual Interventions
Users can manually:
- Reset failed/stuck jobs back to PENDING
- Release stale locks on jobs
- View comprehensive queue statistics
- Cancel pending jobs

### Database Functions

#### `get_queue_health()`
Returns comprehensive queue metrics.

**Returns:**
```typescript
{
  totalPending: number;
  totalProcessing: number;
  totalCompleted24h: number;
  totalFailed24h: number;
  avgProcessingTimeSeconds: number;
  staleLocksCount: number;
  oldestPendingAgeMinutes: number;
}
```

**Usage:**
```sql
SELECT * FROM get_queue_health();
```

#### `reset_user_queue(p_user_id UUID)`
Resets all failed/stuck jobs for a specific user back to PENDING state.

**Parameters:**
- `p_user_id` - UUID of the user

**Returns:**
```typescript
{
  resetCount: number;
  jobIds: UUID[];
}
```

**Usage:**
```sql
SELECT * FROM reset_user_queue('user-uuid-here');
```

#### `cleanup_completed_jobs(p_days_old INTEGER DEFAULT 7)`
Removes completed/failed/cancelled jobs older than specified days.

**Parameters:**
- `p_days_old` - Number of days (default: 7)

**Returns:** Number of jobs deleted

**Usage:**
```sql
SELECT cleanup_completed_jobs(30); -- Remove jobs older than 30 days
```

#### `force_reset_stuck_jobs()`
Emergency function to reset ALL jobs stuck in PROCESSING state.

**Returns:**
```typescript
{
  resetCount: number;
  jobIds: UUID[];
}
```

**Usage:**
```sql
SELECT * FROM force_reset_stuck_jobs();
```

**⚠️ Warning:** This is an aggressive operation. Use only in emergency situations.

#### `release_stale_locks()`
Releases jobs that have been locked longer than their timeout period.

**Returns:** Number of locks released

**Usage:**
```sql
SELECT release_stale_locks();
```

### Client-Side API

#### ProcessingQueueService Methods

##### `getQueueHealth()`
Fetches current queue health metrics.

```typescript
const health = await processingQueueService.getQueueHealth();
if (health) {
  console.log(`Pending: ${health.totalPending}`);
  console.log(`Processing: ${health.totalProcessing}`);
  console.log(`Stale locks: ${health.staleLocksCount}`);
}
```

##### `resetUserQueue()`
Resets the current user's failed/stuck jobs.

```typescript
const result = await processingQueueService.resetUserQueue();
console.log(`Reset ${result.resetCount} jobs`);
```

##### `enableContinuousProcessing(options?)`
Enables automatic monitoring and recovery.

```typescript
const cleanup = processingQueueService.enableContinuousProcessing({
  healthCheckIntervalMs: 60000,      // Health checks every minute
  staleJobCheckIntervalMs: 300000,   // Release stale locks every 5min
  pollingFallbackMs: 30000,          // Poll every 30s as fallback
});

// Later, to disable:
cleanup();
```

##### `flushPendingJobs()`
Manually flush pending local jobs to server.

```typescript
const result = await processingQueueService.flushPendingJobs();
console.log(`Flushed ${result.success} jobs, ${result.failed} failed`);
```

##### `releaseStaleJobs()`
Manually release stale locks.

```typescript
const released = await processingQueueService.releaseStaleJobs();
console.log(`Released ${released} stale jobs`);
```

### UI Components

#### QueueMonitor Component

The `QueueMonitor` component provides a visual interface for queue management:

**Features:**
- Real-time queue statistics
- "Reset Server" button - Reset failed server-side jobs
- "Release Stuck Jobs" button - Release stale locks
- Job list with status and progress
- Stage breakdown visualization

**Usage:**
```tsx
import { QueueMonitor } from './components/QueueMonitor';

<QueueMonitor 
  userId={currentUser.id}
  onRequeueComplete={() => console.log('Requeue complete')}
  compact={false}
/>
```

---

## Binary Downloads

### Overview

The binary download system allows users to download processed assets (images, documents) from Supabase Storage with proper authentication and access control.

### Features

- **Single Asset Downloads** - Download individual files with progress tracking
- **Batch Downloads** - Download multiple files at once
- **ZIP Archive Support** - Bundle multiple files into a ZIP (requires JSZip)
- **Progress Tracking** - Real-time download progress updates
- **Fallback Support** - Falls back to JSON export if download fails
- **Access Control** - User ownership validation and authentication

### Edge Function: download-asset

**Endpoint:** `POST /functions/v1/download-asset`

**Authentication:** Required (Bearer token)

#### Single Asset Request
```typescript
POST /functions/v1/download-asset
Content-Type: application/json
Authorization: Bearer <token>

{
  "assetId": "asset-uuid-here",
  "expiresIn": 3600  // optional, default 3600 (1 hour)
}
```

**Response:**
```typescript
{
  "success": true,
  "signedUrl": "https://...",
  "expiresAt": "2026-02-06T13:00:00Z"
}
```

#### Batch Request
```typescript
POST /functions/v1/download-asset
Content-Type: application/json
Authorization: Bearer <token>

{
  "assetIds": ["asset-1", "asset-2", "asset-3"],
  "expiresIn": 3600
}
```

**Response:**
```typescript
{
  "success": true,
  "signedUrls": {
    "asset-1": "https://...",
    "asset-2": "https://...",
    "asset-3": "https://..."
  },
  "expiresAt": "2026-02-06T13:00:00Z",
  "error": "Asset asset-4 not found" // if any failed
}
```

### DownloadService API

#### `downloadAsset(asset, options?)`
Downloads a single asset.

```typescript
import { downloadService } from './services/downloadService';

await downloadService.downloadAsset(asset, {
  filename: 'custom-name.jpg',
  onProgress: (loaded, total) => {
    const percent = (loaded / total) * 100;
    console.log(`Download progress: ${percent.toFixed(2)}%`);
  },
  onComplete: () => {
    console.log('Download complete!');
  },
  onError: (error) => {
    console.error('Download failed:', error);
  }
});
```

#### `downloadBatch(assets, options?)`
Downloads multiple assets.

```typescript
// Download individually
await downloadService.downloadBatch(assets, {
  format: 'individual',
  onProgress: (current, total, assetId) => {
    console.log(`Downloading ${current}/${total}: ${assetId}`);
  },
  onComplete: (downloadedCount) => {
    console.log(`Downloaded ${downloadedCount} assets`);
  }
});

// Download as ZIP
await downloadService.downloadBatch(assets, {
  format: 'zip',
  zipFilename: 'my-assets.zip',
  onProgress: (current, total, assetId) => {
    console.log(`Processing ${current}/${total}: ${assetId}`);
  },
  onComplete: (downloadedCount) => {
    console.log(`Created ZIP with ${downloadedCount} files`);
  }
});
```

#### Queue Management

```typescript
// Get current download queue status
const queue = downloadService.getQueueStatus();
queue.forEach(item => {
  console.log(`${item.assetId}: ${item.status} (${item.progress}%)`);
});

// Clear completed downloads
downloadService.clearCompleted();

// Cancel all pending downloads
downloadService.cancelAll();
```

---

## Database Schema

### Processing Queue Table

The `processing_queue` table manages all server-side OCR processing jobs.

```sql
CREATE TABLE processing_queue (
    "ID" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "USER_ID" UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    "ASSET_ID" TEXT NOT NULL,
    "IMAGE_PATH" TEXT NOT NULL,
    "SCAN_TYPE" TEXT NOT NULL DEFAULT 'DOCUMENT',
    "PRIORITY" INTEGER NOT NULL DEFAULT 5,
    "LATITUDE" DOUBLE PRECISION,
    "LONGITUDE" DOUBLE PRECISION,
    "STATUS" TEXT NOT NULL DEFAULT 'PENDING',
    "PROGRESS" INTEGER DEFAULT 0,
    "STAGE" TEXT DEFAULT 'QUEUED',
    "RETRY_COUNT" INTEGER DEFAULT 0,
    "MAX_RETRIES" INTEGER DEFAULT 3,
    "LAST_ERROR" TEXT,
    "ERROR_CODE" TEXT,
    "WORKER_ID" TEXT,
    "LOCKED_AT" TIMESTAMPTZ,
    "LOCK_TIMEOUT_SECONDS" INTEGER DEFAULT 300,
    "CREATED_AT" TIMESTAMPTZ DEFAULT NOW(),
    "STARTED_AT" TIMESTAMPTZ,
    "COMPLETED_AT" TIMESTAMPTZ,
    "UPDATED_AT" TIMESTAMPTZ DEFAULT NOW()
);
```

### Indexes

```sql
-- Status-based queries
CREATE INDEX idx_processing_queue_status_created 
    ON processing_queue("STATUS", "CREATED_AT");

-- Cleanup queries
CREATE INDEX idx_processing_queue_completed_at_status 
    ON processing_queue("COMPLETED_AT", "STATUS")
    WHERE "STATUS" IN ('COMPLETED', 'FAILED', 'CANCELLED');

-- User queries
CREATE INDEX idx_processing_queue_user_status 
    ON processing_queue("USER_ID", "STATUS");
```

---

## Usage Examples

### Complete Setup

```typescript
import { processingQueueService } from './services/processingQueueService';
import { downloadService } from './services/downloadService';

// Initialize queue service
await processingQueueService.init(currentUser.id);

// Enable continuous monitoring
const cleanupMonitoring = processingQueueService.enableContinuousProcessing({
  healthCheckIntervalMs: 60000,
  staleJobCheckIntervalMs: 300000,
  pollingFallbackMs: 30000,
});

// Set up callbacks for job events
processingQueueService.setCallbacks({
  onJobCompleted: (job) => {
    console.log(`Job ${job.id} completed!`);
  },
  onJobFailed: (job) => {
    console.error(`Job ${job.id} failed: ${job.error}`);
  },
  onJobProgress: (job) => {
    console.log(`Job ${job.id}: ${job.progress}%`);
  }
});
```

### Queue Health Monitoring

```typescript
// Periodic health check
setInterval(async () => {
  const health = await processingQueueService.getQueueHealth();
  
  if (!health) return;
  
  // Alert on issues
  if (health.staleLocksCount > 0) {
    console.warn(`${health.staleLocksCount} stale locks detected!`);
    await processingQueueService.releaseStaleJobs();
  }
  
  if (health.totalFailed24h > 10) {
    console.error(`High failure rate: ${health.totalFailed24h} failures in 24h`);
  }
  
  // Log stats
  console.log(`Queue Stats:
    Pending: ${health.totalPending}
    Processing: ${health.totalProcessing}
    Completed (24h): ${health.totalCompleted24h}
    Avg Time: ${health.avgProcessingTimeSeconds}s
  `);
}, 60000);
```

### Handling Stuck Jobs

```typescript
// User reports stuck jobs
async function handleStuckJobs() {
  // First try releasing stale locks
  const released = await processingQueueService.releaseStaleJobs();
  
  if (released > 0) {
    console.log(`Released ${released} stale locks`);
    return;
  }
  
  // If no stale locks, try resetting user's failed jobs
  const result = await processingQueueService.resetUserQueue();
  
  if (result.resetCount > 0) {
    console.log(`Reset ${result.resetCount} jobs`);
    return;
  }
  
  console.log('No stuck jobs found');
}
```

### Download with Retry

```typescript
async function downloadAssetWithRetry(asset, maxRetries = 3) {
  let attempt = 0;
  
  while (attempt < maxRetries) {
    try {
      await downloadService.downloadAsset(asset, {
        onProgress: (loaded, total) => {
          updateProgressBar(loaded / total);
        }
      });
      return true; // Success
    } catch (error) {
      attempt++;
      console.warn(`Download attempt ${attempt} failed:`, error);
      
      if (attempt >= maxRetries) {
        // Fallback to JSON export
        console.log('Falling back to JSON export');
        downloadAsset(asset, 'json');
        return false;
      }
      
      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
    }
  }
}
```

---

## Troubleshooting

### Common Issues

#### Jobs Stuck in PROCESSING

**Symptoms:** Jobs show as PROCESSING but never complete

**Solutions:**
1. Check if worker timeout has expired:
   ```typescript
   const health = await processingQueueService.getQueueHealth();
   console.log(`Stale locks: ${health.staleLocksCount}`);
   ```

2. Release stale locks:
   ```typescript
   await processingQueueService.releaseStaleJobs();
   ```

3. If persistent, force reset:
   ```typescript
   await processingQueueService.forceResetAllStuckJobs();
   ```

#### Downloads Failing

**Symptoms:** Downloads fail with 404 or authentication errors

**Solutions:**
1. Verify user is authenticated:
   ```typescript
   const { data: { session } } = await supabase.auth.getSession();
   console.log('Session:', session);
   ```

2. Check asset ownership:
   ```sql
   SELECT USER_ID FROM historical_documents_global 
   WHERE ASSET_ID = 'your-asset-id';
   ```

3. Verify storage path exists:
   - Check Supabase Storage console
   - Verify bucket permissions

4. Check signed URL expiration:
   - Default expiry is 1 hour
   - Increase if needed: `{ expiresIn: 7200 }`

#### Local Jobs Not Flushing

**Symptoms:** Jobs queued offline don't sync when back online

**Solutions:**
1. Manually trigger flush:
   ```typescript
   const result = await processingQueueService.flushPendingJobs();
   console.log(`Flushed: ${result.success}, Failed: ${result.failed}`);
   ```

2. Check online status:
   ```typescript
   console.log('Online:', navigator.onLine);
   ```

3. Verify Supabase connection:
   ```typescript
   const isConfigured = isSupabaseConfigured();
   console.log('Supabase configured:', isConfigured);
   ```

#### High Memory Usage

**Symptoms:** Browser tab using excessive memory during batch downloads

**Solutions:**
1. Download in smaller batches:
   ```typescript
   const BATCH_SIZE = 10;
   for (let i = 0; i < assets.length; i += BATCH_SIZE) {
     const batch = assets.slice(i, i + BATCH_SIZE);
     await downloadService.downloadBatch(batch, { format: 'individual' });
   }
   ```

2. Avoid ZIP for large batches:
   - ZIP creation loads all files into memory
   - Use individual downloads for >20 files

3. Clear completed downloads:
   ```typescript
   downloadService.clearCompleted();
   ```

---

## Security Considerations

### Authentication

All sensitive operations require authentication:
- Download signed URLs require valid JWT token
- Queue operations are user-scoped (except admin functions)
- Edge Functions validate user session

### Authorization

- Users can only reset their own jobs
- Downloads verify asset ownership before generating signed URLs
- Service role functions (like `force_reset_stuck_jobs`) require elevated permissions

### Data Protection

- Signed URLs expire after 1 hour (configurable)
- No sensitive data in URL parameters
- Storage buckets have RLS policies
- Database functions use `SECURITY DEFINER` with proper checks

### Best Practices

1. **Never expose service role keys in client code**
2. **Always validate user ownership before operations**
3. **Use short-lived signed URLs** (1-2 hours max)
4. **Monitor failed download attempts** (potential enumeration attacks)
5. **Rate limit download requests** (prevent abuse)
6. **Log all queue reset operations** (audit trail)

### Permissions Matrix

| Operation | User | Service Role | Notes |
|-----------|------|--------------|-------|
| `get_queue_health()` | ✅ | ✅ | Read-only, safe |
| `reset_user_queue()` | ✅ | ✅ | Own jobs only |
| `cleanup_completed_jobs()` | ❌ | ✅ | Admin only |
| `force_reset_stuck_jobs()` | ❌ | ✅ | Emergency only |
| `release_stale_locks()` | ✅ | ✅ | Safe operation |
| Download own assets | ✅ | ✅ | Ownership verified |
| Download others' assets | ❌ | ✅ | Public assets only |

---

## Performance Considerations

### Queue Management

- Health checks run every 60s (adjustable)
- Stale lock release every 5min (adjustable)
- Database queries optimized with indexes
- Realtime subscriptions preferred over polling

### Downloads

- Signed URLs cached client-side (within expiry)
- Parallel downloads limited to prevent memory issues
- Progress tracking uses streams (low memory)
- ZIP creation requires loading all files (memory intensive)

### Recommended Limits

- **Max concurrent downloads:** 5
- **Max batch size (individual):** 50
- **Max batch size (ZIP):** 20
- **Max signed URL expiry:** 7200s (2 hours)
- **Health check interval:** 60-300s
- **Stale lock check interval:** 300-600s

---

## Migration Guide

### From JSON-Only Downloads

If you were using the old JSON-only download system:

```typescript
// Old way
function downloadJSON(asset: DigitalAsset) {
  const dataStr = "data:text/json;charset=utf-8," + 
    encodeURIComponent(JSON.stringify(asset.sqlRecord, null, 2));
  const a = document.createElement('a');
  a.href = dataStr;
  a.download = `GEOGRAPH_DB_${asset.id}.json`;
  a.click();
}

// New way (with fallback)
async function downloadAsset(asset: DigitalAsset, format: 'json' | 'image' = 'image') {
  if (format === 'json') {
    // Still supported for backward compatibility
    downloadJSON(asset);
  } else {
    // New binary download
    await downloadService.downloadAsset(asset, {
      onError: (error) => {
        // Fallback to JSON
        downloadAsset(asset, 'json');
      }
    });
  }
}
```

### Database Migration

Apply the migration file to your Supabase project:

```bash
# Using Supabase CLI
supabase db push

# Or manually in Supabase Dashboard
# Run: supabase/migrations/20260206000000_add_remote_reset_functions.sql
```

### Enabling Continuous Processing

Add to your app initialization:

```typescript
// In your App.tsx or main.tsx
useEffect(() => {
  if (currentUser) {
    processingQueueService.init(currentUser.id);
    
    const cleanup = processingQueueService.enableContinuousProcessing();
    
    return () => cleanup();
  }
}, [currentUser]);
```

---

## Changelog

### Version 1.0 (2026-02-06)

**Added:**
- Database functions for queue management
- Client-side queue health monitoring
- Continuous processing with automatic recovery
- Binary download functionality with signed URLs
- Batch download support with ZIP compression
- Download progress tracking
- UI controls for manual queue intervention

**Changed:**
- `flushPendingJobs()` changed from private to public
- Enhanced error handling and logging

**Security:**
- Added authentication checks to Edge Functions
- Implemented ownership validation for downloads
- Added expiring signed URLs

---

## Support

For issues or questions:
- Check [Troubleshooting](#troubleshooting) section
- Review [Usage Examples](#usage-examples)
- Check GitHub Issues: https://github.com/loadopoly/Loadopoly-OCR/issues
- Join Discord: [link]

---

## License

See [LICENSE](../../LICENSE) file for details.
