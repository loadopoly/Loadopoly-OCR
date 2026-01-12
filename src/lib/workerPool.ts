/**
 * Worker Pool Manager
 * 
 * Manages a pool of Web Workers for parallel processing.
 * Features:
 * - Dynamic worker allocation based on task load
 * - Task queuing with priority support
 * - Automatic worker recycling
 * - Progress tracking and cancellation
 * - Circuit breaker pattern for error handling
 * 
 * Usage:
 * ```typescript
 * const pool = new WorkerPool('./parallelWorker.ts', { maxWorkers: 4 });
 * const result = await pool.execute('similarity', { textA: '...', textB: '...' });
 * pool.terminate();
 * ```
 */

import { logger } from './logger';

// ============================================
// Types
// ============================================

export interface WorkerPoolOptions {
  /** Maximum number of workers (default: navigator.hardwareConcurrency || 4) */
  maxWorkers?: number;
  /** Minimum workers to keep alive (default: 1) */
  minWorkers?: number;
  /** Task timeout in ms (default: 30000) */
  taskTimeout?: number;
  /** Worker idle timeout before termination (default: 60000) */
  idleTimeout?: number;
  /** Maximum retries per task (default: 2) */
  maxRetries?: number;
  /** Circuit breaker error threshold (default: 5) */
  errorThreshold?: number;
  /** Circuit breaker reset time in ms (default: 30000) */
  circuitResetTime?: number;
}

export interface TaskOptions<T = unknown> {
  /** Task priority (higher = more urgent) */
  priority?: number;
  /** Task-specific timeout override */
  timeout?: number;
  /** Progress callback */
  onProgress?: (progress: number) => void;
  /** Abort signal for cancellation */
  signal?: AbortSignal;
}

interface QueuedTask<T = unknown> {
  id: string;
  type: string;
  payload: unknown;
  priority: number;
  timeout: number;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
  onProgress?: (progress: number) => void;
  signal?: AbortSignal;
  retries: number;
  queuedAt: number;
}

interface WorkerState {
  worker: Worker;
  busy: boolean;
  currentTaskId: string | null;
  lastUsed: number;
  errorCount: number;
}

// ============================================
// Worker Pool Class
// ============================================

export class WorkerPool {
  private workerUrl: URL;
  private options: Required<WorkerPoolOptions>;
  private workers: Map<number, WorkerState> = new Map();
  private taskQueue: QueuedTask[] = [];
  private nextWorkerId = 0;
  private nextTaskId = 0;
  private circuitOpen = false;
  private circuitErrors = 0;
  private circuitLastError = 0;
  private idleCheckInterval: number | null = null;
  private isTerminated = false;

  constructor(workerPath: string, options: WorkerPoolOptions = {}) {
    this.workerUrl = new URL(workerPath, import.meta.url);
    this.options = {
      maxWorkers: options.maxWorkers ?? (navigator.hardwareConcurrency || 4),
      minWorkers: options.minWorkers ?? 1,
      taskTimeout: options.taskTimeout ?? 30000,
      idleTimeout: options.idleTimeout ?? 60000,
      maxRetries: options.maxRetries ?? 2,
      errorThreshold: options.errorThreshold ?? 5,
      circuitResetTime: options.circuitResetTime ?? 30000,
    };

    // Initialize minimum workers
    for (let i = 0; i < this.options.minWorkers; i++) {
      this.createWorker();
    }

    // Start idle worker cleanup
    this.idleCheckInterval = window.setInterval(
      () => this.cleanupIdleWorkers(),
      10000
    );
  }

  /**
   * Execute a task in the worker pool
   */
  async execute<T = unknown>(
    type: string,
    payload: unknown,
    options: TaskOptions<T> = {}
  ): Promise<T> {
    if (this.isTerminated) {
      throw new Error('Worker pool has been terminated');
    }

    // Check circuit breaker
    if (this.circuitOpen) {
      if (Date.now() - this.circuitLastError > this.options.circuitResetTime) {
        this.circuitOpen = false;
        this.circuitErrors = 0;
        logger.info('Worker pool circuit breaker reset');
      } else {
        throw new Error('Worker pool circuit breaker is open');
      }
    }

    const taskId = `task_${this.nextTaskId++}`;

    return new Promise<T>((resolve, reject) => {
      const task: QueuedTask<T> = {
        id: taskId,
        type,
        payload,
        priority: options.priority ?? 5,
        timeout: options.timeout ?? this.options.taskTimeout,
        resolve: resolve as (value: unknown) => void,
        reject,
        onProgress: options.onProgress,
        signal: options.signal,
        retries: 0,
        queuedAt: Date.now(),
      };

      // Handle abort signal
      if (options.signal) {
        options.signal.addEventListener('abort', () => {
          this.cancelTask(taskId);
          reject(new Error('Task cancelled'));
        });
      }

      // Add to queue (sorted by priority)
      this.enqueue(task);
      this.processQueue();
    });
  }

  /**
   * Execute multiple tasks in parallel
   */
  async executeAll<T = unknown>(
    tasks: Array<{ type: string; payload: unknown }>,
    options: TaskOptions<T> = {}
  ): Promise<T[]> {
    return Promise.all(
      tasks.map(task => this.execute<T>(task.type, task.payload, options))
    );
  }

  /**
   * Execute tasks with controlled concurrency
   */
  async executeBatch<T = unknown>(
    tasks: Array<{ type: string; payload: unknown }>,
    options: TaskOptions<T> & { concurrency?: number } = {}
  ): Promise<T[]> {
    const concurrency = options.concurrency ?? this.options.maxWorkers;
    const results: T[] = [];
    const executing: Promise<void>[] = [];

    for (const task of tasks) {
      const promise = this.execute<T>(task.type, task.payload, options)
        .then(result => {
          results.push(result);
        });

      executing.push(promise);

      if (executing.length >= concurrency) {
        await Promise.race(executing);
        // Remove completed promises
        const completed = executing.findIndex(p => 
          p === promise || (p as any).status === 'fulfilled'
        );
        if (completed >= 0) {
          executing.splice(completed, 1);
        }
      }
    }

    await Promise.all(executing);
    return results;
  }

  /**
   * Get pool statistics
   */
  getStats(): {
    totalWorkers: number;
    busyWorkers: number;
    queueLength: number;
    circuitOpen: boolean;
  } {
    let busyWorkers = 0;
    this.workers.forEach(state => {
      if (state.busy) busyWorkers++;
    });

    return {
      totalWorkers: this.workers.size,
      busyWorkers,
      queueLength: this.taskQueue.length,
      circuitOpen: this.circuitOpen,
    };
  }

  /**
   * Terminate all workers and cleanup
   */
  terminate(): void {
    this.isTerminated = true;

    if (this.idleCheckInterval !== null) {
      clearInterval(this.idleCheckInterval);
    }

    // Reject all queued tasks
    for (const task of this.taskQueue) {
      task.reject(new Error('Worker pool terminated'));
    }
    this.taskQueue = [];

    // Terminate all workers
    this.workers.forEach(state => {
      state.worker.terminate();
    });
    this.workers.clear();

    logger.debug('Worker pool terminated');
  }

  // ============================================
  // Private Methods
  // ============================================

  private createWorker(): WorkerState {
    const workerId = this.nextWorkerId++;
    const worker = new Worker(this.workerUrl, { type: 'module' });

    const state: WorkerState = {
      worker,
      busy: false,
      currentTaskId: null,
      lastUsed: Date.now(),
      errorCount: 0,
    };

    worker.onmessage = (event) => {
      this.handleWorkerMessage(workerId, event.data);
    };

    worker.onerror = (error) => {
      this.handleWorkerError(workerId, error);
    };

    this.workers.set(workerId, state);
    logger.debug(`Worker ${workerId} created`);

    return state;
  }

  private enqueue(task: QueuedTask): void {
    // Insert in priority order (higher priority first)
    const insertIndex = this.taskQueue.findIndex(t => t.priority < task.priority);
    if (insertIndex === -1) {
      this.taskQueue.push(task);
    } else {
      this.taskQueue.splice(insertIndex, 0, task);
    }
  }

  private processQueue(): void {
    if (this.taskQueue.length === 0) return;

    // Find available worker
    let availableWorker: [number, WorkerState] | null = null;
    for (const [id, state] of this.workers) {
      if (!state.busy) {
        availableWorker = [id, state];
        break;
      }
    }

    // Create new worker if needed and under limit
    if (!availableWorker && this.workers.size < this.options.maxWorkers) {
      const state = this.createWorker();
      availableWorker = [this.nextWorkerId - 1, state];
    }

    if (!availableWorker) return;

    const [workerId, workerState] = availableWorker;
    const task = this.taskQueue.shift()!;

    // Check if task was cancelled
    if (task.signal?.aborted) {
      task.reject(new Error('Task cancelled'));
      this.processQueue();
      return;
    }

    // Assign task to worker
    workerState.busy = true;
    workerState.currentTaskId = task.id;
    workerState.lastUsed = Date.now();

    // Set timeout
    const timeoutId = setTimeout(() => {
      this.handleTaskTimeout(workerId, task);
    }, task.timeout);

    // Store timeout for cleanup
    (task as any).timeoutId = timeoutId;

    // Send task to worker
    workerState.worker.postMessage({
      type: task.type,
      id: task.id,
      payload: task.payload,
    });

    logger.debug(`Task ${task.id} assigned to worker ${workerId}`);
  }

  private handleWorkerMessage(workerId: number, message: any): void {
    const workerState = this.workers.get(workerId);
    if (!workerState) return;

    const task = this.findTask(message.id);
    if (!task) return;

    switch (message.type) {
      case 'result':
        clearTimeout((task as any).timeoutId);
        workerState.busy = false;
        workerState.currentTaskId = null;
        workerState.errorCount = 0;
        task.resolve(message.data);
        break;

      case 'error':
        clearTimeout((task as any).timeoutId);
        this.handleTaskError(workerId, task, new Error(message.error));
        break;

      case 'progress':
        task.onProgress?.(message.progress);
        break;
    }

    this.processQueue();
  }

  private handleWorkerError(workerId: number, error: ErrorEvent): void {
    const workerState = this.workers.get(workerId);
    if (!workerState) return;

    workerState.errorCount++;
    logger.error(`Worker ${workerId} error: ${error.message}`);

    // Find current task and handle error
    if (workerState.currentTaskId) {
      const task = this.findTask(workerState.currentTaskId);
      if (task) {
        this.handleTaskError(workerId, task, new Error(error.message));
      }
    }

    // Replace worker if too many errors
    if (workerState.errorCount >= 3) {
      this.replaceWorker(workerId);
    }
  }

  private handleTaskError(workerId: number, task: QueuedTask, error: Error): void {
    const workerState = this.workers.get(workerId);
    if (workerState) {
      workerState.busy = false;
      workerState.currentTaskId = null;
    }

    // Retry logic
    if (task.retries < this.options.maxRetries) {
      task.retries++;
      logger.debug(`Retrying task ${task.id} (attempt ${task.retries})`);
      this.enqueue(task);
    } else {
      this.recordCircuitError();
      task.reject(error);
    }

    this.processQueue();
  }

  private handleTaskTimeout(workerId: number, task: QueuedTask): void {
    logger.warn(`Task ${task.id} timed out on worker ${workerId}`);
    this.handleTaskError(workerId, task, new Error('Task timeout'));
    this.replaceWorker(workerId);
  }

  private findTask(taskId: string): QueuedTask | undefined {
    // First check current running tasks
    for (const state of this.workers.values()) {
      if (state.currentTaskId === taskId) {
        // Task is running, find it in our tracking
        return (state as any).currentTask;
      }
    }
    
    // Check queue
    return this.taskQueue.find(t => t.id === taskId);
  }

  private cancelTask(taskId: string): void {
    // Remove from queue if present
    const index = this.taskQueue.findIndex(t => t.id === taskId);
    if (index >= 0) {
      this.taskQueue.splice(index, 1);
    }
  }

  private replaceWorker(workerId: number): void {
    const workerState = this.workers.get(workerId);
    if (workerState) {
      workerState.worker.terminate();
      this.workers.delete(workerId);
      logger.debug(`Worker ${workerId} terminated and replaced`);
    }

    // Create replacement if needed
    if (this.workers.size < this.options.minWorkers) {
      this.createWorker();
    }
  }

  private cleanupIdleWorkers(): void {
    const now = Date.now();
    const toRemove: number[] = [];

    this.workers.forEach((state, id) => {
      if (
        !state.busy &&
        now - state.lastUsed > this.options.idleTimeout &&
        this.workers.size > this.options.minWorkers
      ) {
        toRemove.push(id);
      }
    });

    for (const id of toRemove) {
      const state = this.workers.get(id);
      if (state) {
        state.worker.terminate();
        this.workers.delete(id);
        logger.debug(`Idle worker ${id} terminated`);
      }
    }
  }

  private recordCircuitError(): void {
    this.circuitErrors++;
    this.circuitLastError = Date.now();

    if (this.circuitErrors >= this.options.errorThreshold) {
      this.circuitOpen = true;
      logger.warn('Worker pool circuit breaker opened');
    }
  }
}

// ============================================
// Default Pool Instance
// ============================================

let defaultPool: WorkerPool | null = null;

export function getDefaultPool(): WorkerPool {
  if (!defaultPool) {
    defaultPool = new WorkerPool('./workers/parallelWorker.ts');
  }
  return defaultPool;
}

export function terminateDefaultPool(): void {
  if (defaultPool) {
    defaultPool.terminate();
    defaultPool = null;
  }
}

export default WorkerPool;
