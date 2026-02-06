/**
 * Express.js middleware integration for VedaTrace
 */

import type { NextFunction, Request, Response } from "express"
import type {
	LogMetadata,
	VedaTraceConfig,
	VedaTraceLoggerInterface,
} from "../core/types"
import { vedatrace } from "../index"

declare global {
	namespace Express {
		interface Request {
			/** VedaTrace logger instance for this request */
			vedatrace: VedaTraceLoggerInterface
			/** Request ID for tracing */
			requestId?: string
		}
	}
}

export interface ExpressMiddlewareConfig extends VedaTraceConfig {
	/** Generate or extract request ID */
	generateRequestId?: (req: Request) => string
	/** Additional metadata to include with all request logs */
	requestMetadata?: (req: Request) => LogMetadata
	/** Log all HTTP requests */
	logRequests?: boolean
	/** Log request body (be careful with PII) */
	logBody?: boolean
}

/**
 * Express middleware for VedaTrace logging
 *
 * @example
 * ```typescript
 * import express from 'express'
 * import { vedaTraceMiddleware } from 'vedatrace/express'
 *
 * const app = express()
 * app.use(vedaTraceMiddleware({ apiKey: '...' }))
 *
 * app.get('/', (req, res) => {
 *   req.vedatrace.info('Home page visited')
 *   res.json({ ok: true })
 * })
 * ```
 */
export function vedaTraceMiddleware(config: ExpressMiddlewareConfig = {}) {
	const {
		generateRequestId = () =>
			`req_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
		requestMetadata = () => ({}),
		logRequests = true,
		logBody = false,
		...vedaConfig
	} = config

	return (req: Request, res: Response, next: NextFunction): void => {
		// Generate request ID
		const requestId = generateRequestId(req)
		req.requestId = requestId

		// Create request-scoped logger
		const logger = vedatrace(vedaConfig).child({
			requestId,
			...requestMetadata(req),
		})

		req.vedatrace = logger

		// Log request if enabled
		if (logRequests) {
			const startTime = Date.now()

			const logData: LogMetadata = {
				method: req.method,
				path: req.path,
				query: req.query,
				ip: req.ip,
				userAgent: req.get("user-agent"),
			}

			if (logBody && req.body) {
				logData.body = req.body
			}

			logger.info("Request started", logData)

			// Log response when finished
			res.on("finish", () => {
				const duration = Date.now() - startTime
				logger.info("Request completed", {
					statusCode: res.statusCode,
					durationMs: duration,
				})

				// Ensure logs are flushed
				logger.flush().catch(() => {
					// Silent fail - don't break response
				})
			})
		}

		next()
	}
}
