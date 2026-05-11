/**
 * VedaTrace - Bun Server Example
 *
 * Demonstrates standard batching with unref timers for Bun.
 * Logs are batched and automatically flushed on process shutdown.
 */

import { serve } from "bun"
import { vedatrace } from "vedatrace"

const logger = vedatrace({
	apiKey: process.env.VEDATRACE_API_KEY ?? "",
	service: "bun-server",
	debug: process.env.NODE_ENV !== "production",
	flushInterval: 3000,
})

logger.info("Bun server starting")

const server = serve({
	port: process.env.PORT ?? 3000,

	async fetch(req) {
		const url = new URL(req.url)

		logger.info("Request received", {
			method: req.method,
			path: url.pathname,
		})

		if (url.pathname === "/health") {
			return new Response(JSON.stringify({ status: "ok", timestamp: new Date().toISOString() }), {
				headers: { "Content-Type": "application/json" },
			})
		}

		if (url.pathname === "/api/test") {
			const body = await req.json()
			logger.info("Test endpoint", { body })
			return new Response(JSON.stringify({ received: true }), {
				headers: { "Content-Type": "application/json" },
			})
		}

		return new Response("Hello from Bun!", { status: 200 })
	},
})

logger.info(`Bun server listening on port ${server.port}`)

// Graceful shutdown
process.on("SIGTERM", () => {
	logger.info("SIGTERM received, shutting down")
	server.stop()
	process.exit(0)
})

process.on("SIGINT", () => {
	logger.info("SIGINT received, shutting down")
	server.stop()
	process.exit(0)
})

// Bun automatically handles unref() on timers if configured
// The SDK will use unrefTimer when available for graceful exit