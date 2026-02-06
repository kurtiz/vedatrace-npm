/**
 * Core types for VedaTrace SDK
 * Schema-compliant with ingestion endpoint
 */

/** Log severity levels */
export type VedaTraceLevel = "debug" | "info" | "warn" | "error" | "fatal"

/** Log entry structure matching ingestion API */
export interface VedaTraceLog {
	/** Log severity level */
	level: VedaTraceLevel
	/** Log message */
	message: string
	/** Service name (optional, can override default) */
	service?: string
	/** Unix timestamp in milliseconds (optional, auto-generated if not provided) */
	timestamp?: number
	/** Arbitrary metadata object */
	metadata?: Record<string, unknown>
}

/** Configuration options for VedaTrace SDK */
export interface VedaTraceConfig {
	/** API key for authentication */
	apiKey?: string
	/** Default service name for all logs */
	service?: string
	/** Ingestion endpoint URL */
	endpoint?: string
	/** Environment identifier */
	environment?: "production" | "staging" | "development" | string
	/** Batch size before flushing (default: 100) */
	batchSize?: number
	/** Flush interval in milliseconds (default: 5000) */
	flushInterval?: number
	/** Maximum retry attempts for failed requests (default: 3) */
	maxRetries?: number
	/** Delay between retries in milliseconds (default: 1000) */
	retryDelay?: number
	/** Redaction configuration for PII */
	redaction?: RedactionConfig
	/** Custom transports (defaults to HTTP if apiKey provided) */
	transports?: VedaTraceTransport[]
	/** Callback for transport errors */
	onError?: (error: Error) => void
	/** Callback for successful sends */
	onSuccess?: () => void
	/** Disable logging entirely */
	disabled?: boolean
	/** Enable debug mode (verbose console output) */
	debug?: boolean
}

/** Redaction configuration */
export interface RedactionConfig {
	/** Field paths to redact (e.g., ['password', 'user.token']) */
	paths?: string[]
	/** Custom redaction mask (default: '[REDACTED]') */
	mask?: string
	/** Enable automatic PII detection */
	autoDetectPii?: boolean
}

/** Transport interface for sending logs */
export interface VedaTraceTransport {
	/** Transport name */
	name: string
	/** Send logs to destination */
	send(logs: VedaTraceLog[]): Promise<void> | void
	/** Flush any pending logs */
	flush?(): Promise<void>
}

/** Metadata that can be passed to log methods */
export interface LogMetadata {
	/** Override default service name */
	service?: string
	/** Any other metadata fields */
	[key: string]: unknown
}

/** Internal log entry with SDK metadata */
export interface InternalLogEntry extends VedaTraceLog {
	/** SDK-generated fields */
	_sdk?: {
		/** Source of the log (node, browser, edge) */
		source?: string
		/** SDK version */
		version?: string
		/** Error stack trace if log is an error */
		stackTrace?: string
		/** Browser info */
		browser?: {
			userAgent?: string
			url?: string
		}
	}
}

/** Batcher configuration */
export interface BatcherConfig {
	batchSize: number
	flushInterval: number
	maxRetries: number
	retryDelay: number
}

/** Logger interface */
export interface VedaTraceLoggerInterface {
	debug(message: string, metadata?: LogMetadata): void
	info(message: string, metadata?: LogMetadata): void
	warn(message: string, metadata?: LogMetadata): void
	error(message: string | Error, metadata?: LogMetadata): void
	fatal(message: string | Error, metadata?: LogMetadata): void
	child(defaults: LogMetadata): VedaTraceLoggerInterface
	flush(): Promise<void>
}
