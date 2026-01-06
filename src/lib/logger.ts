/**
 * Logger Service
 * 
 * Centralized logging abstraction that enables:
 * - Structured logging for production observability
 * - Log level filtering based on environment
 * - Context-aware log grouping
 * - Sanitization of sensitive data
 * 
 * @module logger
 * @version 2.0.0
 */

// ============================================
// Types
// ============================================

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogContext {
  /** Module or service name */
  module?: string;
  /** Operation being performed */
  operation?: string;
  /** User or session identifier (sanitized) */
  userId?: string;
  /** Request or correlation ID */
  requestId?: string;
  /** Additional metadata */
  [key: string]: unknown;
}

export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  context?: LogContext;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

export interface LoggerConfig {
  /** Minimum log level to output */
  minLevel: LogLevel;
  /** Enable structured JSON output (for production) */
  structuredOutput: boolean;
  /** Fields to redact from logs */
  redactFields: string[];
  /** Enable console output */
  consoleEnabled: boolean;
  /** Custom log handler */
  customHandler?: (entry: LogEntry) => void;
}

// ============================================
// Configuration
// ============================================

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const DEFAULT_REDACT_FIELDS = [
  'password',
  'apiKey',
  'api_key',
  'secret',
  'token',
  'authorization',
  'privateKey',
  'private_key',
  'creditCard',
  'ssn',
];

// Determine environment
const isDev = typeof import.meta !== 'undefined' 
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore - Vite import.meta.env
  ? import.meta.env?.DEV 
  : process.env.NODE_ENV !== 'production';

const isDebugMode = typeof localStorage !== 'undefined' 
  ? localStorage.getItem('geograph-debug-mode') === 'true'
  : false;

const defaultConfig: LoggerConfig = {
  minLevel: isDev || isDebugMode ? 'debug' : 'info',
  structuredOutput: !isDev,
  redactFields: DEFAULT_REDACT_FIELDS,
  consoleEnabled: true,
};

// ============================================
// Logger Class
// ============================================

class Logger {
  private config: LoggerConfig;
  private defaultContext: LogContext;

  constructor(config: Partial<LoggerConfig> = {}, defaultContext: LogContext = {}) {
    this.config = { ...defaultConfig, ...config };
    this.defaultContext = defaultContext;
  }

  /**
   * Create a child logger with additional default context
   */
  child(context: LogContext): Logger {
    return new Logger(this.config, { ...this.defaultContext, ...context });
  }

  /**
   * Update logger configuration
   */
  configure(config: Partial<LoggerConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Check if a log level should be output
   */
  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[this.config.minLevel];
  }

  /**
   * Redact sensitive fields from an object
   */
  private redact(obj: unknown): unknown {
    if (obj === null || obj === undefined) return obj;
    if (typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(item => this.redact(item));

    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      const lowerKey = key.toLowerCase();
      if (this.config.redactFields.some(field => lowerKey.includes(field.toLowerCase()))) {
        result[key] = '[REDACTED]';
      } else if (typeof value === 'object') {
        result[key] = this.redact(value);
      } else {
        result[key] = value;
      }
    }
    return result;
  }

  /**
   * Format an error for logging
   */
  private formatError(error: unknown): LogEntry['error'] | undefined {
    if (!error) return undefined;
    
    if (error instanceof Error) {
      return {
        name: error.name,
        message: error.message,
        stack: isDev ? error.stack : undefined,
      };
    }
    
    return {
      name: 'UnknownError',
      message: String(error),
    };
  }

  /**
   * Create a log entry
   */
  private createEntry(
    level: LogLevel,
    message: string,
    context?: LogContext,
    error?: unknown
  ): LogEntry {
    return {
      level,
      message,
      timestamp: new Date().toISOString(),
      context: this.redact({ ...this.defaultContext, ...context }) as LogContext | undefined,
      error: this.formatError(error),
    };
  }

  /**
   * Output a log entry
   */
  private output(entry: LogEntry): void {
    // Custom handler takes precedence
    if (this.config.customHandler) {
      this.config.customHandler(entry);
      return;
    }

    if (!this.config.consoleEnabled) return;

    if (this.config.structuredOutput) {
      // JSON output for production log aggregation
      console.log(JSON.stringify(entry));
    } else {
      // Human-readable output for development
      const contextStr = entry.context 
        ? ` ${JSON.stringify(entry.context)}` 
        : '';
      const prefix = `[${entry.timestamp}] [${entry.level.toUpperCase()}]`;
      
      switch (entry.level) {
        case 'debug':
          console.debug(`${prefix}${contextStr}`, entry.message);
          break;
        case 'info':
          console.info(`${prefix}${contextStr}`, entry.message);
          break;
        case 'warn':
          console.warn(`${prefix}${contextStr}`, entry.message);
          break;
        case 'error':
          console.error(`${prefix}${contextStr}`, entry.message, entry.error);
          break;
      }
    }
  }

  /**
   * Log a debug message
   */
  debug(message: string, context?: LogContext): void {
    if (!this.shouldLog('debug')) return;
    this.output(this.createEntry('debug', message, context));
  }

  /**
   * Log an info message
   */
  info(message: string, context?: LogContext): void {
    if (!this.shouldLog('info')) return;
    this.output(this.createEntry('info', message, context));
  }

  /**
   * Log a warning message
   */
  warn(message: string, context?: LogContext): void {
    if (!this.shouldLog('warn')) return;
    this.output(this.createEntry('warn', message, context));
  }

  /**
   * Log an error message
   */
  error(message: string, error?: unknown, context?: LogContext): void {
    if (!this.shouldLog('error')) return;
    this.output(this.createEntry('error', message, context, error));
  }

  /**
   * Time an operation and log the duration
   */
  time<T>(label: string, operation: () => T, context?: LogContext): T {
    const start = performance.now();
    try {
      const result = operation();
      const duration = performance.now() - start;
      this.debug(`${label} completed`, { ...context, durationMs: Math.round(duration) });
      return result;
    } catch (error) {
      const duration = performance.now() - start;
      this.error(`${label} failed`, error, { ...context, durationMs: Math.round(duration) });
      throw error;
    }
  }

  /**
   * Time an async operation and log the duration
   */
  async timeAsync<T>(label: string, operation: () => Promise<T>, context?: LogContext): Promise<T> {
    const start = performance.now();
    try {
      const result = await operation();
      const duration = performance.now() - start;
      this.debug(`${label} completed`, { ...context, durationMs: Math.round(duration) });
      return result;
    } catch (error) {
      const duration = performance.now() - start;
      this.error(`${label} failed`, error, { ...context, durationMs: Math.round(duration) });
      throw error;
    }
  }
}

// ============================================
// Module-specific Loggers
// ============================================

/** Root logger instance */
export const logger = new Logger();

/** Gemini service logger */
export const geminiLogger = logger.child({ module: 'gemini' });

/** Supabase service logger */
export const supabaseLogger = logger.child({ module: 'supabase' });

/** Web3 service logger */
export const web3Logger = logger.child({ module: 'web3' });

/** Avatar service logger */
export const avatarLogger = logger.child({ module: 'avatar' });

/** GARD service logger */
export const gardLogger = logger.child({ module: 'gard' });

/** Validation logger */
export const validationLogger = logger.child({ module: 'validation' });

// ============================================
// Convenience Exports
// ============================================

export { Logger };
export default logger;
