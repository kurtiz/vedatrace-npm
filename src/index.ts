/**
 * VedaTrace SDK - Universal JavaScript logging
 *
 * Import examples:
 * import { vedatrace } from 'vedatrace'
 * import { VedaTraceHttpTransport } from 'vedatrace/transports'
 * import { vedaTraceMiddleware } from 'vedatrace/express'
 */

export type {
	VedaTraceConfig,
	VedaTraceLog,
	VedaTraceLevel,
	VedaTraceTransport,
	VedaTraceLoggerInterface,
	LogMetadata,
	RedactionConfig,
	InternalLogEntry,
	BatcherConfig,
} from "./core/types"

export { VedaTraceLogger } from "./core/logger"
export { VedaTraceBatcher } from "./core/batcher"
export { VedaTraceHttpTransport } from "./transports/http"
export { VedaTraceConsoleTransport } from "./transports/console"
export type { HttpTransportConfig } from "./transports/http"
export type {
	ConsoleTransportConfig,
	ConsoleFormat,
} from "./transports/console"
export { redact } from "./utils/redaction"

import { VedaTraceBatcher } from "./core/batcher"
import { VedaTraceLogger } from "./core/logger"
import type { VedaTraceConfig, VedaTraceLoggerInterface } from "./core/types"
import { VedaTraceConsoleTransport } from "./transports/console"
import { VedaTraceHttpTransport } from "./transports/http"

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

	// If API key provided and no custom transports, add HTTP transport
	if (config.apiKey && (!config.transports || config.transports.length === 0)) {
		const httpTransport = new VedaTraceHttpTransport({
			apiKey: config.apiKey,
			endpoint: config.endpoint,
		})

		const batcher = new VedaTraceBatcher(
			[httpTransport],
			{
				batchSize: config.batchSize ?? 100,
				flushInterval: config.flushInterval ?? 5000,
				maxRetries: config.maxRetries ?? 3,
				retryDelay: config.retryDelay ?? 1000,
			},
			config.onError,
			config.onSuccess,
		)

		logger.setBatcher(batcher)
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
