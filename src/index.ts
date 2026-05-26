/**
 * VedaTrace SDK - Universal JavaScript logging
 *
 * Supports all JavaScript environments:
 * - Cloudflare Workers / Pages: waitUntil() for background flush
 * - Node.js: standard batching with process event handlers
 * - Bun: standard batching with unref timers
 * - Deno: standard batching with unref timers
 * - Browser: batching with visibility lifecycle handling
 * - Generic Edge: immediate flush fallback
 *
 * @example
 * // Cloudflare Worker
 * const logger = vedatrace({ apiKey: 'key', service: 'app' }).withContext(ctx)
 *
 * @example
 * // Node.js / Express
 * const logger = vedatrace({ apiKey: 'key', service: 'app' })
 * // Automatic shutdown handlers via process.on()
 *
 * @example
 * // Browser
 * const logger = vedatrace({ apiKey: 'key', service: 'app' })
 * // Automatic flush on visibilitychange / pagehide
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
export {
	VedaTraceHttpTransport,
	VedaTraceHttpTransportBrowser,
} from "@/transports/http"
export { BrowserLifecycle } from "@/utils/browser-lifecycle"
export { redact } from "@/utils/redaction"
export {
	detectRuntime,
	isBrowser,
	isEdgeRuntime,
	isLongRunning,
	isServerless,
} from "@/utils/runtime"

import { VedaTraceBatcher } from "@/core/batcher"
import { VedaTraceLogger } from "@/core/logger"
import type { VedaTraceConfig, VedaTraceLoggerInterface } from "@/core/types"
import type { HttpTransportConfig } from "@/transports"
import {
	VedaTraceConsoleTransport,
	VedaTraceHttpTransport,
	VedaTraceHttpTransportBrowser,
} from "@/transports"
import { BrowserLifecycle } from "@/utils/browser-lifecycle"
import {
	detectRuntime,
	isBrowser,
	isLongRunning,
	isServerless,
} from "@/utils/runtime"

/** Runtime-specific flush interval defaults */
const RUNTIME_FLUSH_INTERVALS: Record<string, number> = {
	node: 3000,
	bun: 3000,
	deno: 3000,
	browser: 3000,
	cloudflare: 1000,
	edge: 1000,
}

/**
 * Create a VedaTrace logger instance
 *
 * Handles all runtimes with environment-appropriate strategies:
 * 1. Cloudflare/Edge: immediate flush with waitUntil if context available
 * 2. Node/Bun/Deno: standard batching with process/unref timers
 * 3. Browser: batching with visibility lifecycle handlers
 */
export function vedatrace(
	config: VedaTraceConfig = {},
): VedaTraceLoggerInterface {
	const runtime = detectRuntime()
	const logger = new VedaTraceLogger(config)

	// Only set up transports if apiKey is provided without custom transports
	if (config.apiKey && (!config.transports || config.transports.length === 0)) {
		const isBrowserEnv = isBrowser()
		const isServerlessEnv = isServerless()
		const isLongRunningEnv = isLongRunning()

		// Select appropriate HTTP transport based on environment
		const HttpTransport = isBrowserEnv
			? VedaTraceHttpTransportBrowser
			: VedaTraceHttpTransport

		const httpConfig: HttpTransportConfig = {
			apiKey: config.apiKey,
			keepalive: isBrowserEnv || isServerlessEnv,
		}
		if (config.endpoint) httpConfig.endpoint = config.endpoint

		const httpTransport = new HttpTransport(httpConfig)

		// Determine batching strategy based on runtime
		let immediateFlush = config.immediateFlush ?? false
		let shouldUnrefTimer = false

		if (isServerlessEnv) {
			// Cloudflare / generic edge: use immediate flush if no context
			immediateFlush = config.immediateFlush ?? !config.executionContext
		} else if (isLongRunningEnv) {
			// Node/Bun/Deno: standard batching with unref
			immediateFlush = config.immediateFlush ?? false
			shouldUnrefTimer = true
		} else if (isBrowserEnv) {
			// Browser: standard batching with lifecycle handlers
			immediateFlush = config.immediateFlush ?? false
		}

		const flushInterval =
			config.flushInterval ?? RUNTIME_FLUSH_INTERVALS[runtime] ?? 3000

		const batcher = new VedaTraceBatcher(
			[httpTransport],
			{
				batchSize: config.batchSize ?? 100,
				flushInterval,
				maxRetries: config.maxRetries ?? 3,
				retryDelay: config.retryDelay ?? 1000,
				unrefTimer: config.unrefTimer ?? shouldUnrefTimer,
				executionContext: config.executionContext,
				onError: config.onError,
				onSuccess: config.onSuccess,
				debug: config.debug,
				waitUntil: config.waitUntil,
			},
			immediateFlush,
		)

		logger.setBatcher(batcher)

		// Attach process handlers for Node.js / Bun / Deno
		// Also attach when process.versions.node exists (fallback for runtimes like
		// TanStack Start dev that polyfill navigator and get misidentified as "cloudflare")
		const isNodeRuntime =
			typeof process !== "undefined" && process.versions?.node
		if (typeof process !== "undefined" && (isLongRunningEnv || isNodeRuntime)) {
			const flushLogs = async (): Promise<void> => {
				await batcher.flush()
			}
			process.on("beforeExit", flushLogs)
			process.on("SIGTERM", flushLogs)
			process.on("SIGINT", flushLogs)
		}

		// Attach browser lifecycle handlers
		if (isBrowserEnv) {
			const lifecycle = new BrowserLifecycle({
				transports: [httpTransport],
				flush: () => batcher.flush(),
				debug: config.debug,
			})
			lifecycle.attach()

			// Store lifecycle reference for cleanup
			;(logger as unknown as { _lifecycle?: BrowserLifecycle })._lifecycle =
				lifecycle
		}
	}

	return logger as VedaTraceLoggerInterface
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
