/**
 * VedaTrace - Node.js + Express Example
 *
 * Demonstrates graceful shutdown handling in Node.js.
 * Logs are batched and automatically flushed on process termination.
 */

import express from "express"
import { vedatrace } from "vedatrace"

const app = express()
const port = process.env.PORT ?? 3000

const logger = vedatrace({
	apiKey: process.env.VEDATRACE_API_KEY,
	service: "express-server",
	debug: process.env.NODE_ENV !== "production",
})

logger.info("Express server starting", { port })

app.use(express.json())

app.get("/health", (_req, res) => {
	logger.info("Health check")
	res.json({ status: "ok", timestamp: new Date().toISOString() })
})

app.post("/api/test", (req, res) => {
	const { name, email } = req.body

	logger.info("Test endpoint called", {
		name,
		email,
		ip: req.ip,
	})

	res.json({ received: true, name, email })
})

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
	logger.error("Unhandled error", {
		message: err.message,
		stack: err.stack,
	})
	res.status(500).json({ error: "Internal Server Error" })
})

const server = app.listen(port, () => {
	logger.info(`Server listening on port ${port}`)
})

// Graceful shutdown
process.on("SIGTERM", () => {
	logger.info("SIGTERM received, shutting down gracefully")
	server.close(() => {
		logger.info("HTTP server closed")
		process.exit(0)
	})
})

process.on("SIGINT", () => {
	logger.info("SIGINT received, shutting down gracefully")
	server.close(() => {
		logger.info("HTTP server closed")
		process.exit(0)
	})
})

// VedaTrace automatically attaches:
// - process.on('beforeExit', ...) to flush remaining logs
// - process.on('SIGTERM', ...) (handled manually above)
// - process.on('SIGINT', ...) (handled manually above)

export default app