/**
 * Core VedaTrace Logger implementation (revised)
 *
 * Key changes:
 * 1. Added withExecutionContext() for Cloudflare Workers support
 * 2. Protected flush via waitUntil() when ExecutionContext is attached
 * 3. Better batcher management with execution context passthrough
 */

import { detectRuntime } from "@/utils/runtime"
import { VedaTraceBatcher } from "./batcher"
import type {
	BatcherConfig,
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
			| "batchSize"
			| "flushInterval"
			| "maxRetries"
			| "retryDelay"
			| "endpoint"
			| "onError"
			| "onSuccess"
			| "debug"
			| "immediateFlush"
			| "unrefTimer"
		>
	> & {
		service?: string
		apiKey?: string
		environment?: string
	}
	private childDefaults: LogMetadata
	private _executionContext?: { waitUntil(promise: Promise<unknown>): void }

	constructor(config: VedaTraceConfig = {}, childDefaults: LogMetadata = {}) {
		this.runtime = config.runtime ?? detectRuntime()
		this.childDefaults = childDefaults
		this._executionContext = config.executionContext
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

		if (!config.disabled) {
			this.initializeBatcher(config)
		}
	}

	private initializeBatcher(config: VedaTraceConfig): void {
		const transports = config.transports ?? []

		if (transports.length > 0) {
			const batcherConfig: BatcherConfig = {
				batchSize: this.config.batchSize,
				flushInterval: this.config.flushInterval,
				maxRetries: this.config.maxRetries,
				retryDelay: this.config.retryDelay,
				unrefTimer: this.config.unrefTimer,
				executionContext: this._executionContext,
			}

			this.batcher = new VedaTraceBatcher(
				transports,
				batcherConfig,
				this.config.onError,
				this.config.onSuccess,
				this.config.immediateFlush,
			)
		}
	}

	setBatcher(batcher: VedaTraceBatcher): void {
		this.batcher = batcher
	}

	withExecutionContext(ctx: {
		waitUntil(promise: Promise<unknown>): void
	}): this {
		this._executionContext = ctx

		if (this.batcher) {
			this.batcher.setExecutionContext(ctx)
		}

		return this
	}

	debug(message: string, metadata?: LogMetadata): void {
		this.log("debug", message, metadata)
	}

	info(message: string, metadata?: LogMetadata): void {
		this.log("info", message, metadata)
	}

	warn(message: string, metadata?: LogMetadata): void {
		this.log("warn", message, metadata)
	}

	error(message: string | Error, metadata?: LogMetadata): void {
		this.log("error", message, metadata)
	}

	fatal(message: string | Error, metadata?: LogMetadata): void {
		this.log("fatal", message, metadata)
	}

	private log(
		level: VedaTraceLevel,
		message: string | Error,
		metadata?: LogMetadata,
	): void {
		if (!this.batcher) {
			return
		}

		const mergedMetadata = { ...this.childDefaults, ...metadata }
		const { service: metaService, ...cleanMetadata } = mergedMetadata
		const service = metaService ?? this.config.service

		const logEntry: InternalLogEntry = {
			level,
			message: message instanceof Error ? message.message : message,
			service,
			timestamp: Date.now(),
			metadata: cleanMetadata,
			_sdk: {
				source: detectRuntime(),
				version: SDK_VERSION,
			},
		}

		if (message instanceof Error) {
			logEntry._sdk ??= {}
			logEntry._sdk.stackTrace = message.stack
		}

		if (this.config.debug) {
			console.log(`[VedaTrace:${level}]`, logEntry)
		}

		this.batcher.add(logEntry)
	}

	child(defaults: LogMetadata): VedaTraceLoggerInterface {
		const mergedDefaults = { ...this.childDefaults, ...defaults }
		const childLogger = new VedaTraceLogger(
			{
				service: this.config.service,
				apiKey: this.config.apiKey,
				endpoint: this.config.endpoint,
				environment: this.config.environment,
				disabled: !this.batcher,
				executionContext: this._executionContext,
			},
			mergedDefaults,
		)

		if (this.batcher) {
			childLogger.setBatcher(this.batcher)
		}

		return childLogger
	}

	async flush(): Promise<void> {
		if (this.batcher) {
			const flushPromise = this.batcher.flush()

			if (this._executionContext) {
				this._executionContext.waitUntil(flushPromise)
			}

			return flushPromise
		}
	}

	stop(): void {
		if (this.batcher) {
			this.batcher.stop()
		}
	}

	start(): void {
		if (this.batcher) {
			this.batcher.start()
		}
	}
}
