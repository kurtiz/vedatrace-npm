/**
 * VedaTrace SDK - Universal JavaScript logging
 *
 * Framework-agnostic SDK with first-class Cloudflare Workers support.
 *
 * Key features:
 * - Automatic waitUntil() integration for Cloudflare Workers / Pages
 * - Fire-and-forget logging - SDK handles background flush lifecycle
 * - Edge-safe batching with debounced flushes
 * - Works with any framework (Hono, Fastify, Express, etc.) or raw Workers
 *
 * @example
 * // Raw Cloudflare Worker (recommended pattern)
 * export default {
 *   async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
 *     const logger = vedatrace({
 *       apiKey: env.VEDATRACE_API_KEY,
 *       service: 'my-worker',
 *     }).withContext(ctx)
 *
 *     logger.info('Request received')
 *     return new Response('Hello')
 *   }
 * }
 *
 * @example
 * // Hono
 * const app = new Hono()
 * app.use('*', async (c, next) => {
 *   c.set('logger', vedatrace({ apiKey: env.VEDATRACE_API_KEY }).withContext(c.executionCtx))
 *   await next()
 * })
 *
 * @example
 * // Manual flush (no context available)
 * const logger = vedatrace({ apiKey: 'key' })
 * logger.info('log before response')
 * await logger.flush()
 * return c.json({ ok: true })
 */

export { VedaTraceBatcher } from "@/core/batcher"

export { VedaTraceLogger } from "@/core/logger"
export type {
	BatcherConfig,
	InternalLogEntry,
	LogMetadata,
	RedactionConfig,
	RuntimeType,
	VedaTraceConfig,
	VedaTraceEdgeContext,
	VedaTraceLevel,
	VedaTraceLog,
	VedaTraceLoggerInterface,
	VedaTraceTransport,
} from "@/core/types"
export type {
	ConsoleFormat,
	ConsoleTransportConfig,
} from "@/transports/console"
export { VedaTraceConsoleTransport } from "@/transports/console"
export type { HttpTransportConfig } from "@/transports/http"
export { VedaTraceHttpTransport } from "@/transports/http"
export { redact } from "@/utils/redaction"
export { detectRuntime, isEdgeRuntime } from "@/utils/runtime"

import { VedaTraceBatcher } from "@/core/batcher"
import { VedaTraceLogger } from "@/core/logger"
import type {
	VedaTraceConfig,
	VedaTraceEdgeContext,
	VedaTraceLoggerInterface,
} from "@/core/types"
import type { HttpTransportConfig } from "@/transports"
import { VedaTraceConsoleTransport, VedaTraceHttpTransport } from "@/transports"
import { isEdgeRuntime } from "@/utils/runtime"

/**
 * Extended logger interface with context support for Cloudflare Workers
 */
export interface VedaTraceInstance extends VedaTraceLoggerInterface {
	/** Attach execution context for waitUntil support */
	withContext(ctx: VedaTraceEdgeContext): this

	/** Check if context is attached */
	hasContext(): boolean

	/** Get current execution context */
	getContext(): VedaTraceEdgeContext | undefined
}

/**
 * Create a VedaTrace logger instance
 *
 * @example
 * const logger = vedatrace({
 *   apiKey: 'your-api-key',
 *   service: 'my-service'
 * })
 */
export function vedatrace(config: VedaTraceConfig = {}): VedaTraceInstance {
	const logger = new VedaTraceLogger(config)
	const isEdge = isEdgeRuntime()

	if (config.apiKey && (!config.transports || config.transports.length === 0)) {
		const httpConfig: HttpTransportConfig = { apiKey: config.apiKey }
		if (config.endpoint) httpConfig.endpoint = config.endpoint

		const httpTransport = new VedaTraceHttpTransport(httpConfig)

		const shouldImmediateFlush =
			config.immediateFlush ?? (isEdge && !config.executionContext)

		const batcher = new VedaTraceBatcher(
			[httpTransport],
			{
				batchSize: config.batchSize ?? 100,
				flushInterval: config.flushInterval ?? (isEdge ? 1000 : 5000),
				maxRetries: config.maxRetries ?? 3,
				retryDelay: config.retryDelay ?? 1000,
				unrefTimer: config.unrefTimer,
				executionContext: config.executionContext,
			},
			config.onError,
			config.onSuccess,
			shouldImmediateFlush,
		)

		logger.setBatcher(batcher)

		if (typeof process !== "undefined") {
			const flushLogs = async (): Promise<void> => {
				await batcher.flush()
			}
			process.on("beforeExit", flushLogs)
			process.on("SIGTERM", flushLogs)
			process.on("SIGINT", flushLogs)
		}
	}

	return logger as VedaTraceInstance
}

/**
 * Create a console-only logger for development
 */
export function devVedatrace(
	config: Omit<VedaTraceConfig, "apiKey" | "transports"> = {},
): VedaTraceLoggerInterface {
	return vedatrace({
		...config,
		immediateFlush: true,
		transports: [
			new VedaTraceConsoleTransport({
				format: "pretty",
				colors: true,
			}),
		],
	})
}

export default vedatrace
