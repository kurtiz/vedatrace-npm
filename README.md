# VedaTrace SDK

Universal JavaScript logging SDK for VedaTrace. Type-safe, lightweight, and developer-friendly.

[![npm version](https://badge.fury.io/js/vedatrace.svg)](https://www.npmjs.com/package/vedatrace)
[![bundle size](https://img.shields.io/bundlephobia/minzip/vedatrace)](https://bundlephobia.com/package/vedatrace)

## Features

- 🎯 **Type-safe** - Full TypeScript support with autocomplete
- 🚀 **Universal** - Works in Node.js, Cloudflare Workers, and browsers
- 📦 **Lightweight** - ~3KB core, tree-shakeable
- ⚡ **Fast** - Background batching, non-blocking
- 🔒 **Safe** - Never breaks your app, graceful failures
- 🎨 **Flexible** - Console + HTTP transports, child loggers

## Installation

```bash
npm install vedatrace
# or
yarn add vedatrace
# or
bun add vedatrace
```

## Quick Start

### Basic Usage

```typescript
import { vedatrace } from 'vedatrace'

const logger = vedatrace({
  apiKey: 'your-api-key',
  service: 'my-service'
})

logger.info('Hello world')
logger.error('Something went wrong', { error: err.message })
```

### Development Mode

```typescript
import { devVedatrace } from 'vedatrace'

// Console-only logging for development
const logger = devVedatrace({ service: 'my-service' })
```

## Configuration

```typescript
const logger = vedatrace({
  apiKey: 'your-api-key',           // Required for HTTP transport
  service: 'my-service',            // Default service name
  endpoint: 'https://ingest.vedatrace.dev/v1/logs',
  environment: 'production',
  
  // Batching
  batchSize: 100,                   // Flush after N logs
  flushInterval: 5000,              // Flush after N ms
  
  // Retry
  maxRetries: 3,
  retryDelay: 1000,
  
  // Redaction
  redaction: {
    paths: ['password', 'token'],
    mask: '[REDACTED]'
  },
  
  // Advanced
  immediateFlush: false,           // Flush on each log (dev mode, edge runtimes)
  runtime: 'auto',                 // Force runtime: 'node' | 'browser' | 'cloudflare' | 'deno' | 'bun'
  
  // Callbacks
  onError: (err) => console.error('VedaTrace error:', err),
  onSuccess: () => console.log('Logs sent')
})
```

## Logging

### All Log Levels

```typescript
logger.debug('Debug info', { query: 'SELECT *' })
logger.info('User action', { userId: '123' })
logger.warn('Performance warning', { duration: 500 })
logger.error('Error occurred', { error: err })
logger.fatal('Critical failure', { stack: err.stack })
```

### Service Override

Override the default service for individual logs:

```typescript
logger.info('Payment processed', { 
  service: 'billing-service',  // Override default
  amount: 99.99 
})
```

## Child Loggers

Create context-aware loggers:

```typescript
const requestLogger = logger.child({ 
  requestId: 'req_123',
  userId: 'user_456' 
})

requestLogger.info('Processing request') 
// Includes requestId, userId, and default service
```

## Framework Integrations

### Express.js

```typescript
import express from 'express'
import { vedaTraceMiddleware } from 'vedatrace/express'

const app = express()
app.use(vedaTraceMiddleware({ 
  apiKey: process.env.VEDATRACE_API_KEY 
}))

app.get('/', (req, res) => {
  req.vedatrace.info('Home page visited')
  res.json({ ok: true })
})
```

### Next.js (App Router)

```typescript
import { withVedaTrace } from 'vedatrace/next'

export const GET = withVedaTrace(async (req, { logger }) => {
  logger.info('API called')
  return Response.json({ success: true })
}, { apiKey: '...' })
```

### React

```tsx
import { VedaTraceProvider, useVedaTrace } from 'vedatrace/react'

function App() {
  return (
    <VedaTraceProvider apiKey="..." service="frontend">
      <MyComponent />
    </VedaTraceProvider>
  )
}

function MyComponent() {
  const logger = useVedaTrace()
  
  useEffect(() => {
    logger.info('Component mounted')
  }, [])
  
  return <div>Hello</div>
}
```

## Cloudflare Workers

```typescript
import { vedatrace } from 'vedatrace'

// Works seamlessly - no special configuration needed
// Timer starts automatically on first log (in handler context)
const logger = vedatrace({ 
  apiKey: env.VEDATRACE_API_KEY,
  service: 'worker'
})

export default {
  async fetch(req, env, ctx) {
    logger.info('Request received', { 
      method: req.method,
      url: req.url 
    })
    
    // Ensure logs are sent before response
    ctx.waitUntil(logger.flush())
    
    return new Response('OK')
  }
}
```

The SDK automatically detects edge runtimes (Cloudflare Workers, Deno, Bun) and uses lazy timer initialization - the flush timer starts on the first log call, which happens inside your handler where async I/O is allowed.

## Advanced Usage

### Custom Transports

```typescript
import { VedaTraceHttpTransport, VedaTraceConsoleTransport } from 'vedatrace/transports'

const logger = vedatrace({
  transports: [
    new VedaTraceHttpTransport({ apiKey: '...' }),
    new VedaTraceConsoleTransport({ format: 'pretty' })
  ]
})
```

### Manual Flush

```typescript
// Flush all pending logs
await logger.flush()

// Use in request handlers
app.post('/webhook', async (req, res) => {
  logger.info('Webhook received')
  await logger.flush() // Ensure sent before responding
  res.json({ ok: true })
})
```

### Graceful Shutdown

The SDK uses background batching that doesn't block your app. For short-lived scripts or when you need explicit cleanup:

```typescript
const logger = vedatrace({ apiKey: '...' })

logger.info('Processing...')

// For short-lived scripts
await logger.flush()
logger.stop()  // Stop background timer
```

The SDK timer uses `unref()` so the process will exit automatically when there's nothing else to do. Call `stop()` if you need explicit cleanup.

### Error Handling

```typescript
const logger = vedatrace({
  apiKey: '...',
  onError: (err) => {
    // Handle transport errors
    metrics.increment('vedatrace.errors')
  }
})

// SDK never throws - errors are logged to onError
logger.error('Critical error', { stack: err.stack })
```

## Log Schema

Logs sent to VedaTrace follow this schema:

```typescript
{
  level: 'debug' | 'info' | 'warn' | 'error' | 'fatal'
  message: string
  service?: string
  timestamp?: number  // Auto-generated if not provided
  metadata?: {
    // Any arbitrary metadata
  }
}
```

## API Reference

### `vedatrace(config)`

Creates a new logger instance.

### `logger.debug(message, metadata?)`

Log at debug level.

### `logger.info(message, metadata?)`

Log at info level.

### `logger.warn(message, metadata?)`

Log at warn level.

### `logger.error(message | Error, metadata?)`

Log at error level. Accepts string or Error object.

### `logger.fatal(message | Error, metadata?)`

Log at fatal level. Accepts string or Error object.

### `logger.child(defaults)`

Create a child logger with default metadata.

### `logger.flush()`

Manually flush pending logs. Returns a Promise.

### `logger.stop()`

Stop the background flush timer. Call this for explicit cleanup in long-running processes or before shutdown.

### `logger.start()`

Manually start the flush timer. Usually not needed - the timer starts automatically on first log. Useful if you want to ensure the timer is running before any logs are sent.

### `logger.runtime`

Get the detected runtime environment. Returns: `'node' | 'browser' | 'cloudflare' | 'deno' | 'bun' | 'edge'`

```typescript
console.log(logger.runtime) // 'cloudflare' when running in Workers
```

## License

MIT
