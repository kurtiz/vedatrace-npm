/**
 * Core types for VedaTrace SDK (revised)
 * Includes ExecutionContext support for Cloudflare Workers
 */

export type VedaTraceLevel = "debug" | "info" | "warn" | "error" | "fatal"

export interface VedaTraceLog {
	level: VedaTraceLevel
	message: string
	service?: string
	timestamp?: number
	metadata?: Record<string, unknown>
}

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
	executionContext?: {
		waitUntil(promise: Promise<unknown>): void
	}
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
	executionContext?: {
		waitUntil(promise: Promise<unknown>): void
	}
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
