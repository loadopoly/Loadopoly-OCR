/**
 * Batch Processor Service
 * 
 * A scalable, fault-tolerant batch processing engine designed for
 * large-scale document ingestion (100s-1000s of items).
 * 
 * Features:
 * - Configurable concurrency limits
 * - Automatic retry with exponential backoff
 * - Pause/Resume/Cancel capabilities
 * - Progress persistence across page reloads
 * - Memory-efficient chunked processing
 * - Real-time event callbacks for UI updates
 */

import { v4 as uuidv4 } from 'uuid';
import { ScanType } from '../types';

// ============================================
// Types
// ============================================

export type BatchItemStatus = 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'ERROR' | 'PAUSED' | 'CANCELLED';

export interface BatchItemState {
  id: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  status: BatchItemStatus;
  progress: number; // 0-100
  stage: string;
  errorMsg?: string;
  assetId?: string;
  scanType: ScanType;
  retryCount: number;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
}

export interface BatchProcessorConfig {
  maxConcurrent: number;
  maxRetries: number;
  retryDelayMs: number;
  processingTimeoutMs: number;
  autoStart: boolean;
  persistState: boolean;
}

export interface BatchStats {
  total: number;
  queued: number;
  processing: number;
  completed: number;
  failed: number;
  paused: number;
  avgProcessingTime: number;
  estimatedTimeRemaining: number;
  throughputPerMinute: number;
}

export interface BatchProcessorCallbacks {
  onItemQueued?: (item: BatchItemState) => void;
  onItemStarted?: (item: BatchItemState) => void;
  onItemProgress?: (item: BatchItemState) => void;
  onItemCompleted?: (item: BatchItemState) => void;
  onItemFailed?: (item: BatchItemState) => void;
  onBatchCompleted?: (stats: BatchStats) => void;
  onStateChange?: (state: BatchProcessorState) => void;
  onLog?: (message: string, level: 'info' | 'warn' | 'error') => void;
  // The actual processing function
  processItem: (file: File, itemId: string, scanType: ScanType, onProgress: (progress: number, stage: string) => void) => Promise<string | null>;
}

export type BatchProcessorState = 'IDLE' | 'RUNNING' | 'PAUSED' | 'STOPPING';

// ============================================
// Constants
// ============================================

const STORAGE_KEY = 'geograph-batch-processor-state';
const DEFAULT_CONFIG: BatchProcessorConfig = {
  maxConcurrent: 3,
  maxRetries: 3,
  retryDelayMs: 2000,
  processingTimeoutMs: 60000, // 60 seconds per item
  autoStart: true,
  persistState: true,
};

// ============================================
// Batch Processor Class
// ============================================

class BatchProcessorService {
  private items: Map<string, BatchItemState> = new Map();
  private files: Map<string, File> = new Map(); // Store files separately (can't persist)
  private config: BatchProcessorConfig = DEFAULT_CONFIG;
  private callbacks: Partial<BatchProcessorCallbacks> = {};
  private state: BatchProcessorState = 'IDLE';
  private processingSet: Set<string> = new Set();
  private completionTimes: number[] = [];
  private schedulerTimeout: NodeJS.Timeout | null = null;

  constructor() {
    this.loadPersistedState();
  }

  // ============================================
  // Public API
  // ============================================

  /**
   * Configure the batch processor
   */
  configure(config: Partial<BatchProcessorConfig>): void {
    this.config = { ...this.config, ...config };
    this.log(`Configuration updated: maxConcurrent=${this.config.maxConcurrent}`, 'info');
  }

  /**
   * Set callbacks for events
   */
  setCallbacks(callbacks: Partial<BatchProcessorCallbacks>): void {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }

  /**
   * Add files to the processing queue
   */
  addFiles(files: File[], scanType: ScanType = ScanType.DOCUMENT): BatchItemState[] {
    const newItems: BatchItemState[] = [];
    
    for (const file of files) {
      const id = uuidv4();
      const item: BatchItemState = {
        id,
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type,
        status: 'QUEUED',
        progress: 0,
        stage: 'Queued',
        scanType,
        retryCount: 0,
        createdAt: Date.now(),
      };
      
      this.items.set(id, item);
      this.files.set(id, file);
      newItems.push(item);
      this.callbacks.onItemQueued?.(item);
    }
    
    this.log(`Added ${files.length} files to queue. Total: ${this.items.size}`, 'info');
    this.persistState();
    this.callbacks.onStateChange?.(this.state);
    
    // Auto-start if configured
    if (this.config.autoStart && this.state === 'IDLE') {
      this.start();
    }
    
    return newItems;
  }

  /**
   * Start processing
   */
  start(): void {
    if (this.state === 'RUNNING') {
      this.log('Already running', 'warn');
      return;
    }
    
    this.state = 'RUNNING';
    this.callbacks.onStateChange?.(this.state);
    this.log('Batch processor started', 'info');
    this.scheduleNext();
  }

  /**
   * Pause processing (finish current items, don't start new ones)
   */
  pause(): void {
    if (this.state !== 'RUNNING') {
      this.log('Not running, cannot pause', 'warn');
      return;
    }
    
    this.state = 'PAUSED';
    this.callbacks.onStateChange?.(this.state);
    this.log(`Paused. ${this.processingSet.size} items still processing.`, 'info');
    
    if (this.schedulerTimeout) {
      clearTimeout(this.schedulerTimeout);
      this.schedulerTimeout = null;
    }
  }

  /**
   * Resume processing
   */
  resume(): void {
    if (this.state !== 'PAUSED') {
      this.log('Not paused, cannot resume', 'warn');
      return;
    }
    
    this.state = 'RUNNING';
    this.callbacks.onStateChange?.(this.state);
    this.log('Resumed processing', 'info');
    this.scheduleNext();
  }

  /**
   * Stop processing and cancel all queued items
   */
  stop(): void {
    this.state = 'STOPPING';
    this.callbacks.onStateChange?.(this.state);
    
    if (this.schedulerTimeout) {
      clearTimeout(this.schedulerTimeout);
      this.schedulerTimeout = null;
    }
    
    // Mark all queued items as cancelled
    for (const [id, item] of this.items) {
      if (item.status === 'QUEUED') {
        item.status = 'CANCELLED';
        this.items.set(id, item);
      }
    }
    
    this.log('Stopped. Waiting for in-progress items to complete.', 'info');
    this.persistState();
    
    // If nothing is processing, go to IDLE immediately
    if (this.processingSet.size === 0) {
      this.state = 'IDLE';
      this.callbacks.onStateChange?.(this.state);
    }
  }

  /**
   * Reset all stuck PROCESSING items back to QUEUED
   */
  resetStuck(): number {
    let resetCount = 0;
    
    for (const [id, item] of this.items) {
      if (item.status === 'PROCESSING' && !this.processingSet.has(id)) {
        item.status = 'QUEUED';
        item.progress = 0;
        item.stage = 'Queued (Reset)';
        item.retryCount = 0;
        this.items.set(id, item);
        resetCount++;
      }
    }
    
    if (resetCount > 0) {
      this.log(`Reset ${resetCount} stuck items`, 'info');
      this.persistState();
      
      // Auto-start if we were idle
      if (this.state === 'IDLE' && this.config.autoStart) {
        this.start();
      }
    }
    
    return resetCount;
  }

  /**
   * Retry failed items
   */
  retryFailed(): number {
    let retryCount = 0;
    
    for (const [id, item] of this.items) {
      if (item.status === 'ERROR') {
        item.status = 'QUEUED';
        item.progress = 0;
        item.stage = 'Queued (Retry)';
        item.errorMsg = undefined;
        this.items.set(id, item);
        retryCount++;
      }
    }
    
    if (retryCount > 0) {
      this.log(`Retrying ${retryCount} failed items`, 'info');
      this.persistState();
      
      if (this.state === 'IDLE' && this.config.autoStart) {
        this.start();
      }
    }
    
    return retryCount;
  }

  /**
   * Clear completed items from the queue
   */
  clearCompleted(): number {
    let clearCount = 0;
    
    for (const [id, item] of this.items) {
      if (item.status === 'COMPLETED' || item.status === 'CANCELLED') {
        this.items.delete(id);
        this.files.delete(id);
        clearCount++;
      }
    }
    
    if (clearCount > 0) {
      this.log(`Cleared ${clearCount} completed items`, 'info');
      this.persistState();
    }
    
    return clearCount;
  }

  /**
   * Clear all items and reset
   */
  clearAll(): void {
    this.stop();
    this.items.clear();
    this.files.clear();
    this.processingSet.clear();
    this.completionTimes = [];
    this.state = 'IDLE';
    this.persistState();
    this.callbacks.onStateChange?.(this.state);
    this.log('Cleared all items', 'info');
  }

  /**
   * Get current stats
   */
  getStats(): BatchStats {
    let queued = 0, processing = 0, completed = 0, failed = 0, paused = 0;
    
    for (const item of this.items.values()) {
      switch (item.status) {
        case 'QUEUED': queued++; break;
        case 'PROCESSING': processing++; break;
        case 'COMPLETED': completed++; break;
        case 'ERROR': failed++; break;
        case 'PAUSED': paused++; break;
      }
    }
    
    const avgTime = this.completionTimes.length > 0
      ? this.completionTimes.reduce((a, b) => a + b, 0) / this.completionTimes.length
      : 30000; // Default estimate: 30 seconds
    
    const remaining = queued + processing;
    const estimatedTimeRemaining = remaining > 0
      ? (remaining / this.config.maxConcurrent) * avgTime
      : 0;
    
    const recentCompletions = this.completionTimes.filter(t => t < 60000).length;
    const throughputPerMinute = recentCompletions > 0
      ? (60000 / (this.completionTimes.slice(-10).reduce((a, b) => a + b, 0) / Math.min(10, this.completionTimes.length))) * this.config.maxConcurrent
      : 0;
    
    return {
      total: this.items.size,
      queued,
      processing,
      completed,
      failed,
      paused,
      avgProcessingTime: avgTime,
      estimatedTimeRemaining,
      throughputPerMinute,
    };
  }

  /**
   * Get all items as array
   */
  getItems(): BatchItemState[] {
    return Array.from(this.items.values()).sort((a, b) => {
      // Sort: Processing first, then Queued, then Completed, then Error
      const statusOrder = { PROCESSING: 0, QUEUED: 1, PAUSED: 2, COMPLETED: 3, ERROR: 4, CANCELLED: 5 };
      return (statusOrder[a.status] || 99) - (statusOrder[b.status] || 99);
    });
  }

  /**
   * Get current state
   */
  getState(): BatchProcessorState {
    return this.state;
  }

  // ============================================
  // Private Methods
  // ============================================

  private scheduleNext(): void {
    if (this.state !== 'RUNNING') return;
    
    // Clear any existing timeout
    if (this.schedulerTimeout) {
      clearTimeout(this.schedulerTimeout);
    }
    
    // Check if we can start more items
    const availableSlots = this.config.maxConcurrent - this.processingSet.size;
    if (availableSlots <= 0) {
      // Schedule retry
      this.schedulerTimeout = setTimeout(() => this.scheduleNext(), 500);
      return;
    }
    
    // Find queued items to process
    const queuedItems: BatchItemState[] = [];
    for (const item of this.items.values()) {
      if (item.status === 'QUEUED' && queuedItems.length < availableSlots) {
        queuedItems.push(item);
      }
    }
    
    if (queuedItems.length === 0) {
      // Check if everything is done
      if (this.processingSet.size === 0) {
        this.state = 'IDLE';
        this.callbacks.onStateChange?.(this.state);
        this.callbacks.onBatchCompleted?.(this.getStats());
        this.log('Batch processing complete!', 'info');
      } else {
        // Still waiting for in-progress items
        this.schedulerTimeout = setTimeout(() => this.scheduleNext(), 500);
      }
      return;
    }
    
    // Start processing items
    for (const item of queuedItems) {
      this.processItem(item);
    }
    
    // Schedule next check
    this.schedulerTimeout = setTimeout(() => this.scheduleNext(), 200);
  }

  private async processItem(item: BatchItemState): Promise<void> {
    const file = this.files.get(item.id);
    if (!file) {
      this.log(`File not found for item ${item.id}`, 'error');
      item.status = 'ERROR';
      item.errorMsg = 'File data lost (page was refreshed?)';
      this.items.set(item.id, item);
      this.callbacks.onItemFailed?.(item);
      return;
    }
    
    // Mark as processing
    item.status = 'PROCESSING';
    item.progress = 5;
    item.stage = 'Starting';
    item.startedAt = Date.now();
    this.items.set(item.id, item);
    this.processingSet.add(item.id);
    this.callbacks.onItemStarted?.(item);
    this.persistState();
    
    this.log(`Processing: ${item.fileName}`, 'info');
    
    try {
      // Create timeout promise
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Processing timeout')), this.config.processingTimeoutMs);
      });
      
      // Progress callback
      const onProgress = (progress: number, stage: string) => {
        item.progress = Math.min(95, progress);
        item.stage = stage;
        this.items.set(item.id, item);
        this.callbacks.onItemProgress?.(item);
      };
      
      // Race between processing and timeout
      if (!this.callbacks.processItem) {
        throw new Error('No processItem callback configured');
      }
      
      const assetId = await Promise.race([
        this.callbacks.processItem(file, item.id, item.scanType, onProgress),
        timeoutPromise,
      ]);
      
      // Success!
      const processingTime = Date.now() - (item.startedAt || Date.now());
      this.completionTimes.push(processingTime);
      if (this.completionTimes.length > 50) {
        this.completionTimes.shift(); // Keep only last 50
      }
      
      item.status = 'COMPLETED';
      item.progress = 100;
      item.stage = 'Complete';
      item.assetId = assetId || undefined;
      item.completedAt = Date.now();
      this.items.set(item.id, item);
      this.processingSet.delete(item.id);
      this.callbacks.onItemCompleted?.(item);
      this.log(`Completed: ${item.fileName} (${(processingTime / 1000).toFixed(1)}s)`, 'info');
      
    } catch (error: any) {
      this.processingSet.delete(item.id);
      
      // Check if we should retry
      if (item.retryCount < this.config.maxRetries) {
        item.retryCount++;
        item.status = 'QUEUED';
        item.progress = 0;
        item.stage = `Retry ${item.retryCount}/${this.config.maxRetries}`;
        this.items.set(item.id, item);
        this.log(`Retry ${item.retryCount}/${this.config.maxRetries}: ${item.fileName} - ${error.message}`, 'warn');
        
        // Delay before retry
        await new Promise(resolve => setTimeout(resolve, this.config.retryDelayMs * item.retryCount));
      } else {
        item.status = 'ERROR';
        item.progress = 0;
        item.stage = 'Failed';
        item.errorMsg = error.message || 'Unknown error';
        this.items.set(item.id, item);
        this.callbacks.onItemFailed?.(item);
        this.log(`Failed: ${item.fileName} - ${error.message}`, 'error');
      }
    }
    
    this.persistState();
    
    // Check if we're stopping
    if (this.state === 'STOPPING' && this.processingSet.size === 0) {
      this.state = 'IDLE';
      this.callbacks.onStateChange?.(this.state);
    }
  }

  private persistState(): void {
    if (!this.config.persistState) return;
    
    try {
      const state = {
        items: Array.from(this.items.entries()),
        config: this.config,
        completionTimes: this.completionTimes.slice(-20),
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      // Storage quota exceeded or unavailable
    }
  }

  private loadPersistedState(): void {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const state = JSON.parse(stored);
        
        // Restore items (but mark PROCESSING as stuck since files are lost)
        if (state.items) {
          for (const [id, item] of state.items) {
            if (item.status === 'PROCESSING') {
              item.status = 'ERROR';
              item.errorMsg = 'Processing interrupted (refresh files to retry)';
            }
            // Don't restore QUEUED items since files are lost
            if (item.status === 'COMPLETED' || item.status === 'ERROR') {
              this.items.set(id, item);
            }
          }
        }
        
        if (state.completionTimes) {
          this.completionTimes = state.completionTimes;
        }
        
        this.log(`Restored ${this.items.size} items from previous session`, 'info');
      }
    } catch (e) {
      // Invalid stored state
    }
  }

  private log(message: string, level: 'info' | 'warn' | 'error'): void {
    const prefix = '[BatchProcessor]';
    switch (level) {
      case 'error': console.error(prefix, message); break;
      case 'warn': console.warn(prefix, message); break;
      default: console.log(prefix, message);
    }
    this.callbacks.onLog?.(message, level);
  }
}

// ============================================
// Singleton Export
// ============================================

export const batchProcessor = new BatchProcessorService();
export default batchProcessor;
