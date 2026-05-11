/**
 * Cloudflare Workers + Hono Reproduction Script
 *
 * This script demonstrates the VedaTrace batching issue in Cloudflare Workers.
 *
 * SETUP:
 *   1. Create a new Cloudflare Workers project: npm create hono@latest my-app -- --template cloudflare-workers
 *   2. Copy this file as src/index.ts
 *   3. Add vedatrace to your dependencies
 *
 * ISSUE:
 *   When the Worker returns a response BEFORE the flush interval (e.g., 5000ms) elapses,
 *   the V8 isolate is frozen/suspended. The setInterval timer is NOT guaranteed to fire.
 *   As a result, logs in the queue are never flushed.
 *
 * HOW TO RUN:
 *   Deploy to Cloudflare Workers and check the VedaTrace dashboard.
 *   You will see NO logs despite calling logger.info().
 *
 * EXPECTED: After 5 seconds (default flushInterval), the batcher should flush
 * ACTUAL: The Worker response is returned immediately, isolate freezes, no flush occurs
 */

import * as process from "node:process"
import { Hono } from "hono"
import { vedatrace } from "../../../src"

// Initialize the logger
const logger = vedatrace({
	apiKey: process.env.VEDATRACE_API_KEY,
	service: "hono-worker-repro",
	debug: true,
	// immediateFlush: true, // UNCOMMENT TO SEE LOGS (hides the issue)
})

const app = new Hono()

app.get("/", (c) => {
	logger.info("Request received at /")

	// User expects this log to appear in VedaTrace dashboard
	// BUT: The Worker returns this response BEFORE the batcher's setInterval fires
	// Cloudflare freezes the V8 isolate after the response is sent
	// setInterval does NOT reliably fire in frozen isolates

	return c.json({
		message: "Hello from Hono + Cloudflare Workers",
		timestamp: new Date().toISOString(),
	})
})

app.get("/flush-now", async (c) => {
	logger.info("Manual flush test")

	// Manual flush works because it happens BEFORE the response is returned
	// BUT: callers must remember to await logger.flush() — error-prone
	await logger.flush()

	return c.json({ message: "Flushed", flushed: true })
})

// Critical bug reproduction:
// When no await/flush is used, the Worker returns immediately and logs are lost
app.post("/api/test", async (c) => {
	const body = await c.req.json()

	logger.info("Processing test request", { body })

	// BUG: Response is returned immediately
	// The batcher's setInterval has NOT fired yet
	// Cloudflare suspends the isolate
	// setInterval timer is NEVER executed
	// Logs are silently dropped

	return c.json({ status: "ok" })
	// >> At this point, the Worker has returned its response
	// >> The V8 isolate is now FROZEN / SUSPENDED
	// >> The batcher's 5000ms setInterval will NEVER fire
	// >> All queued logs are LOST
})

export default app
