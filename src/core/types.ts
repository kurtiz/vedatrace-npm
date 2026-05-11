/**
 * Core types for VedaTrace SDK
 * Schema-compliant with ingestion endpoint
 */

/** Log severity levels */
export type VedaTraceLevel = "debug" | "info" | "warn" | "error" | "fatal"

/** Log entry structure matching ingestion API */
export interface VedaTraceLog {
	level: VedaTraceLevel
	message: string
	service?: string
	timestamp?: number
	metadata?: Record<string, unknown>
}

/**
 * Generic Edge Context interface for Cloudflare Workers / Pages / etc.
 * This avoids importing heavy framework-specific types and works with any
 * environment that provides a waitUntil() method.
 */
export interface VedaTraceEdgeContext {
	waitUntil(promise: Promise<unknown>): void
}

/** Configuration options for VedaTrace SDK */
export interface VedaTraceConfig {
	apiKey?: string
	service?: string
	endpoint?: string
	environment?: "production" | "staging" | "development" | string
	batchSize?: number
	flushInterval?: number
	maxRetries?: number
	retryDelay?: number
	redaction?: RedactionConfig
	transports?: VedaTraceTransport[]
	onError?: (error: Error) => void
	onSuccess?: () => void
	disabled?: boolean
	debug?: boolean
	immediateFlush?: boolean
	unrefTimer?: boolean
	autoStart?: boolean
	runtime?: RuntimeType

	/** Cloudflare Workers ExecutionContext - enables waitUntil support */
	executionContext?: VedaTraceEdgeContext
}

export interface RedactionConfig {
	paths?: string[]
	mask?: string
	autoDetectPii?: boolean
}

export type RuntimeType =
	| "node"
	| "browser"
	| "cloudflare"
	| "deno"
	| "bun"
	| "edge"

export interface VedaTraceTransport {
	name: string
	send(logs: InternalLogEntry[]): Promise<void> | void
	flush?(): Promise<void>
}

export interface LogMetadata {
	service?: string
	[key: string]: unknown
}

export interface InternalLogEntry extends VedaTraceLog {
	_sdk?: {
		source?: string
		version?: string
		stackTrace?: string
		browser?: {
			userAgent?: string
			url?: string
		}
	}
}

export interface BatcherConfig {
	batchSize: number
	flushInterval: number
	maxRetries: number
	retryDelay: number
	unrefTimer?: boolean
	executionContext?: VedaTraceEdgeContext
}

export interface VedaTraceLoggerInterface {
	debug(message: string, metadata?: LogMetadata): void
	info(message: string, metadata?: LogMetadata): void
	warn(message: string, metadata?: LogMetadata): void
	error(message: string | Error, metadata?: LogMetadata): void
	fatal(message: string | Error, metadata?: LogMetadata): void
	child(defaults: LogMetadata): VedaTraceLoggerInterface
	flush(): Promise<void>
	stop(): void
	start(): void
	runtime: RuntimeType
}

/** Extended logger interface with context support */
export interface VedaTraceInstance extends VedaTraceLoggerInterface {
	/** Attach execution context for waitUntil support */
	withContext(ctx: VedaTraceEdgeContext): this

	/** Check if context is attached */
	hasContext(): boolean

	/** Get current execution context */
	getContext(): VedaTraceEdgeContext | undefined
}
