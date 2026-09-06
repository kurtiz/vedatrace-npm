/**
 * HTTP transport for sending logs to VedaTrace ingestion endpoint
 *
 * Features:
 * - Timeout support with AbortController
 * - Status-aware errors so the batcher can tell retryable from permanent
 * - Keepalive for the browser's final flush, with automatic splitting to stay
 *   under the 64 KiB body limit the fetch spec puts on keepalive requests
 */

import { parseRetryAfter, VedaTraceTransportError } from "../core/errors"
import type { InternalLogEntry, VedaTraceTransport } from "../core/types"

/**
 * The fetch spec caps the total body of in-flight keepalive requests at 64 KiB,
 * and a request over the limit is rejected outright. We split well below it so
 * a batch that only matters during page unload actually leaves the browser.
 */
const KEEPALIVE_MAX_BYTES = 56 * 1024

const encoder = new TextEncoder()

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
		if (logs.length === 0) return

		const body = JSON.stringify(logs.map(toWirePayload))

		// Keepalive requests over the spec's body limit are rejected, so halve the
		// batch until each piece fits. A single log that is still too large goes
		// out without keepalive: outside unload that succeeds normally, and during
		// unload an oversized log was never going to make it either way.
		if (this.keepalive && encoder.encode(body).length > KEEPALIVE_MAX_BYTES) {
			if (logs.length > 1) {
				const mid = Math.ceil(logs.length / 2)
				// Recurse so each half is re-measured: one split is not enough for a
				// batch several times over the limit.
				await this.send(logs.slice(0, mid))
				await this.send(logs.slice(mid))
				return
			}
			return this.post(body, false)
		}

		return this.post(body, this.keepalive)
	}

	private async post(body: string, keepalive: boolean): Promise<void> {
		const controller = new AbortController()
		const timeoutId = setTimeout(() => controller.abort(), this.timeout)

		try {
			const response = await fetch(this.endpoint, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"X-API-Key": this.apiKey,
					...this.headers,
				},
				body,
				signal: controller.signal,
				keepalive,
			})

			if (!response.ok) {
				const text = await response.text().catch(() => "")
				throw VedaTraceTransportError.fromStatus(
					response.status,
					text,
					parseRetryAfter(response.headers.get("Retry-After")),
				)
			}
		} catch (error) {
			if (error instanceof VedaTraceTransportError) throw error

			if (error instanceof Error && error.name === "AbortError") {
				throw new VedaTraceTransportError(
					`Request timeout after ${this.timeout}ms`,
					{ retryable: true },
				)
			}

			// Network-level failures (DNS, offline, connection reset) are transient.
			throw new VedaTraceTransportError(
				error instanceof Error ? error.message : String(error),
				{ retryable: true },
			)
		} finally {
			clearTimeout(timeoutId)
		}
	}

	/**
	 * No-op: this transport holds no buffer of its own. The batcher owns the
	 * queue and calls send() directly, including on the browser's final flush.
	 */
	async flush(): Promise<void> {
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

/** Shape the ingestion endpoint accepts. */
function toWirePayload(log: InternalLogEntry) {
	return {
		level: log.level,
		message: log.message,
		service: log.service,
		timestamp: log.timestamp
			? new Date(log.timestamp).toISOString()
			: undefined,
		metadata: log.metadata,
	}
}

/**
 * Browser HTTP transport: keepalive is always on so the final flush survives
 * the page going away.
 *
 * Note on `navigator.sendBeacon`: it cannot set request headers, and the
 * ingestion endpoint authenticates with `X-API-Key`, so a beacon would arrive
 * unauthenticated. Keepalive fetch is the only mechanism that carries both the
 * credentials and the payload past unload.
 */
export class VedaTraceHttpTransportBrowser extends VedaTraceHttpTransport {
	constructor(config: HttpTransportConfig) {
		super({ ...config, keepalive: true })
	}
}
