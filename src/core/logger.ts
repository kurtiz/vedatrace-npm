/**
 * Core VedaTrace Logger implementation
 * Supports Cloudflare Workers / Pages via withContext() integration
 */

import { detectRuntime } from "@/utils/runtime"
import { VedaTraceBatcher } from "./batcher"
import type {
	BatcherConfig,
	InternalLogEntry,
	LogMetadata,
	RuntimeType,
	VedaTraceConfig,
	VedaTraceEdgeContext,
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
			| "debug"
			| "immediateFlush"
			| "unrefTimer"
		>
	> & {
		service?: string
		apiKey?: string
		environment?: string
	}
	private readonly childDefaults: LogMetadata
	private _context: VedaTraceEdgeContext | undefined

	constructor(config: VedaTraceConfig = {}, childDefaults: LogMetadata = {}) {
		this.runtime = config.runtime ?? detectRuntime()
		this.childDefaults = childDefaults
		this._context = config.executionContext
		this.config = {
			service: config.service,
			apiKey: config.apiKey,
			endpoint: config.endpoint ?? "https://ingest.vedatrace.dev/v1/logs",
			environment: config.environment,
			batchSize: config.batchSize ?? 100,
			flushInterval: config.flushInterval ?? 5000,
			maxRetries: config.maxRetries ?? 3,
			retryDelay: config.retryDelay ?? 1000,
			debug: config.debug ?? false,
			immediateFlush: config.immediateFlush ?? false,
			unrefTimer: config.unrefTimer ?? false,
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
				executionContext: this._context,
				onError: config.onError,
				onSuccess: config.onSuccess,
			}

			this.batcher = new VedaTraceBatcher(
				transports,
				batcherConfig,
				this.config.immediateFlush,
			)
		}
	}

	setBatcher(batcher: VedaTraceBatcher): void {
		this.batcher = batcher
	}

	/** Attach execution context for waitUntil support (Cloudflare Workers / Pages) */
	withContext(ctx: VedaTraceEdgeContext): this {
		this._context = ctx

		if (this.batcher) {
			this.batcher.setContext(ctx)
		}

		return this
	}

	/** Check if context is attached */
	hasContext(): boolean {
		return this._context !== undefined
	}

	/** Get current execution context */
	getContext(): VedaTraceEdgeContext | undefined {
		return this._context
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
				executionContext: this._context,
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

			if (this._context) {
				this._context.waitUntil(flushPromise)
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
