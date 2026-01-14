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
    
    if (!isSupabaseConfigured()) {
      logger.warn('Supabase not configured, queue service will operate in offline mode');
      return;
    }
    
    // Subscribe to user's job updates
    await this.subscribeToUserJobs();
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
    
    // If offline or Supabase not configured, queue locally
    if (!this.isOnline || !isSupabaseConfigured()) {
      return this.queueLocally(assetId, fileToUpload, options);
    }
    
    try {
      // Upload to Supabase Storage
      const imagePath = await this.uploadToStorage(assetId, fileToUpload);
      
      // Insert job into queue
      const job = await this.insertJob({
        assetId,
        imagePath,
        scanType,
        priority,
        location: options.location,
        metadata: options.metadata,
      });
      
      this.callbacks.onJobQueued?.(job);
      
      return job;
    } catch (error) {
      logger.error('Failed to queue file', error);
      // Fallback to local queue
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
   * Get current queue stats
   */
  async getStats(): Promise<QueueStats> {
    if (!isSupabaseConfigured() || !this.userId || ! ( (supabase as any))) {
      return {
        pending: this.pendingLocalJobs.filter(j => j.status === 'PENDING').length,
        processing: this.pendingLocalJobs.filter(j => j.status === 'PROCESSING').length,
        completed: 0,
        failed: this.pendingLocalJobs.filter(j => j.status === 'FAILED').length,
        avgProcessingTime: 0,
      };
    }
    
    try {
      const { data, error } = await ( (supabase as any))
        .from('queue_stats')
        .select('*');
      
      if (error) throw error;
      
      const stats: QueueStats = {
        pending: 0,
        processing: 0,
        completed: 0,
        failed: 0,
        avgProcessingTime: 0,
      };
      
      data?.forEach((row: any) => {
        const status = row.status?.toLowerCase() as keyof QueueStats;
        if (status in stats) {
          (stats as any)[status] = row.count;
        }
      });
      
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
    if (!isSupabaseConfigured() || !this.userId) {
      return this.pendingLocalJobs;
    }
    
    let query =  ( (supabase as any))
      .from(QUEUE_TABLE)
      .select('*')
      .eq('USER_ID', this.userId)
      .order('CREATED_AT', { ascending: false });
    
    if (options.status?.length) {
      query = query.in('STATUS', options.status);
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
    
    const { data, error } = await ( (supabase as any))
      .from(QUEUE_TABLE)
      .select('*')
      .eq('ID', jobId)
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
    
    const { error } = await  ( (supabase as any))
      .from(QUEUE_TABLE)
      .update({ STATUS: 'CANCELLED', UPDATED_AT: new Date().toISOString() })
      .eq('ID', jobId)
      .eq('STATUS', 'PENDING');
    
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
    
    const { error } = await  ( (supabase as any))
      .from(QUEUE_TABLE)
      .update({
        STATUS: 'PENDING',
        RETRY_COUNT: 0,
        LAST_ERROR: null,
        ERROR_CODE: null,
        UPDATED_AT: new Date().toISOString(),
      })
      .eq('ID', jobId)
      .eq('STATUS', 'FAILED');
    
    if (error) {
      logger.error('Failed to retry job', error);
      return false;
    }
    
    return true;
  }

  /**
   * Cleanup completed jobs older than specified days
   */
  async cleanup(daysOld: number = 7): Promise<number> {
    if (!isSupabaseConfigured()) {
      return 0;
    }
    
    const { data, error } = await  ( (supabase as any))
      .rpc('cleanup_completed_jobs', { p_days_old: daysOld });
    
    if (error) {
      logger.error('Failed to cleanup jobs', error);
      return 0;
    }
    
    return data || 0;
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
    
    const { error } = await  ( (supabase as any)).storage
      .from(STORAGE_BUCKET)
      .upload(path, file, {
        cacheControl: '3600',
        upsert: false,
      });
    
    if (error) {
      throw new Error(`Storage upload failed: ${error.message}`);
    }
    
    return path;
  }

  private async insertJob(params: {
    assetId: string;
    imagePath: string;
    scanType: ScanType;
    priority: number;
    location?: { lat: number; lng: number };
    metadata?: Record<string, unknown>;
  }): Promise<QueueJob> {
    const { data, error } = await  ( (supabase as any))
      .from(QUEUE_TABLE)
      .insert({
        USER_ID: this.userId,
        ASSET_ID: params.assetId,
        IMAGE_PATH: params.imagePath,
        SCAN_TYPE: params.scanType,
        PRIORITY: params.priority,
        LATITUDE: params.location?.lat,
        LONGITUDE: params.location?.lng,
        METADATA: params.metadata || {},
        STATUS: 'PENDING',
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

  private async subscribeToUserJobs(): Promise<void> {
    if (!this.userId || this.subscriptions.has('user-jobs')) {
      return;
    }
    
    try {
      const channel =  ( (supabase as any))
        .channel(`queue:${this.userId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: QUEUE_TABLE,
            filter: `USER_ID=eq.${this.userId}`,
          },
          (payload: any) => {
            logger.debug('Job update received', { 
              jobId: payload.new?.ID, 
              status: payload.new?.STATUS,
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
      id: row.ID,
      assetId: row.ASSET_ID,
      imagePath: row.IMAGE_PATH,
      scanType: row.SCAN_TYPE as ScanType,
      status: row.STATUS as JobStatus,
      progress: row.PROGRESS || 0,
      stage: row.STAGE || 'UNKNOWN',
      priority: row.PRIORITY || 5,
      retryCount: row.RETRY_COUNT || 0,
      error: row.LAST_ERROR,
      resultData: row.RESULT_DATA,
      createdAt: new Date(row.CREATED_AT),
      startedAt: row.STARTED_AT ? new Date(row.STARTED_AT) : undefined,
      completedAt: row.COMPLETED_AT ? new Date(row.COMPLETED_AT) : undefined,
      location: row.LATITUDE && row.LONGITUDE
        ? { lat: row.LATITUDE, lng: row.LONGITUDE }
        : undefined,
    };
  }
}

// ============================================
// Singleton Export
// ============================================

export const processingQueueService = new ProcessingQueueService();

export default processingQueueService;
