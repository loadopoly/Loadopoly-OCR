/**
 * Circuit Breaker Pattern Implementation
 * 
 * Prevents cascading failures by wrapping potentially failing operations.
 * States:
 * - CLOSED: Normal operation, requests pass through
 * - OPEN: Failure threshold exceeded, requests fail fast
 * - HALF_OPEN: Testing if service recovered
 * 
 * Usage:
 * ```typescript
 * const breaker = new CircuitBreaker({
 *   failureThreshold: 5,
 *   recoveryTimeout: 30000,
 * });
 * 
 * const result = await breaker.execute(() => callExternalAPI());
 * ```
 */

import { logger } from './logger';

// ============================================
// Types
// ============================================

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerOptions {
  /** Number of failures before opening circuit (default: 5) */
  failureThreshold?: number;
  /** Time in ms before attempting recovery (default: 30000) */
  recoveryTimeout?: number;
  /** Time window for counting failures in ms (default: 60000) */
  failureWindow?: number;
  /** Timeout for individual requests in ms (default: 10000) */
  requestTimeout?: number;
  /** Number of successful calls in HALF_OPEN to close circuit (default: 3) */
  successThreshold?: number;
  /** Called when circuit opens */
  onOpen?: (error: Error) => void;
  /** Called when circuit closes */
  onClose?: () => void;
  /** Called when circuit enters half-open state */
  onHalfOpen?: () => void;
  /** Fallback function when circuit is open */
  fallback?: <T>() => T | Promise<T>;
}

export interface CircuitStats {
  state: CircuitState;
  failures: number;
  successes: number;
  lastFailure: Date | null;
  lastSuccess: Date | null;
  totalRequests: number;
  totalFailures: number;
  totalSuccesses: number;
}

// ============================================
// Circuit Breaker Class
// ============================================

export class CircuitBreaker {
  private state: CircuitState = 'CLOSED';
  private failures: number = 0;
  private successes: number = 0;
  private lastFailureTime: number = 0;
  private lastSuccessTime: number = 0;
  private failureTimestamps: number[] = [];
  private totalRequests: number = 0;
  private totalFailures: number = 0;
  private totalSuccesses: number = 0;
  private options: Required<Omit<CircuitBreakerOptions, 'fallback' | 'onOpen' | 'onClose' | 'onHalfOpen'>> & 
    Pick<CircuitBreakerOptions, 'fallback' | 'onOpen' | 'onClose' | 'onHalfOpen'>;

  constructor(options: CircuitBreakerOptions = {}) {
    this.options = {
      failureThreshold: options.failureThreshold ?? 5,
      recoveryTimeout: options.recoveryTimeout ?? 30000,
      failureWindow: options.failureWindow ?? 60000,
      requestTimeout: options.requestTimeout ?? 10000,
      successThreshold: options.successThreshold ?? 3,
      onOpen: options.onOpen,
      onClose: options.onClose,
      onHalfOpen: options.onHalfOpen,
      fallback: options.fallback,
    };
  }

  /**
   * Execute a function with circuit breaker protection
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    this.totalRequests++;

    // Check if we should transition from OPEN to HALF_OPEN
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime >= this.options.recoveryTimeout) {
        this.transitionTo('HALF_OPEN');
      } else {
        // Circuit is open, fail fast
        if (this.options.fallback) {
          return this.options.fallback();
        }
        throw new CircuitOpenError('Circuit breaker is open');
      }
    }

    try {
      // Execute with timeout
      const result = await this.executeWithTimeout(fn);
      this.recordSuccess();
      return result;
    } catch (error) {
      this.recordFailure(error as Error);
      throw error;
    }
  }

  /**
   * Get current circuit statistics
   */
  getStats(): CircuitStats {
    return {
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      lastFailure: this.lastFailureTime ? new Date(this.lastFailureTime) : null,
      lastSuccess: this.lastSuccessTime ? new Date(this.lastSuccessTime) : null,
      totalRequests: this.totalRequests,
      totalFailures: this.totalFailures,
      totalSuccesses: this.totalSuccesses,
    };
  }

  /**
   * Manually reset the circuit breaker
   */
  reset(): void {
    this.state = 'CLOSED';
    this.failures = 0;
    this.successes = 0;
    this.failureTimestamps = [];
    logger.debug('Circuit breaker manually reset');
  }

  /**
   * Check if circuit is allowing requests
   */
  isAvailable(): boolean {
    if (this.state === 'CLOSED') return true;
    if (this.state === 'HALF_OPEN') return true;
    
    // Check if recovery timeout has passed
    if (Date.now() - this.lastFailureTime >= this.options.recoveryTimeout) {
      return true;
    }
    
    return false;
  }

  // ============================================
  // Private Methods
  // ============================================

  private async executeWithTimeout<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new TimeoutError('Request timeout'));
      }, this.options.requestTimeout);

      fn()
        .then((result) => {
          clearTimeout(timeoutId);
          resolve(result);
        })
        .catch((error) => {
          clearTimeout(timeoutId);
          reject(error);
        });
    });
  }

  private recordSuccess(): void {
    this.totalSuccesses++;
    this.lastSuccessTime = Date.now();

    if (this.state === 'HALF_OPEN') {
      this.successes++;
      
      if (this.successes >= this.options.successThreshold) {
        this.transitionTo('CLOSED');
      }
    } else if (this.state === 'CLOSED') {
      // Reset failure count on success
      this.failures = 0;
      this.cleanupOldFailures();
    }
  }

  private recordFailure(error: Error): void {
    this.totalFailures++;
    this.lastFailureTime = Date.now();
    this.failureTimestamps.push(Date.now());

    if (this.state === 'HALF_OPEN') {
      // Single failure in HALF_OPEN reopens the circuit
      this.transitionTo('OPEN', error);
    } else if (this.state === 'CLOSED') {
      this.cleanupOldFailures();
      this.failures = this.failureTimestamps.length;

      if (this.failures >= this.options.failureThreshold) {
        this.transitionTo('OPEN', error);
      }
    }
  }

  private cleanupOldFailures(): void {
    const cutoff = Date.now() - this.options.failureWindow;
    this.failureTimestamps = this.failureTimestamps.filter(t => t > cutoff);
  }

  private transitionTo(newState: CircuitState, error?: Error): void {
    const oldState = this.state;
    this.state = newState;

    logger.debug(`Circuit breaker: ${oldState} → ${newState}`);

    switch (newState) {
      case 'OPEN':
        this.failures = 0;
        this.successes = 0;
        this.options.onOpen?.(error!);
        break;
      case 'CLOSED':
        this.failures = 0;
        this.successes = 0;
        this.failureTimestamps = [];
        this.options.onClose?.();
        break;
      case 'HALF_OPEN':
        this.successes = 0;
        this.options.onHalfOpen?.();
        break;
    }
  }
}

// ============================================
// Custom Errors
// ============================================

export class CircuitOpenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CircuitOpenError';
  }
}

export class TimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TimeoutError';
  }
}

// ============================================
// Utility Functions
// ============================================

/**
 * Create a circuit breaker for API calls with sensible defaults
 */
export function createApiCircuitBreaker(
  name: string,
  options: Partial<CircuitBreakerOptions> = {}
): CircuitBreaker {
  return new CircuitBreaker({
    failureThreshold: 5,
    recoveryTimeout: 30000,
    requestTimeout: 15000,
    ...options,
    onOpen: (error) => {
      logger.warn(`Circuit breaker "${name}" opened`, { error: error.message });
      options.onOpen?.(error);
    },
    onClose: () => {
      logger.info(`Circuit breaker "${name}" closed`);
      options.onClose?.();
    },
    onHalfOpen: () => {
      logger.info(`Circuit breaker "${name}" testing recovery`);
      options.onHalfOpen?.();
    },
  });
}

/**
 * Wrap an async function with circuit breaker protection
 */
export function withCircuitBreaker<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  breaker: CircuitBreaker
): T {
  return ((...args: Parameters<T>) => {
    return breaker.execute(() => fn(...args));
  }) as T;
}

// ============================================
// Pre-configured Circuit Breakers
// ============================================

// Gemini API circuit breaker
export const geminiCircuitBreaker = createApiCircuitBreaker('gemini', {
  failureThreshold: 3,
  recoveryTimeout: 60000, // 1 minute
  requestTimeout: 30000,  // 30 seconds for image processing
});

// Supabase API circuit breaker
export const supabaseCircuitBreaker = createApiCircuitBreaker('supabase', {
  failureThreshold: 5,
  recoveryTimeout: 15000,
  requestTimeout: 10000,
});

export default CircuitBreaker;
