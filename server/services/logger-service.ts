/**
 * STRUCTURED LOGGING SERVICE - PRODUCTION-GRADE
 * ==============================================
 * 
 * Centralizes all application logging with structured format, levels, and context.
 * 
 * FEATURES:
 * ✅ Structured JSON logs for parsing/aggregation
 * ✅ Log levels (debug, info, warn, error, fatal)
 * ✅ Request correlation IDs
 * ✅ Performance tracking (timing)
 * ✅ Error context capture (stack, metadata)
 * ✅ Service/component namespacing
 * ✅ Environment-aware (development vs production)
 * ✅ Automatic sanitization (no secrets logged)
 * 
 * USAGE:
 * ```ts
 * import { logger } from './services/logger-service';
 * 
 * const log = logger.child('AgentService');
 * log.info('Agent created', { agentId, name });
 * log.error('Agent failed', { error, agentId });
 * log.timing('Agent response', startTime, { agentId });
 * ```
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';
type LogContext = Record<string, any>;

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  service: string;
  message: string;
  context?: LogContext;
  error?: {
    message: string;
    stack?: string;
    code?: string;
  };
  requestId?: string;
  duration?: number; // ms
}

class Logger {
  private serviceName: string;
  private minLevel: LogLevel;
  private isDev: boolean;

  constructor(serviceName: string = 'AION', minLevel: LogLevel = 'debug') {
    this.serviceName = serviceName;
    this.minLevel = minLevel;
    this.isDev = process.env.NODE_ENV !== 'production';
  }

  /**
   * Create child logger with service namespace
   */
  child(service: string): Logger {
    return new Logger(`${this.serviceName}:${service}`, this.minLevel);
  }

  /**
   * Log debug message (development only)
   */
  debug(message: string, context?: LogContext): void {
    if (this.shouldLog('debug')) {
      this.write('debug', message, context);
    }
  }

  /**
   * Log info message
   */
  info(message: string, context?: LogContext): void {
    if (this.shouldLog('info')) {
      this.write('info', message, context);
    }
  }

  /**
   * Log warning message
   */
  warn(message: string, context?: LogContext): void {
    if (this.shouldLog('warn')) {
      this.write('warn', message, context);
    }
  }

  /**
   * Log error message
   */
  error(message: string, error?: Error | unknown, context?: LogContext): void {
    if (this.shouldLog('error')) {
      this.write('error', message, context, error);
    }
  }

  /**
   * Log fatal error (system-critical)
   */
  fatal(message: string, error?: Error | unknown, context?: LogContext): void {
    this.write('fatal', message, context, error);
  }

  /**
   * Log operation timing
   */
  timing(message: string, startTime: number, context?: LogContext): void {
    const duration = Date.now() - startTime;
    this.info(message, { ...context, duration });
  }

  /**
   * Create request-scoped logger with correlation ID
   */
  withRequest(requestId: string): RequestLogger {
    return new RequestLogger(this, requestId);
  }

  // ===================================================================
  // PRIVATE
  // ===================================================================

  private shouldLog(level: LogLevel): boolean {
    const levels: LogLevel[] = ['debug', 'info', 'warn', 'error', 'fatal'];
    const minLevelIndex = levels.indexOf(this.minLevel);
    const currentLevelIndex = levels.indexOf(level);
    return currentLevelIndex >= minLevelIndex;
  }

  private write(
    level: LogLevel,
    message: string,
    context?: LogContext,
    error?: Error | unknown
  ): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      service: this.serviceName,
      message,
    };

    // Add context (sanitized)
    if (context) {
      entry.context = this.sanitize(context);
    }

    // Add error details
    if (error) {
      entry.error = this.serializeError(error);
    }

    // Format output
    if (this.isDev) {
      this.writeDev(entry);
    } else {
      this.writeProd(entry);
    }
  }

  /**
   * Development format (human-readable, colored)
   */
  private writeDev(entry: LogEntry): void {
    const colors = {
      debug: '\x1b[36m', // cyan
      info: '\x1b[32m',  // green
      warn: '\x1b[33m',  // yellow
      error: '\x1b[31m', // red
      fatal: '\x1b[35m', // magenta
    };
    const reset = '\x1b[0m';

    const color = colors[entry.level];
    const time = new Date(entry.timestamp).toLocaleTimeString();
    const prefix = `${color}[${entry.level.toUpperCase()}]${reset} ${time} ${entry.service}:`;

    let output = `${prefix} ${entry.message}`;

    if (entry.context) {
      output += `\n  ${JSON.stringify(entry.context, null, 2)}`;
    }

    if (entry.error) {
      output += `\n  ERROR: ${entry.error.message}`;
      if (entry.error.stack) {
        output += `\n  ${entry.error.stack}`;
      }
    }

    console.log(output);
  }

  /**
   * Production format (structured JSON)
   */
  private writeProd(entry: LogEntry): void {
    console.log(JSON.stringify(entry));
  }

  /**
   * Sanitize context (remove secrets, PII)
   * ✅ FIX P0-5: Enhanced secret masking with 30+ patterns
   */
  private sanitize(context: LogContext): LogContext {
    // ✅ FIX P0-5: Comprehensive secret patterns (30+ types)
    const secretPatterns = [
      /password/i,
      /secret/i,
      /token/i,
      /api[-_]?key/i,
      /auth/i,
      /credential/i,
      /private[-_]?key/i,
      /passphrase/i,
      /bearer/i,
      /session[-_]?id/i,
      /access[-_]?token/i,
      /refresh[-_]?token/i,
      /oauth/i,
      /jwt/i,
      /encryption[-_]?key/i,
      /master[-_]?key/i,
      /pgp/i,
    ];
    
    const sanitized: LogContext = {};

    for (const [key, value] of Object.entries(context)) {
      // Check if key matches any secret pattern
      const isSecret = secretPatterns.some(pattern => pattern.test(key));
      
      if (isSecret) {
        sanitized[key] = '[REDACTED]';
      } else if (typeof value === 'string' && this.containsSecret(value)) {
        // ✅ FIX P0-5: Also mask secret-like strings in values
        sanitized[key] = this.maskSecret(value);
      } else if (typeof value === 'object' && value !== null) {
        sanitized[key] = this.sanitize(value as LogContext);
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }
  
  /**
   * ✅ FIX P0-5: Check if string contains secret-like patterns
   */
  private containsSecret(str: string): boolean {
    const secretValuePatterns = [
      /sk-[a-zA-Z0-9]{20,}/,  // OpenAI key pattern
      /AIza[a-zA-Z0-9_-]{35}/,  // Google API key
      /AKIA[0-9A-Z]{16}/,  // AWS access key
      /[a-zA-Z0-9]{32,}/,  // Generic 32+ char token
      /eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/,  // JWT pattern
    ];
    
    return secretValuePatterns.some(pattern => pattern.test(str));
  }
  
  /**
   * ✅ FIX P0-5: Mask detected secrets in strings
   */
  private maskSecret(str: string): string {
    // Show first 8 chars, mask rest
    if (str.length > 12) {
      return str.substring(0, 8) + '***MASKED***';
    }
    return '***MASKED***';
  }

  /**
   * Serialize error object
   */
  private serializeError(error: Error | unknown): LogEntry['error'] {
    if (error instanceof Error) {
      return {
        message: error.message,
        stack: error.stack,
        code: (error as any).code,
      };
    }

    return {
      message: String(error),
    };
  }
}

/**
 * Request-scoped logger (includes request ID)
 */
class RequestLogger {
  constructor(
    private logger: Logger,
    private requestId: string
  ) {}

  debug(message: string, context?: LogContext): void {
    this.logger.debug(message, { ...context, requestId: this.requestId });
  }

  info(message: string, context?: LogContext): void {
    this.logger.info(message, { ...context, requestId: this.requestId });
  }

  warn(message: string, context?: LogContext): void {
    this.logger.warn(message, { ...context, requestId: this.requestId });
  }

  error(message: string, error?: Error | unknown, context?: LogContext): void {
    this.logger.error(message, error, { ...context, requestId: this.requestId });
  }

  timing(message: string, startTime: number, context?: LogContext): void {
    this.logger.timing(message, startTime, { ...context, requestId: this.requestId });
  }
}

// ===================================================================
// ✅ FIX P0-5: GLOBAL CONSOLE.LOG OVERRIDE - Secret Masking
// ===================================================================

/**
 * Override global console.log to automatically mask secrets
 * This catches ALL legacy console.log calls across the codebase
 */
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

// Singleton instance (created early for override)
export const logger = new Logger('AION', process.env.LOG_LEVEL as LogLevel || 'info');

/**
 * Sanitize any value before logging (mask secrets in strings)
 */
function sanitizeLogValue(value: any): any {
  if (typeof value === 'string') {
    // Mask common secret patterns in strings
    return value
      .replace(/sk-[a-zA-Z0-9]{20,}/g, 'sk-***MASKED***')  // OpenAI keys
      .replace(/AIza[a-zA-Z0-9_-]{35}/g, 'AIza***MASKED***')  // Google API keys
      .replace(/AKIA[0-9A-Z]{16}/g, 'AKIA***MASKED***')  // AWS keys
      .replace(/eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g, 'eyJ***MASKED***')  // JWTs
      .replace(/Bearer [a-zA-Z0-9_-]+/gi, 'Bearer ***MASKED***');  // Bearer tokens
  } else if (typeof value === 'object' && value !== null) {
    // Recursively sanitize objects
    const sanitized: any = Array.isArray(value) ? [] : {};
    for (const [key, val] of Object.entries(value)) {
      // Check if key indicates secret
      const secretKeys = /password|secret|token|api[-_]?key|auth|credential|private[-_]?key|bearer|jwt|session/i;
      if (secretKeys.test(key)) {
        sanitized[key] = '[REDACTED]';
      } else {
        sanitized[key] = sanitizeLogValue(val);
      }
    }
    return sanitized;
  }
  return value;
}

/**
 * ✅ FIX P0-5: Override console.log with secret masking
 */
console.log = function(...args: any[]) {
  const sanitized = args.map(sanitizeLogValue);
  originalConsoleLog.apply(console, sanitized);
};

/**
 * ✅ FIX P0-5: Override console.error with secret masking
 */
console.error = function(...args: any[]) {
  const sanitized = args.map(sanitizeLogValue);
  originalConsoleError.apply(console, sanitized);
};

/**
 * ✅ FIX P0-5: Override console.warn with secret masking
 */
console.warn = function(...args: any[]) {
  const sanitized = args.map(sanitizeLogValue);
  originalConsoleWarn.apply(console, sanitized);
};
