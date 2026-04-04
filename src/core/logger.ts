/**
 * Core VedaTrace Logger implementation
 */

import { detectRuntime } from "../utils/runtime"
import { VedaTraceBatcher } from "./batcher"
import type {
	InternalLogEntry,
	LogMetadata,
	RuntimeType,
	VedaTraceConfig,
	VedaTraceLevel,
	VedaTraceLoggerInterface,
} from "./types"

const SDK_VERSION = "1.0.0"

export class VedaTraceLogger implements VedaTraceLoggerInterface {
	private batcher: VedaTraceBatcher | null = null
	public runtime: RuntimeType
	private config: Required<
		Pick<
			VedaTraceConfig,
			"batchSize" | "flushInterval" | "maxRetries" | "retryDelay"
		>
	> &
		Pick<
			VedaTraceConfig,
			| "endpoint"
			| "onError"
			| "onSuccess"
			| "debug"
			| "immediateFlush"
			| "unrefTimer"
		> & {
			service?: string
			apiKey?: string
			environment?: string
		}
	private childDefaults: LogMetadata

	constructor(config: VedaTraceConfig = {}, childDefaults: LogMetadata = {}) {
		this.runtime = config.runtime ?? detectRuntime()
		this.childDefaults = childDefaults
		this.config = {
			service: config.service,
			apiKey: config.apiKey,
			endpoint: config.endpoint ?? "https://ingest.vedatrace.dev/v1/logs",
			environment: config.environment,
			batchSize: config.batchSize ?? 100,
			flushInterval: config.flushInterval ?? 5000,
			maxRetries: config.maxRetries ?? 3,
			retryDelay: config.retryDelay ?? 1000,
			onError: config.onError,
			onSuccess: config.onSuccess,
			debug: config.debug ?? false,
			immediateFlush: config.immediateFlush ?? false,
			unrefTimer: config.unrefTimer,
		}

		// Initialize batcher if not disabled
		if (!config.disabled) {
			this.initializeBatcher(config)
		}
	}

	/** Initialize the batcher with transports */
	private initializeBatcher(config: VedaTraceConfig): void {
		const transports = config.transports ?? []

		// Add HTTP transport if API key provided and no transports specified
		if (config.apiKey && transports.length === 0) {
			// HTTP transport will be added in index.ts to avoid circular deps
			// For now, we'll handle this in the factory function
		}

		if (transports.length > 0) {
			this.batcher = new VedaTraceBatcher(
				transports,
				{
					batchSize: this.config.batchSize,
					flushInterval: this.config.flushInterval,
					maxRetries: this.config.maxRetries,
					retryDelay: this.config.retryDelay,
					unrefTimer: this.config.unrefTimer,
				},
				this.config.onError,
				this.config.onSuccess,
				this.config.immediateFlush,
			)
		}
	}

	/** Set batcher (called from factory function) */
	setBatcher(batcher: VedaTraceBatcher): void {
		this.batcher = batcher
	}

	/** Log at debug level */
	debug(message: string, metadata?: LogMetadata): void {
		this.log("debug", message, metadata)
	}

	/** Log at info level */
	info(message: string, metadata?: LogMetadata): void {
		this.log("info", message, metadata)
	}

	/** Log at warn level */
	warn(message: string, metadata?: LogMetadata): void {
		this.log("warn", message, metadata)
	}

	/** Log at error level */
	error(message: string | Error, metadata?: LogMetadata): void {
		this.log("error", message, metadata)
	}

	/** Log at fatal level */
	fatal(message: string | Error, metadata?: LogMetadata): void {
		this.log("fatal", message, metadata)
	}

	/** Internal log method */
	private log(
		level: VedaTraceLevel,
		message: string | Error,
		metadata?: LogMetadata,
	): void {
		if (!this.batcher) {
			return
		}

		// Merge child defaults with provided metadata
		const mergedMetadata = { ...this.childDefaults, ...metadata }

		// Extract service if provided in metadata (remove from metadata to avoid duplication)
		const { service: metaService, ...cleanMetadata } = mergedMetadata
		const service = metaService ?? this.config.service

		// Build log entry
		const logEntry: InternalLogEntry = {
			level,
			message: message instanceof Error ? message.message : message,
			service,
			timestamp: Date.now(),
			metadata: cleanMetadata,
			_sdk: {
				source: this.detectEnvironment(),
				version: SDK_VERSION,
			},
		}

		// Add stack trace for errors
		if (message instanceof Error) {
			logEntry._sdk ??= {}
			logEntry._sdk.stackTrace = message.stack
		}

		// Debug output
		if (this.config.debug) {
			// eslint-disable-next-line no-console
			console.log(`[VedaTrace:${level}]`, logEntry)
		}

		this.batcher.add(logEntry)
	}

	/** Create a child logger with default metadata */
	child(defaults: LogMetadata): VedaTraceLoggerInterface {
		const mergedDefaults = { ...this.childDefaults, ...defaults }
		const childLogger = new VedaTraceLogger(
			{
				service: this.config.service,
				apiKey: this.config.apiKey,
				endpoint: this.config.endpoint,
				environment: this.config.environment,
				disabled: !this.batcher,
			},
			mergedDefaults,
		)

		// Share the same batcher for efficiency
		if (this.batcher) {
			childLogger.setBatcher(this.batcher)
		}

		return childLogger
	}

	/** Flush pending logs */
	async flush(): Promise<void> {
		if (this.batcher) {
			await this.batcher.flush()
		}
	}

	/** Stop the batcher and flush timer */
	stop(): void {
		if (this.batcher) {
			this.batcher.stop()
		}
	}

	/** Start the flush timer (for manual control in edge runtimes) */
	start(): void {
		if (this.batcher) {
			this.batcher.start()
		}
	}

	/** Detect runtime environment (legacy, kept for compatibility) */
	private detectEnvironment(): string {
		if (typeof globalThis !== "undefined" && "navigator" in globalThis) {
			return "browser"
		}
		if (typeof process !== "undefined" && process.versions?.node) {
			return "node"
		}
		return "edge"
	}
}
