/**
 * VedaTrace SDK - Universal JavaScript logging (revised for edge)
 *
 * Usage with Cloudflare Workers / Hono (recommended):
 * ```typescript
 * import { vedatrace } from 'vedatrace'
 *
 * export default {
 *   async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
 *     const logger = vedatrace({
 *       apiKey: env.VEDATRACE_API_KEY,
 *       service: 'my-worker',
 *     })
 *
 *     logger.withExecutionContext(ctx)
 *     logger.info('Request received')
 *
 *     // Background flush is protected by ctx.waitUntil()
 *     return await app.fetch(request, env, ctx)
 *   }
 * }
 * ```
 *
 * Usage without ExecutionContext (manual flush required):
 * ```typescript
 * app.get('/sync', async (c) => {
 *   const logger = vedatrace({ apiKey: 'key', service: 'app' })
 *   logger.info('log before response')
 *   await logger.flush() // Must await before returning
 *   return c.json({ ok: true })
 * })
 * ```
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
import type { VedaTraceConfig, VedaTraceLoggerInterface } from "@/core/types"
import type { HttpTransportConfig } from "@/transports"
import { VedaTraceConsoleTransport, VedaTraceHttpTransport } from "@/transports"
import { isEdgeRuntime } from "@/utils/runtime"

export interface VedaTraceInstance extends VedaTraceLoggerInterface {
	withExecutionContext(ctx: {
		waitUntil(promise: Promise<unknown>): void
	}): this
}

export function vedatrace(config: VedaTraceConfig = {}): VedaTraceInstance {
	const logger = new VedaTraceLogger(config)
	const isEdge = isEdgeRuntime()

	if (config.apiKey && (!config.transports || config.transports.length === 0)) {
		const httpConfig: HttpTransportConfig = { apiKey: config.apiKey }
		if (config.endpoint) httpConfig.endpoint = config.endpoint

		const httpTransport = new VedaTraceHttpTransport(httpConfig)

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
			config.immediateFlush ?? (isEdge && !config.executionContext),
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
