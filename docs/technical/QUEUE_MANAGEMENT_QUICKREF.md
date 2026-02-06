# Queue Management Quick Reference

Quick reference guide for queue management and download features.

## Quick Commands

### Check Queue Health
```typescript
const health = await processingQueueService.getQueueHealth();
console.log(`Pending: ${health.totalPending}, Stale: ${health.staleLocksCount}`);
```

### Reset Stuck Jobs
```typescript
// Release stale locks (gentle)
await processingQueueService.releaseStaleJobs();

// Reset user's failed jobs
await processingQueueService.resetUserQueue();

// Force reset ALL stuck jobs (emergency only)
await processingQueueService.forceResetAllStuckJobs();
```

### Enable Monitoring
```typescript
const cleanup = processingQueueService.enableContinuousProcessing();
// Later: cleanup();
```

### Download Single Asset
```typescript
await downloadService.downloadAsset(asset, {
  onProgress: (loaded, total) => console.log(`${loaded}/${total}`),
});
```

### Download Multiple as ZIP
```typescript
await downloadService.downloadBatch(assets, {
  format: 'zip',
  zipFilename: 'export.zip',
});
```

## Database Functions

| Function | Purpose | Returns |
|----------|---------|---------|
| `get_queue_health()` | Queue metrics | Stats object |
| `reset_user_queue(user_id)` | Reset user's jobs | Count + IDs |
| `cleanup_completed_jobs(days)` | Remove old jobs | Count |
| `force_reset_stuck_jobs()` | Emergency reset | Count + IDs |
| `release_stale_locks()` | Free stuck jobs | Count |

## Status Flow

```
PENDING → PROCESSING → COMPLETED
                    ↓
                  FAILED
                    ↓
              (can be reset to PENDING)
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Jobs stuck | `releaseStaleJobs()` |
| High failure rate | `getQueueHealth()` + investigate |
| Downloads fail | Check auth + ownership |
| Memory issues | Use smaller batches |

## Configuration

```typescript
processingQueueService.enableContinuousProcessing({
  healthCheckIntervalMs: 60000,      // 1 min
  staleJobCheckIntervalMs: 300000,   // 5 min
  pollingFallbackMs: 30000,          // 30 sec
});
```

## Security

- ✅ All operations require authentication
- ✅ Users can only reset their own jobs
- ✅ Download URLs expire in 1 hour
- ✅ Asset ownership validated
- ⚠️ `force_reset_stuck_jobs()` is admin-only

## Limits

- Max concurrent downloads: **5**
- Max batch (individual): **50**
- Max batch (ZIP): **20**
- Signed URL expiry: **3600s** (1 hour)

## Common Patterns

### Offline Queue Management
```typescript
// Listen for online/offline
window.addEventListener('online', async () => {
  await processingQueueService.flushPendingJobs();
});
```

### Progress Tracking
```typescript
await downloadService.downloadAsset(asset, {
  onProgress: (loaded, total) => {
    const percent = Math.round((loaded / total) * 100);
    setProgress(percent);
  },
});
```

### Error Handling
```typescript
try {
  await downloadService.downloadAsset(asset);
} catch (error) {
  // Fallback to JSON
  downloadAsset(asset, 'json');
}
```

## UI Components

### QueueMonitor
```tsx
<QueueMonitor 
  userId={user.id}
  onRequeueComplete={() => refetch()}
/>
```

Features:
- Real-time stats
- Reset server button
- Release locks button
- Job list with progress

---

For detailed documentation, see [QUEUE_MANAGEMENT_AND_DOWNLOADS.md](./QUEUE_MANAGEMENT_AND_DOWNLOADS.md)
