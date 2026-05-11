/**
 * VedaTrace - Deno Server Example
 *
 * Demonstrates standard batching with unref timers for Deno.
 * Logs are batched and automatically flushed on process shutdown.
 */

import { serve } from "@std/http"
import { vedatrace } from "npm:vedatrace"

const logger = vedatrace({
	apiKey: Deno.env.get("VEDATRACE_API_KEY") ?? "",
	service: "deno-server",
	debug: Deno.env.get("DENO_ENV") !== "production",
	flushInterval: 3000,
})

logger.info("Deno server starting")

const port = Number(Deno.env.get("PORT") ?? 3000)

serve(
	async (req) => {
		const url = new URL(req.url)

		logger.info("Request received", {
			method: req.method,
			path: url.pathname,
		})

		if (url.pathname === "/health") {
			return Response.json({
				status: "ok",
				timestamp: new Date().toISOString(),
			})
		}

		if (url.pathname === "/api/test") {
			const body = await req.json()
			logger.info("Test endpoint", { body })
			return Response.json({ received: true })
		}

		return new Response("Hello from Deno!", { status: 200 })
	},
	{ port },
)

logger.info(`Deno server listening on port ${port}`)

// Graceful shutdown
Deno.addSignalListener("SIGTERM", () => {
	logger.info("SIGTERM received, shutting down")
	Deno.exit(0)
})

Deno.addSignalListener("SIGINT", () => {
	logger.info("SIGINT received, shutting down")
	Deno.exit(0)
})

// Deno supports unref on timers via the SDK's unrefTimer option