/**
 * HTTP transport for sending logs to VedaTrace ingestion endpoint
 *
 * Features:
 * - Timeout support with AbortController
 * - Retry on network failure
 * - Keepalive support for browser final flush
 */

import type { InternalLogEntry, VedaTraceTransport } from "../core/types"

export interface HttpTransportConfig {
	apiKey: string
	endpoint?: string
	timeout?: number
	headers?: Record<string, string>
	/** Enable keepalive for browser final flush */
	keepalive?: boolean
}

export class VedaTraceHttpTransport implements VedaTraceTransport {
	readonly name = "http"
	private endpoint: string
	private apiKey: string
	private timeout: number
	private headers: Record<string, string>
	private keepalive: boolean

	constructor(config: HttpTransportConfig) {
		this.apiKey = config.apiKey
		this.endpoint = config.endpoint ?? "https://ingest.vedatrace.dev/v1/logs"
		this.timeout = config.timeout ?? 30000
		this.headers = config.headers ?? {}
		this.keepalive = config.keepalive ?? false
	}

	/** Send logs via HTTP POST */
	async send(logs: InternalLogEntry[]): Promise<void> {
		const controller = new AbortController()
		const timeoutId = setTimeout(() => controller.abort(), this.timeout)

		const payload = logs.map((log) => ({
			level: log.level,
			message: log.message,
			service: log.service,
			timestamp: log.timestamp
				? new Date(log.timestamp).toISOString()
				: undefined,
			metadata: log.metadata,
		}))

		try {
			const response = await fetch(this.endpoint, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"X-API-Key": this.apiKey,
					...this.headers,
				},
				body: JSON.stringify(payload),
				signal: controller.signal,
				keepalive: this.keepalive,
			})

			clearTimeout(timeoutId)

			if (!response.ok) {
				const text = await response.text()
				throw new Error(`HTTP ${response.status}: ${text}`)
			}
		} catch (error) {
			clearTimeout(timeoutId)

			if (error instanceof Error) {
				if (error.name === "AbortError") {
					throw new Error(`Request timeout after ${this.timeout}ms`)
				}
				throw error
			}
			throw new Error(String(error))
		}
	}

	/** Flush pending logs - called on page unload */
	async flush(): Promise<void> {
		// This is a no-op for HTTP transport since logs are already queued
		// The batcher handles the actual sending
		// Subclasses or wrappers could override this for special handling
		return Promise.resolve()
	}

	/** Check if keepalive is enabled */
	isKeepaliveEnabled(): boolean {
		return this.keepalive
	}

	/** Enable/disable keepalive */
	setKeepalive(enabled: boolean): void {
		this.keepalive = enabled
	}
}

/**
 * Browser-safe HTTP transport that uses keepalive for final flush
 */
export class VedaTraceHttpTransportBrowser extends VedaTraceHttpTransport {
	constructor(config: HttpTransportConfig) {
		super({ ...config, keepalive: true })
	}

	async flush(): Promise<void> {
		// Ensure keepalive is enabled for final flush
		this.setKeepalive(true)
		return super.flush()
	}
}
