/**
 * Processing Queue Service
 * 
 * Client-side service for managing server-side processing queue.
 * Provides methods to:
 * - Queue assets for server-side OCR processing
 * - Monitor job status via Realtime subscriptions
 * - Handle job completion and error recovery
 * - Fallback to client-side processing when offline
 * 
 * Architecture:
 * 1. Client uploads image to Supabase Storage
 * 2. Client inserts job into processing_queue table
 * 3. Server (Edge Function) claims and processes job
 * 4. Client receives updates via Realtime subscription
 */

import { supabase, isSupabaseConfigured } from '../lib/supabaseClient';
import { compressImage, CompressionOptions } from '../lib/imageCompression';
import { logger } from '../lib/logger';
import { ScanType, DigitalAsset, AssetStatus } from '../types';
import { saveAsset, loadAssets } from '../lib/indexeddb';
import { v4 as uuidv4 } from 'uuid';

// ============================================
// Types
// ============================================

export interface QueueJob {
  id: string;
  assetId: string;
  imagePath: string;
  scanType: ScanType;
  status: JobStatus;
  progress: number;
  stage: string;
  priority: number;
  retryCount: number;
  error?: string;
  resultData?: Record<string, unknown>;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  location?: { lat: number; lng: number };
}

export type JobStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

export interface QueueOptions {
  /** Job priority 1-10 (higher = more urgent) */
  priority?: number;
  /** Scan type for OCR */
  scanType?: ScanType;
  /** GPS coordinates */
  location?: { lat: number; lng: number };
  /** Compress before upload */
  compress?: boolean;
  /** Compression options */
  compressionOptions?: CompressionOptions;
  /** Custom metadata */
  metadata?: Record<string, unknown>;
}

export interface QueueStats {
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  avgProcessingTime: number;
}

export interface QueueEventCallbacks {
  onJobQueued?: (job: QueueJob) => void;
  onJobStarted?: (job: QueueJob) => void;
  onJobProgress?: (job: QueueJob) => void;
  onJobCompleted?: (job: QueueJob) => void;
  onJobFailed?: (job: QueueJob) => void;
}

// ============================================
// Constants
// ============================================

const STORAGE_BUCKET = 'processing-uploads';
const QUEUE_TABLE = 'processing_queue';

// ============================================
// Queue Service Class
// ============================================

class ProcessingQueueService {
  private userId: string | null = null;
  private subscriptions: Map<string, any> = new Map();
  private callbacks: QueueEventCallbacks = {};
  private isOnline: boolean = navigator.onLine;
  private pendingLocalJobs: QueueJob[] = [];
  private edgeTriggerTimeout: ReturnType<typeof setTimeout> | null = null;
  private edgeTriggerDebounceMs: number = 1000; // Debounce edge invocations

  constructor() {
    // Listen for online/offline events
    window.addEventListener('online', () => {
      this.isOnline = true;
      this.flushPendingJobs();
    });
    window.addEventListener('offline', () => {
      this.isOnline = false;
    });
  }

  /**
   * Initialize the service with user ID
   */
  async init(userId: string): Promise<void> {
    this.userId = userId;
    logger.info(`ProcessingQueueService initialized with userId: ${userId}`);
    
    if (!isSupabaseConfigured()) {
      logger.warn('Supabase not configured, queue service will operate in offline mode');
      return;
    }
    
    // Subscribe to user's job updates
    await this.subscribeToUserJobs();
  }

  /**
   * Get diagnostic info about the service state
   */
  getDiagnostics(): { 
    userId: string | null; 
    isOnline: boolean; 
    supabaseConfigured: boolean;
    canProcessServer: boolean;
    localPendingJobs: number;
  } {
    return {
      userId: this.userId,
      isOnline: this.isOnline,
      supabaseConfigured: isSupabaseConfigured(),
      canProcessServer: Boolean(this.userId && this.isOnline && isSupabaseConfigured()),
      localPendingJobs: this.pendingLocalJobs.length,
    };
  }

  /**
   * Test connectivity to Supabase storage and queue table
   * Returns detailed error info for debugging RLS issues
   */
  async testConnection(): Promise<{
    storageUpload: { success: boolean; error?: string };
    queueInsert: { success: boolean; error?: string };
    queueSelect: { success: boolean; error?: string };
  }> {
    const results: {
      storageUpload: { success: boolean; error?: string };
      queueInsert: { success: boolean; error?: string };
      queueSelect: { success: boolean; error?: string };
    } = {
      storageUpload: { success: false, error: undefined },
      queueInsert: { success: false, error: undefined },
      queueSelect: { success: false, error: undefined },
    };

    if (!this.userId || !isSupabaseConfigured()) {
      const reason = !this.userId ? 'User not logged in' : 'Supabase not configured';
      return {
        storageUpload: { success: false, error: reason },
        queueInsert: { success: false, error: reason },
        queueSelect: { success: false, error: reason },
      };
    }

    const testId = `test-${Date.now()}`;
    const testBlob = new Blob(['test'], { type: 'text/plain' });
    const testPath = `${this.userId}/${testId}.txt`;

    // Test 1: Storage upload
    try {
      const { error } = await supabase!.storage
        .from('processing-uploads')
        .upload(testPath, testBlob);
      
      if (error) {
        results.storageUpload = { success: false, error: `Storage RLS error: ${error.message}` };
      } else {
        results.storageUpload = { success: true, error: undefined };
        // Clean up test file
        await supabase!.storage.from('processing-uploads').remove([testPath]);
      }
    } catch (e: any) {
      results.storageUpload = { success: false, error: `Exception: ${e.message}` };
    }

    // Test 2: Queue insert (using raw query to avoid type issues)
    try {
      const { data, error } = await (supabase as any)
        .from('processing_queue')
        .insert({
          user_id: this.userId,
          asset_id: testId,
          image_path: 'test/path.jpg',
          scan_type: 'document',
          status: 'CANCELLED', // Mark as cancelled so it won't be processed
          priority: 1,
        })
        .select('id')
        .single();

      if (error) {
        results.queueInsert = { success: false, error: `Queue insert RLS error: ${error.message}` };
      } else {
        results.queueInsert = { success: true, error: undefined };
        // Clean up test record
        if (data?.id) {
          await (supabase as any).from('processing_queue').delete().eq('id', data.id);
        }
      }
    } catch (e: any) {
      results.queueInsert = { success: false, error: `Exception: ${e.message}` };
    }

    // Test 3: Queue select
    try {
      const { error } = await (supabase as any)
        .from('processing_queue')
        .select('id')
        .eq('user_id', this.userId)
        .limit(1);

      if (error) {
        results.queueSelect = { success: false, error: `Queue select RLS error: ${error.message}` };
      } else {
        results.queueSelect = { success: true, error: undefined };
      }
    } catch (e: any) {
      results.queueSelect = { success: false, error: `Exception: ${e.message}` };
    }

    logger.info('Connection test results', results);
    return results;
  }

  /**
   * Set event callbacks
   */
  setCallbacks(callbacks: QueueEventCallbacks): void {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }

  /**
   * Queue a file for server-side processing
   */
  async queueFile(
    file: File,
    options: QueueOptions = {},
    existingAssetId?: string
  ): Promise<QueueJob> {
    const assetId = existingAssetId || uuidv4();
    const priority = options.priority ?? 5;
    const scanType = options.scanType ?? ScanType.DOCUMENT;
    
    logger.debug('Queueing file for processing', { fileName: file.name, assetId });
    
    // Compress if requested
    let fileToUpload = file;
    if (options.compress !== false) {
      try {
        const compressed = await compressImage(file, options.compressionOptions);
        fileToUpload = compressed.file;
        logger.debug('Image compressed', {
          original: file.size,
          compressed: compressed.compressedSize,
          savings: `${compressed.savingsPercent}%`,
        });
      } catch (e) {
        logger.warn('Compression failed, using original file', { error: e });
      }
    }
    
    // Check prerequisites for server-side processing
    const canUseServer = this.isOnline && isSupabaseConfigured() && this.userId;
    
    if (!canUseServer) {
      const reason = !this.isOnline ? 'offline' : !isSupabaseConfigured() ? 'supabase not configured' : 'user not logged in';
      logger.warn(`Cannot queue to server (${reason}), using local queue`, { assetId });
      return this.queueLocally(assetId, fileToUpload, options);
    }
    
    try {
      // Upload to Supabase Storage
      logger.info(`Uploading to storage: ${assetId}`, { userId: this.userId ?? undefined });
      const imagePath = await this.uploadToStorage(assetId, fileToUpload);
      logger.info(`Upload successful: ${imagePath}`);
      
      // Insert job into queue
      logger.info(`Inserting job into queue: ${assetId}`);
      const job = await this.insertJob({
        assetId,
        imagePath,
        scanType,
        priority,
        location: options.location,
        metadata: options.metadata,
      });
      logger.info(`Job inserted successfully: ${job.id}`);
      
      this.callbacks.onJobQueued?.(job);
      
      // Trigger Edge Function to process the queue (debounced)
      this.triggerEdgeProcessing();
      
      return job;
    } catch (error: any) {
      logger.error('Failed to queue file to server', { 
        error: error.message, 
        assetId,
        userId: this.userId,
        stack: error.stack 
      });
      // Fallback to local queue but LOG IT
      logger.warn(`FALLBACK: Queuing locally due to server error: ${error.message}`);
      return this.queueLocally(assetId, fileToUpload, options);
    }
  }

  /**
   * Queue multiple files
   */
  async queueFiles(
    files: File[],
    options: QueueOptions = {},
    onProgress?: (completed: number, total: number) => void
  ): Promise<QueueJob[]> {
    const jobs: QueueJob[] = [];
    
    for (let i = 0; i < files.length; i++) {
      const job = await this.queueFile(files[i], options);
      jobs.push(job);
      onProgress?.(i + 1, files.length);
    }
    
    return jobs;
  }

  /**
   * Get current queue stats for the current user
   */
  async getStats(): Promise<QueueStats> {
    if (!isSupabaseConfigured() || !this.userId || !supabase) {
      return {
        pending: this.pendingLocalJobs.filter(j => j.status === 'PENDING').length,
        processing: this.pendingLocalJobs.filter(j => j.status === 'PROCESSING').length,
        completed: 0,
        failed: this.pendingLocalJobs.filter(j => j.status === 'FAILED').length,
        avgProcessingTime: 0,
      };
    }
    
    try {
      // Query the processing_queue table directly for accurate user-specific stats
      // The queue_stats view doesn't filter by user and has case issues
      const { data, error } = await (supabase as any)
        .from(QUEUE_TABLE)
        .select('status, created_at, started_at, completed_at')
        .eq('user_id', this.userId);
      
      if (error) throw error;
      
      const stats: QueueStats = {
        pending: 0,
        processing: 0,
        completed: 0,
        failed: 0,
        avgProcessingTime: 0,
      };
      
      let totalProcessingTime = 0;
      let completedCount = 0;
      
      data?.forEach((row: any) => {
        // Handle both lowercase and uppercase column names
        const status = (row.status || row.STATUS || '').toUpperCase();
        
        switch (status) {
          case 'PENDING':
            stats.pending++;
            break;
          case 'PROCESSING':
            stats.processing++;
            break;
          case 'COMPLETED':
            stats.completed++;
            // Calculate processing time if we have timestamps
            const startedAt = row.started_at || row.STARTED_AT;
            const completedAt = row.completed_at || row.COMPLETED_AT;
            if (startedAt && completedAt) {
              const processingTime = new Date(completedAt).getTime() - new Date(startedAt).getTime();
              totalProcessingTime += processingTime;
              completedCount++;
            }
            break;
          case 'FAILED':
            stats.failed++;
            break;
        }
      });
      
      // Calculate average processing time
      if (completedCount > 0) {
        stats.avgProcessingTime = totalProcessingTime / completedCount;
      }
      
      return stats;
    } catch (error) {
      logger.error('Failed to get queue stats', error);
      return {
        pending: 0,
        processing: 0,
        completed: 0,
        failed: 0,
        avgProcessingTime: 0,
      };
    }
  }

  /**
   * Get user's jobs
   */
  async getUserJobs(options: {
    status?: JobStatus[];
    limit?: number;
    offset?: number;
  } = {}): Promise<QueueJob[]> {
    if (!isSupabaseConfigured() || !this.userId || !supabase) {
      return this.pendingLocalJobs;
    }
    
    let query = (supabase as any)
      .from(QUEUE_TABLE)
      .select('*')
      .eq('user_id', this.userId)
      .order('created_at', { ascending: false });
    
    if (options.status?.length) {
      query = query.in('status', options.status);
    }
    if (options.limit) {
      query = query.limit(options.limit);
    }
    if (options.offset) {
      query = query.range(options.offset, options.offset + (options.limit || 50) - 1);
    }
    
    const { data, error } = await query;
    
    if (error) {
      logger.error('Failed to fetch user jobs', error);
      return [];
    }
    
    return (data || []).map(this.mapRowToJob);
  }

  /**
   * Get a specific job by ID
   */
  async getJobById(jobId: string): Promise<QueueJob | null> {
    if (!isSupabaseConfigured()) {
      return this.pendingLocalJobs.find(j => j.id === jobId) || null;
    }
    
    const { data, error } = await (supabase as any)
      .from(QUEUE_TABLE)
      .select('*')
      .eq('id', jobId)
      .single();
    
    if (error) {
      logger.error('Failed to fetch job by ID', { jobId, error });
      return null;
    }
    
    return data ? this.mapRowToJob(data) : null;
  }

  /**
   * Cancel a pending job
   */
  async cancelJob(jobId: string): Promise<boolean> {
    // Check local jobs first
    const localIndex = this.pendingLocalJobs.findIndex(j => j.id === jobId);
    if (localIndex >= 0) {
      this.pendingLocalJobs.splice(localIndex, 1);
      return true;
    }
    
    if (!isSupabaseConfigured()) {
      return false;
    }
    
    const { error } = await  (supabase as any)
      .from(QUEUE_TABLE)
      .update({ status: 'CANCELLED', updated_at: new Date().toISOString() })
      .eq('id', jobId)
      .eq('status', 'PENDING');
    
    if (error) {
      logger.error('Failed to cancel job', error);
      return false;
    }
    
    return true;
  }

  /**
   * Retry a failed job
   */
  async retryJob(jobId: string): Promise<boolean> {
    if (!isSupabaseConfigured()) {
      return false;
    }
    
    const { error } = await  (supabase as any)
      .from(QUEUE_TABLE)
      .update({
        status: 'PENDING',
        retry_count: 0,
        last_error: null,
        error_code: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', jobId)
      .eq('status', 'FAILED');
    
    if (error) {
      logger.error('Failed to retry job', error);
      return false;
    }
    
    return true;
  }

  /**
   * Release stale locks - call this when jobs appear stuck in PROCESSING
   * This frees jobs that were claimed by workers that died/timed out
   */
  async releaseStaleJobs(): Promise<number> {
    if (!isSupabaseConfigured()) {
      logger.warn('Cannot release stale jobs - Supabase not configured');
      return 0;
    }
    
    try {
      const { data, error } = await (supabase as any)
        .rpc('release_stale_locks');
      
      if (error) {
        logger.error('Failed to release stale locks', error);
        return 0;
      }
      
      const released = data || 0;
      if (released > 0) {
        logger.info(`Released ${released} stale processing jobs back to pending`);
      }
      return released;
    } catch (error) {
      logger.error('Error releasing stale jobs', error);
      return 0;
    }
  }

  /**
   * Force reset a specific stuck job back to pending
   */
  async forceResetJob(jobId: string): Promise<boolean> {
    if (!isSupabaseConfigured()) {
      return false;
    }
    
    try {
      const { error } = await (supabase as any)
        .from(QUEUE_TABLE)
        .update({
          status: 'PENDING',
          worker_id: null,
          locked_at: null,
          progress: 0,
          stage: 'FORCE_RESET',
          updated_at: new Date().toISOString(),
        })
        .eq('id', jobId)
        .in('status', ['PROCESSING', 'PENDING']);
      
      if (error) {
        logger.error('Failed to force reset job', error);
        return false;
      }
      
      logger.info(`Force reset job ${jobId} back to pending`);
      return true;
    } catch (error) {
      logger.error('Error force resetting job', error);
      return false;
    }
  }

  /**
   * Cleanup completed jobs older than specified days
   */
  async cleanup(daysOld: number = 7): Promise<number> {
    if (!isSupabaseConfigured()) {
      return 0;
    }
    
    const { data, error } = await  (supabase as any)
      .rpc('cleanup_completed_jobs', { p_days_old: daysOld });
    
    if (error) {
      logger.error('Failed to cleanup jobs', error);
      return 0;
    }
    
    return data || 0;
  }

  /**
   * Cancel ALL pending/processing jobs for the current user.
   * Use this to clear stuck queue items.
   * @returns Number of jobs cancelled
   */
  async cancelAllPendingJobs(): Promise<number> {
    if (!isSupabaseConfigured() || !this.userId || !supabase) {
      // Clear local pending jobs
      const localCount = this.pendingLocalJobs.length;
      this.pendingLocalJobs = [];
      return localCount;
    }

    try {
      // First, get count of jobs to cancel
      const { data: toCancel, error: countError } = await (supabase as any)
        .from(QUEUE_TABLE)
        .select('id')
        .eq('user_id', this.userId)
        .in('status', ['PENDING', 'PROCESSING']);

      if (countError) {
        logger.error('Failed to count jobs to cancel', countError);
        return 0;
      }

      const count = toCancel?.length || 0;
      if (count === 0) return 0;

      // Cancel all pending/processing jobs
      const { error } = await (supabase as any)
        .from(QUEUE_TABLE)
        .update({ 
          status: 'CANCELLED', 
          updated_at: new Date().toISOString(),
          last_error: 'Cancelled by user'
        })
        .eq('user_id', this.userId)
        .in('status', ['PENDING', 'PROCESSING']);

      if (error) {
        logger.error('Failed to cancel pending jobs', error);
        return 0;
      }

      // Also clear local pending jobs
      this.pendingLocalJobs = [];

      logger.info(`Cancelled ${count} pending/processing jobs for user ${this.userId}`);
      return count;
    } catch (error) {
      logger.error('Error cancelling pending jobs', error);
      return 0;
    }
  }

  /**
   * Delete ALL jobs for the current user (clears history).
   * Use with caution - this removes completed jobs too.
   * @returns Number of jobs deleted
   */
  async deleteAllJobs(): Promise<number> {
    if (!isSupabaseConfigured() || !this.userId || !supabase) {
      const localCount = this.pendingLocalJobs.length;
      this.pendingLocalJobs = [];
      return localCount;
    }

    try {
      // Get count first
      const { data: toDelete, error: countError } = await (supabase as any)
        .from(QUEUE_TABLE)
        .select('id')
        .eq('user_id', this.userId);

      if (countError) {
        logger.error('Failed to count jobs to delete', countError);
        return 0;
      }

      const count = toDelete?.length || 0;
      if (count === 0) return 0;

      // Delete all user jobs
      const { error } = await (supabase as any)
        .from(QUEUE_TABLE)
        .delete()
        .eq('user_id', this.userId);

      if (error) {
        logger.error('Failed to delete all jobs', error);
        return 0;
      }

      this.pendingLocalJobs = [];

      logger.info(`Deleted ${count} jobs for user ${this.userId}`);
      return count;
    } catch (error) {
      logger.error('Error deleting all jobs', error);
      return 0;
    }
  }

  /**
   * Unsubscribe from all Realtime channels
   */
  destroy(): void {
    this.subscriptions.forEach(sub => sub.unsubscribe());
    this.subscriptions.clear();
  }

  // ============================================
  // Private Methods
  // ============================================

  private async uploadToStorage(assetId: string, file: File): Promise<string> {
    const path = `${this.userId}/${assetId}/${file.name}`;
    
    // For large files (>5MB), use chunked upload with retries
    const FIVE_MB = 5 * 1024 * 1024;
    
    const uploadOptions: any = {
      cacheControl: '3600',
      upsert: false,
    };
    
    // Add duplex option for larger files to handle streaming properly
    if (file.size > FIVE_MB) {
      uploadOptions.duplex = 'half';
    }
    
    // Retry logic for mobile network instability
    let lastError: Error | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const { error } = await (supabase as any).storage
          .from(STORAGE_BUCKET)
          .upload(path, file, uploadOptions);
        
        if (!error) {
          return path;
        }
        
        lastError = new Error(`Storage upload failed: ${error.message}`);
        
        // Don't retry on 4xx errors (client errors)
        if (error.statusCode && error.statusCode >= 400 && error.statusCode < 500) {
          break;
        }
        
        // Wait before retry with exponential backoff
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
      } catch (e: any) {
        lastError = e;
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
      }
    }
    
    throw lastError || new Error('Storage upload failed after retries');
  }

  private async insertJob(params: {
    assetId: string;
    imagePath: string;
    scanType: ScanType;
    priority: number;
    location?: { lat: number; lng: number };
    metadata?: Record<string, unknown>;
  }): Promise<QueueJob> {
    const { data, error } = await  (supabase as any)
      .from(QUEUE_TABLE)
      .insert({
        user_id: this.userId,
        asset_id: params.assetId,
        image_path: params.imagePath,
        scan_type: params.scanType,
        priority: params.priority,
        latitude: params.location?.lat,
        longitude: params.location?.lng,
        metadata: params.metadata || {},
        status: 'PENDING',
      })
      .select()
      .single();
    
    if (error) {
      throw new Error(`Failed to insert job: ${error.message}`);
    }
    
    return this.mapRowToJob(data);
  }

  private queueLocally(
    assetId: string,
    file: File,
    options: QueueOptions
  ): QueueJob {
    const job: QueueJob = {
      id: assetId,
      assetId,
      imagePath: URL.createObjectURL(file),
      scanType: options.scanType ?? ScanType.DOCUMENT,
      status: 'PENDING',
      progress: 0,
      stage: 'LOCAL_QUEUE',
      priority: options.priority ?? 5,
      retryCount: 0,
      createdAt: new Date(),
      location: options.location,
    };
    
    this.pendingLocalJobs.push(job);
    logger.debug('Job queued locally (offline mode)', { assetId });
    
    return job;
  }

  private async flushPendingJobs(): Promise<void> {
    if (!isSupabaseConfigured() || this.pendingLocalJobs.length === 0) {
      return;
    }
    
    logger.info(`Flushing ${this.pendingLocalJobs.length} pending local jobs`);
    
    // TODO: Implement flush logic when online
    // This would upload local jobs to the server queue
  }

  /**
   * Trigger Edge Function to process pending queue jobs
   * Debounced to avoid excessive invocations when queueing multiple files
   */
  private triggerEdgeProcessing(): void {
    // Clear any pending trigger
    if (this.edgeTriggerTimeout) {
      clearTimeout(this.edgeTriggerTimeout);
    }

    // Debounce: wait for more jobs to be queued before invoking
    this.edgeTriggerTimeout = setTimeout(async () => {
      try {
        await this.invokeEdgeFunction();
      } catch (error) {
        logger.warn('Edge Function invocation failed (jobs will be processed on next poll)', { error });
      }
    }, this.edgeTriggerDebounceMs);
  }

  /**
   * Invoke the process-ocr Edge Function to process pending jobs
   * Can be called directly or via trigger
   */
  async invokeEdgeFunction(maxJobs: number = 5): Promise<{ processed: number; succeeded: number; failed: number } | null> {
    if (!isSupabaseConfigured() || !supabase) {
      logger.warn('Cannot invoke Edge Function: Supabase not configured');
      return null;
    }

    try {
      logger.info('Invoking process-ocr Edge Function');
      
      const { data, error } = await supabase.functions.invoke('process-ocr', {
        body: { maxJobs },
      });

      if (error) {
        throw error;
      }

      logger.info('Edge Function response', data);
      return {
        processed: data?.processed ?? 0,
        succeeded: data?.succeeded ?? 0,
        failed: data?.failed ?? 0,
      };
    } catch (error: any) {
      logger.error('Failed to invoke Edge Function', { error: error.message });
      throw error;
    }
  }

  /**
   * Re-queue local assets that are stuck in PENDING/PROCESSING status
   * Call this to push local items to the server queue for processing.
   * Successfully queued assets are marked as PROCESSING in IndexedDB.
   */
  async requeueLocalAssets(
    assets: Array<{ id: string; imageBlob?: Blob; scanType?: string }>,
    onProgress?: (completed: number, total: number, currentAssetId: string) => void
  ): Promise<{ queued: number; failed: number; errors: string[] }> {
    if (!isSupabaseConfigured() || !this.userId) {
      return { queued: 0, failed: assets.length, errors: ['Supabase not configured or user not logged in'] };
    }

    const results = { queued: 0, failed: 0, errors: [] as string[] };
    const total = assets.length;
    
    // Load all local assets to get full objects for updating
    const localAssets = await loadAssets();
    const assetMap = new Map(localAssets.map(a => [a.id, a]));
    
    // Report initial progress
    onProgress?.(0, total, '');
    
    for (let i = 0; i < assets.length; i++) {
      const asset = assets[i];
      
      try {
        if (!asset.imageBlob) {
          results.failed++;
          results.errors.push(`Asset ${asset.id}: No image blob available`);
          // Still report progress even on failure
          onProgress?.(i + 1, total, asset.id);
          continue;
        }
        
        // Create a File from the Blob
        const file = new File([asset.imageBlob], `${asset.id}.jpg`, { type: asset.imageBlob.type || 'image/jpeg' });
        
        // Upload to storage
        const imagePath = await this.uploadToStorage(asset.id, file);
        
        // Insert job into queue (will be picked up by Edge Function)
        await this.insertJob({
          assetId: asset.id,
          imagePath,
          scanType: (asset.scanType as ScanType) || ScanType.DOCUMENT,
          priority: 5,
        });
        
        // Update local IndexedDB to mark as PROCESSING (queued on server)
        const localAsset = assetMap.get(asset.id);
        if (localAsset) {
          const updatedAsset: DigitalAsset = {
            ...localAsset,
            status: AssetStatus.PROCESSING,
            serverJobId: asset.id, // Track that it's been queued
            progress: 5, // Initial progress to show it's been sent
          };
          await saveAsset(updatedAsset);
          logger.debug(`Updated local asset ${asset.id} to PROCESSING`);
        }
        
        results.queued++;
        logger.debug(`Re-queued asset ${asset.id}`);
      } catch (error: any) {
        results.failed++;
        results.errors.push(`Asset ${asset.id}: ${error.message}`);
        logger.error(`Failed to re-queue asset ${asset.id}`, error);
      }
      
      // Report progress AFTER each item (success or failure)
      onProgress?.(i + 1, total, asset.id);
    }
    
    logger.info(`Re-queue complete: ${results.queued} queued, ${results.failed} failed`);
    
    return results;
  }

  private async subscribeToUserJobs(): Promise<void> {
    if (!this.userId || this.subscriptions.has('user-jobs') || !isSupabaseConfigured() || !supabase) {
      logger.debug('Skipping job subscription', { 
        userId: this.userId ?? undefined, 
        hasExistingSub: this.subscriptions.has('user-jobs'),
        supabaseConfigured: isSupabaseConfigured() 
      });
      return;
    }
    
    try {
      const channel = supabase
        .channel(`queue:${this.userId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: QUEUE_TABLE,
            filter: `user_id=eq.${this.userId}`,
          },
          (payload: any) => {
            logger.debug('Job update received', { 
              jobId: payload.new?.id, 
              status: payload.new?.status,
              event: payload.eventType
            });
            this.handleJobUpdate(payload);
          }
        )
        .subscribe((status: string) => {
          if (status === 'SUBSCRIBED') {
            logger.info(`Subscribed to job updates for user ${this.userId}`);
          } else if (status === 'CLOSED') {
            logger.warn('Job subscription closed, resubscribing...');
            this.subscriptions.delete('user-jobs');
            setTimeout(() => this.subscribeToUserJobs(), 5000);
          } else if (status === 'CHANNEL_ERROR') {
            logger.error('Job subscription channel error');
            this.subscriptions.delete('user-jobs');
          }
        });
      
      this.subscriptions.set('user-jobs', channel);
    } catch (error) {
      logger.error('Failed to subscribe to user jobs', { error });
    }
  }

  private handleJobUpdate(payload: any): void {
    const job = this.mapRowToJob(payload.new);
    
    switch (job.status) {
      case 'PROCESSING':
        if (payload.old?.STATUS === 'PENDING') {
          this.callbacks.onJobStarted?.(job);
        } else {
          this.callbacks.onJobProgress?.(job);
        }
        break;
      case 'COMPLETED':
        this.callbacks.onJobCompleted?.(job);
        break;
      case 'FAILED':
        this.callbacks.onJobFailed?.(job);
        break;
    }
  }

  private mapRowToJob(row: any): QueueJob {
    return {
      id: row.id || row.ID,
      assetId: row.asset_id || row.ASSET_ID,
      imagePath: row.image_path || row.IMAGE_PATH,
      scanType: (row.scan_type || row.SCAN_TYPE) as ScanType,
      status: (row.status || row.STATUS) as JobStatus,
      progress: row.progress || row.PROGRESS || 0,
      stage: row.stage || row.STAGE || 'UNKNOWN',
      priority: row.priority || row.PRIORITY || 5,
      retryCount: row.retry_count || row.RETRY_COUNT || 0,
      error: row.last_error || row.LAST_ERROR,
      resultData: row.result_data || row.RESULT_DATA,
      createdAt: new Date(row.created_at || row.CREATED_AT),
      startedAt: (row.started_at || row.STARTED_AT) ? new Date(row.started_at || row.STARTED_AT) : undefined,
      completedAt: (row.completed_at || row.COMPLETED_AT) ? new Date(row.completed_at || row.COMPLETED_AT) : undefined,
      location: (row.latitude || row.LATITUDE) && (row.longitude || row.LONGITUDE)
        ? { lat: row.latitude || row.LATITUDE, lng: row.longitude || row.LONGITUDE }
        : undefined,
    };
  }

  // ============================================
  // Public Realtime Subscription API
  // ============================================

  /**
   * Subscribe to real-time job status updates for a specific user.
   * Use this for direct UI updates when jobs complete/fail.
   * 
   * @param userId - The user ID to filter updates for
   * @param onUpdate - Callback fired when any job changes status
   * @returns Unsubscribe function
   */
  subscribeToJobUpdates(
    userId: string,
    onUpdate: (job: QueueJob) => void
  ): { unsubscribe: () => void } {
    if (!isSupabaseConfigured()) {
      logger.warn('Cannot subscribe to job updates - Supabase not configured');
      return { unsubscribe: () => {} };
    }

    const channelName = `queue-realtime-${userId}-${Date.now()}`;
    
    const channel = (supabase as any)
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*', // Listen to INSERT, UPDATE, DELETE
          schema: 'public',
          table: QUEUE_TABLE,
          filter: `user_id=eq.${userId}`
        },
        (payload: any) => {
          logger.debug('Realtime job update received', { 
            event: payload.eventType, 
            jobId: payload.new?.id 
          });
          
          if (payload.new) {
            const job = this.mapRowToJob(payload.new);
            onUpdate(job);
          }
        }
      )
      .subscribe((status: string) => {
        if (status === 'SUBSCRIBED') {
          logger.info(`Realtime subscription active for queue updates: ${channelName}`);
        } else if (status === 'CHANNEL_ERROR') {
          logger.error(`Realtime subscription error for ${channelName}`);
        }
      });

    return {
      unsubscribe: () => {
        logger.info(`Unsubscribing from ${channelName}`);
        (supabase as any).removeChannel(channel);
      }
    };
  }

  /**
   * Poll for job status (fallback for mobile/unreliable connections).
   * Use when Realtime is flaky or as a backup verification.
   * 
   * @param jobId - The job ID to check
   * @returns The current job state or null if not found
   */
  async pollJobStatus(jobId: string): Promise<QueueJob | null> {
    if (!isSupabaseConfigured()) {
      return this.pendingLocalJobs.find(j => j.id === jobId) || null;
    }

    try {
      const { data, error } = await (supabase as any)
        .from(QUEUE_TABLE)
        .select('*')
        .eq('id', jobId)
        .single();

      if (error) {
        logger.error('Failed to poll job status', { jobId, error });
        return null;
      }

      return data ? this.mapRowToJob(data) : null;
    } catch (e) {
      logger.error('Exception polling job status', { jobId, error: e });
      return null;
    }
  }

  /**
   * Poll for all pending/processing jobs for current user.
   * Useful for recovering UI state after page reload.
   */
  async pollActiveJobs(): Promise<QueueJob[]> {
    if (!isSupabaseConfigured() || !this.userId) {
      return this.pendingLocalJobs.filter(j => j.status === 'PENDING' || j.status === 'PROCESSING');
    }

    try {
      const { data, error } = await (supabase as any)
        .from(QUEUE_TABLE)
        .select('*')
        .eq('user_id', this.userId)
        .in('status', ['PENDING', 'PROCESSING'])
        .order('created_at', { ascending: false });

      if (error) {
        logger.error('Failed to poll active jobs', error);
        return [];
      }

      return (data || []).map((row: any) => this.mapRowToJob(row));
    } catch (e) {
      logger.error('Exception polling active jobs', e);
      return [];
    }
  }
}

// ============================================
// Singleton Export
// ============================================

export const processingQueueService = new ProcessingQueueService();

export default processingQueueService;
