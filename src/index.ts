/**
 * VedaTrace SDK - Universal JavaScript logging
 *
 * Import examples:
 * import { vedatrace } from 'vedatrace'
 * import { VedaTraceHttpTransport } from 'vedatrace/transports'
 * import { vedaTraceMiddleware } from 'vedatrace/express'
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

/**
 * Create a VedaTrace logger instance
 *
 * @example
 * ```typescript
 * const logger = vedatrace({
 *   apiKey: 'your-api-key',
 *   service: 'my-service'
 * })
 *
 * logger.info('Hello world')
 * logger.error('Something went wrong', { error: err })
 * ```
 */
export function vedatrace(
	config: VedaTraceConfig = {},
): VedaTraceLoggerInterface {
	const logger = new VedaTraceLogger(config)

	const isEdge = isEdgeRuntime()

	const shouldImmediateFlush = config.immediateFlush ?? isEdge

	// If API key provided and no custom transports, add HTTP transport
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

	return logger
}

/**
 * Create a console-only logger for development
 *
 * @example
 * ```typescript
 * const logger = devVedatrace({ service: 'my-service' })
 * ```
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

// Default export
export default vedatrace
