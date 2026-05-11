/**
 * VedaTrace - Browser Usage Example
 *
 * This demonstrates how VedaTrace handles browser lifecycle:
 * - visibilitychange: flush when tab becomes hidden
 * - pagehide: flush when user navigates away
 * - beforeunload: backup flush before unload
 *
 * For testing:
 * 1. Serve this file (e.g., npx serve .)
 * 2. Open DevTools Console
 * 3. Click the log buttons
 * 4. Hide the tab or navigate away
 * 5. Check your VedaTrace dashboard for logs
 *
 * Note: Replace YOUR_API_KEY with your actual VedaTrace API key
 */

export const exampleCode = `
import { vedatrace } from 'vedatrace'

const logger = vedatrace({
  apiKey: 'YOUR_API_KEY',
  service: 'my-web-app',
  debug: true,
  batchSize: 10,
  flushInterval: 2000,
})

// Log user actions
logger.info('User logged in', { userId: '123', method: 'google' })

// Log errors
try {
  await fetchData()
} catch (error) {
  logger.error('Failed to fetch data', {
    error: error.message,
    stack: error.stack
  })
}

// Browser lifecycle is handled automatically:
// - visibilitychange: flush when tab hidden
// - pagehide: flush on navigation away
// - beforeunload: backup flush on unload

// You can also manually flush
await logger.flush()
`

export const setupInstructions = `
1. Install vedatrace in your frontend project:
   npm install vedatrace

2. Import and initialize:
   import { vedatrace } from 'vedatrace'
   const logger = vedatrace({
     apiKey: process.env.VEDATRACE_API_KEY,
     service: 'my-web-app',
   })

3. Use in your application:
   logger.info('User action', { userId, action })

4. VedaTrace will automatically:
   - Batch logs (10 by default)
   - Flush every 2 seconds (default)
   - Flush when tab becomes hidden
   - Flush when user navigates away

5. For manual control:
   await logger.flush()
`