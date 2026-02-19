/**
 * HTTP transport for sending logs to VedaTrace ingestion endpoint
 */

import type { InternalLogEntry, VedaTraceTransport } from "../core/types"

export interface HttpTransportConfig {
	/** API key for authentication */
	apiKey: string
	/** Ingestion endpoint URL */
	endpoint?: string
	/** Request timeout in milliseconds */
	timeout?: number
	/** Additional headers */
	headers?: Record<string, string>
}

export class VedaTraceHttpTransport implements VedaTraceTransport {
	readonly name = "http"
	private endpoint: string
	private apiKey: string
	private timeout: number
	private headers: Record<string, string>

	constructor(config: HttpTransportConfig) {
		this.apiKey = config.apiKey
		this.endpoint = config.endpoint ?? "https://ingest.vedatrace.dev/v1/logs"
		this.timeout = config.timeout ?? 30000
		this.headers = config.headers ?? {}
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
}
