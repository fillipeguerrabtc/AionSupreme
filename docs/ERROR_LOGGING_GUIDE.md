# Error & Logging System - Production Guide

## Overview

AION's error handling and logging system provides production-grade reliability through:
- ✅ Structured logging with context
- ✅ Type-safe error classes
- ✅ Automatic error recovery patterns
- ✅ Request correlation tracking
- ✅ Environment-aware output

## Quick Start

### 1. Logging

```typescript
import { logger } from './services/logger-service';

// Create service-scoped logger
const log = logger.child('MyService');

// Basic logging
log.info('User created', { userId: 123, email: 'user@example.com' });
log.warn('Rate limit approaching', { remaining: 10 });
log.error('Database query failed', error, { query: 'SELECT...' });

// Performance tracking
const startTime = Date.now();
// ... operation ...
log.timing('Query completed', startTime, { rows: 150 });

// Request-scoped logging
app.get('/api/users/:id', (req, res) => {
  const requestLog = log.withRequest(req.id);
  requestLog.info('Fetching user', { userId: req.params.id });
});
```

### 2. Error Handling

```typescript
import { NotFoundError, ValidationError } from './errors/app-errors';
import { asyncHandler } from './middleware/error-handler';

// Throw typed errors
app.get('/api/agents/:id', asyncHandler(async (req, res) => {
  const agent = await getAgent(req.params.id);
  
  if (!agent) {
    throw new NotFoundError('Agent not found', { agentId: req.params.id });
  }
  
  if (!agent.isActive) {
    throw new ValidationError('Agent is inactive', { agentId: req.params.id });
  }
  
  res.json(agent);
}));
```

### 3. Error Recovery

```typescript
import { retry, withTimeout, circuitBreaker } from './services/error-recovery';

// Retry with exponential backoff
const data = await retry(
  () => fetchExternalAPI(),
  { maxRetries: 3, backoff: 'exponential' }
);

// Timeout protection
const result = await withTimeout(
  () => slowDatabaseQuery(),
  5000, // 5 seconds
  'Database query timeout'
);

// Circuit breaker for unreliable services
const fetchWithBreaker = circuitBreaker(
  fetchUnreliableService,
  { failureThreshold: 5, resetTimeout: 60000 }
);

const data = await fetchWithBreaker(params);
```

## Error Classes

### Base Errors

| Class | Status | Use Case |
|-------|--------|----------|
| `ValidationError` | 400 | Invalid input/validation |
| `UnauthorizedError` | 401 | Authentication required |
| `ForbiddenError` | 403 | Insufficient permissions |
| `NotFoundError` | 404 | Resource doesn't exist |
| `ConflictError` | 409 | Resource conflict (duplicate) |
| `RateLimitError` | 429 | Rate limit exceeded |
| `InternalError` | 500 | Unexpected error |
| `ServiceUnavailableError` | 503 | External service down |
| `TimeoutError` | 504 | External service timeout |

### Domain-Specific Errors

```typescript
// GPU errors
throw new GPUNotFoundError('GPU instance not found', { gpuId });
throw new GPUUnavailableError('No GPUs available', { provider: 'colab' });

// Agent errors
throw new AgentNotFoundError('Agent not found', { agentId });
throw new AgentBudgetExceededError('Budget exceeded', { used: 10.5, limit: 10 });

// Knowledge base errors
throw new DocumentNotFoundError('Document not found', { documentId });
throw new EmbeddingError('Embedding generation failed', { documentId });

// Training errors
throw new TrainingJobNotFoundError('Job not found', { jobId });
throw new TrainingJobFailedError('Training failed', { jobId, reason });
```

## Middleware Setup

```typescript
import { 
  errorHandler, 
  notFoundHandler, 
  requestLogger 
} from './middleware/error-handler';

// Request logging (first)
app.use(requestLogger);

// Your routes
app.use('/api', routes);

// 404 handler (before error handler)
app.use(notFoundHandler);

// Error handler (last)
app.use(errorHandler);
```

## Log Levels

| Level | Use Case | Environment |
|-------|----------|-------------|
| `debug` | Detailed debugging info | Development only |
| `info` | General information | All environments |
| `warn` | Warning conditions | All environments |
| `error` | Error conditions | All environments |
| `fatal` | System-critical errors | All environments |

## Best Practices

### 1. Use Structured Context

```typescript
// ❌ Bad
log.info('User logged in: user123');

// ✅ Good
log.info('User logged in', { userId: 'user123', timestamp: Date.now() });
```

### 2. Include Error Context

```typescript
// ❌ Bad
throw new Error('Failed to create agent');

// ✅ Good
throw new ValidationError('Failed to create agent', {
  reason: 'Invalid name',
  providedName: agentData.name,
  constraints: { minLength: 3, maxLength: 50 }
});
```

### 3. Use Request Scoped Loggers

```typescript
// ❌ Bad
log.info('Request processed');

// ✅ Good
const requestLog = log.withRequest(req.id);
requestLog.info('Request processed', { userId, duration });
```

### 4. Track Performance

```typescript
// ❌ Bad
const result = await heavyOperation();

// ✅ Good
const startTime = Date.now();
const result = await heavyOperation();
log.timing('Heavy operation completed', startTime, { rows: result.length });
```

### 5. Use Error Recovery Patterns

```typescript
// ❌ Bad (no retry)
const data = await unreliableAPI();

// ✅ Good (with retry + timeout)
const data = await withTimeout(
  () => retry(() => unreliableAPI(), { maxRetries: 3 }),
  10000,
  'API request timeout'
);
```

## Error Response Format

### Development

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Agent not found",
    "context": {
      "agentId": "abc123"
    },
    "stack": "Error: Agent not found\n    at..."
  }
}
```

### Production

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Agent not found",
    "context": {
      "agentId": "abc123"
    }
  }
}
```

## Log Output Format

### Development (Colored, Human-Readable)

```
[INFO] 14:23:45 AION:AgentService: Agent created
  {
    "agentId": "abc123",
    "name": "Support Agent",
    "tier": "agent"
  }
```

### Production (Structured JSON)

```json
{
  "timestamp": "2025-11-06T14:23:45.123Z",
  "level": "info",
  "service": "AION:AgentService",
  "message": "Agent created",
  "context": {
    "agentId": "abc123",
    "name": "Support Agent",
    "tier": "agent"
  }
}
```

## Advanced Patterns

### Circuit Breaker with Metrics

```typescript
const breaker = circuitBreaker(
  fetchExternalService,
  {
    failureThreshold: 5,
    resetTimeout: 60000,
    onStateChange: (state) => {
      log.info('Circuit breaker state changed', { state });
      metrics.gauge('circuit_breaker_state', state === 'open' ? 1 : 0);
    }
  }
);
```

### Retry with Custom Backoff

```typescript
await retry(
  () => uploadToS3(file),
  {
    maxRetries: 5,
    backoff: 'exponential',
    initialDelay: 500,
    maxDelay: 30000,
    onRetry: (error, attempt) => {
      log.warn('Upload retry', { attempt, error: error.message });
    }
  }
);
```

### Graceful Degradation

```typescript
import { withFallback } from './services/error-recovery';

// Try primary, fallback to cache
const data = await withFallback(
  () => fetchFromAPI(),
  () => fetchFromCache()
);

// Try primary, fallback to default
const config = await withFallback(
  () => fetchRemoteConfig(),
  { timeout: 30, retries: 3 } // default config
);
```

## Monitoring & Observability

### Log Aggregation

In production, logs are output as structured JSON for easy parsing by tools like:
- **Datadog**: Log aggregation + APM
- **ELK Stack**: Elasticsearch + Logstash + Kibana
- **Google Cloud Logging**: Native GCP integration
- **AWS CloudWatch**: Native AWS integration

### Error Tracking

Errors with `isOperational: false` (programming errors) trigger process exit:

```typescript
if (!isOperationalError(error)) {
  log.fatal('Non-operational error - shutting down', error);
  process.exit(1); // Let orchestrator restart
}
```

### Metrics Integration

```typescript
import { usageTracker } from './services/usage-tracker';

log.info('API call completed', {
  endpoint: '/api/agents',
  duration: 150,
  status: 200
});

// Automatically tracked in telemetry
usageTracker.track('api_call', { endpoint: '/api/agents', duration: 150 });
```

## Testing

### Testing Error Handling

```typescript
import { NotFoundError } from './errors/app-errors';

describe('AgentService', () => {
  it('should throw NotFoundError for missing agent', async () => {
    await expect(getAgent('invalid-id'))
      .rejects
      .toThrow(NotFoundError);
  });
  
  it('should include context in error', async () => {
    try {
      await getAgent('invalid-id');
    } catch (error) {
      expect(error.context).toEqual({ agentId: 'invalid-id' });
    }
  });
});
```

### Testing Error Recovery

```typescript
describe('retry', () => {
  it('should retry on failure', async () => {
    let attempts = 0;
    const fn = jest.fn().mockImplementation(() => {
      attempts++;
      if (attempts < 3) throw new Error('Fail');
      return 'success';
    });
    
    const result = await retry(fn, { maxRetries: 3 });
    
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(3);
  });
});
```

## Environment Variables

```bash
# Log level (debug, info, warn, error, fatal)
LOG_LEVEL=info

# Node environment (affects log format)
NODE_ENV=production
```

## Migration Guide

### Converting Existing Code

**Before:**
```typescript
try {
  const agent = await db.select().from(agents).where(eq(agents.id, id));
  if (!agent) {
    return res.status(404).json({ error: 'Not found' });
  }
  res.json(agent);
} catch (error) {
  console.error('Error:', error);
  res.status(500).json({ error: 'Internal error' });
}
```

**After:**
```typescript
import { asyncHandler } from './middleware/error-handler';
import { NotFoundError } from './errors/app-errors';
import { logger } from './services/logger-service';

const log = logger.child('AgentController');

app.get('/api/agents/:id', asyncHandler(async (req, res) => {
  const startTime = Date.now();
  
  const agent = await db.select().from(agents).where(eq(agents.id, req.params.id));
  
  if (!agent) {
    throw new NotFoundError('Agent not found', { agentId: req.params.id });
  }
  
  log.timing('Agent fetched', startTime, { agentId: req.params.id });
  res.json(agent);
}));
```

## Summary

AION's Error & Logging system provides:
- ✅ **Type Safety**: Compile-time error checking
- ✅ **Consistency**: Standardized error responses
- ✅ **Observability**: Structured logs for monitoring
- ✅ **Resilience**: Automatic retry and circuit breaker
- ✅ **Debugging**: Rich context and stack traces
- ✅ **Production Ready**: Environment-aware behavior

For questions or issues, check the implementation in:
- `server/services/logger-service.ts`
- `server/errors/app-errors.ts`
- `server/middleware/error-handler.ts`
- `server/services/error-recovery.ts`
