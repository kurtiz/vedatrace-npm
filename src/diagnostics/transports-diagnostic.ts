/**
 * DIAGNOSTIC VERSION - transports/http.ts
 *
 * This file is a drop-in replacement for src/transports/http.ts that intercepts
 * and logs all fetch-related errors that would otherwise be silently caught.
 *
 * Use by renaming/deleting the original and renaming this file, or by importing
 * this directly in your Cloudflare Worker entry point before vedatrace.
 */

import type { InternalLogEntry, VedaTraceTransport } from "../core/types"
import {
	logDiagnostic,
	logFetchRequest,
	logFetchResponse,
	logTransportError,
} from "../diagnostics/index"

export interface HttpTransportConfig {
	apiKey: string
	endpoint?: string
	timeout?: number
	headers?: Record<string, string>
	/** Override endpoint for testing */
	_endpointOverride?: string
}

export class DiagnosticHttpTransport implements VedaTraceTransport {
	readonly name = "http-diagnostic"
	private endpoint: string
	private apiKey: string
	private timeout: number
	private headers: Record<string, string>

	constructor(config: HttpTransportConfig) {
		this.apiKey = config.apiKey
		this.endpoint =
			config._endpointOverride ??
			config.endpoint ??
			"https://ingest.vedatrace.dev/v1/logs"
		this.timeout = config.timeout ?? 30000
		this.headers = config.headers ?? {}
	}

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

		const requestHeaders = {
			"Content-Type": "application/json",
			"X-API-Key": this.apiKey,
			...this.headers,
		}

		logFetchRequest(this.endpoint, "POST", requestHeaders, payload)

		try {
			logDiagnostic("info", ">> Calling fetch()...")

			const response = await fetch(this.endpoint, {
				method: "POST",
				headers: requestHeaders,
				body: JSON.stringify(payload),
				signal: controller.signal,
			})

			clearTimeout(timeoutId)

			logFetchResponse(response.status, response.statusText, "")

			if (!response.ok) {
				const text = await response.text()
				logFetchResponse(response.status, response.statusText, text)

				const httpError = new Error(`HTTP ${response.status}: ${text}`)
				logTransportError(httpError, "HTTP response not OK")
				throw httpError
			}

			logDiagnostic("info", "<< fetch() completed successfully")
		} catch (error) {
			clearTimeout(timeoutId)

			if (error instanceof Error) {
				logDiagnostic("error", ">> fetch() threw an exception")
				logTransportError(error, "fetch exception")

				if (error.name === "AbortError") {
					const timeoutError = new Error(
						`Request timeout after ${this.timeout}ms`,
					)
					logTransportError(timeoutError, "timeout")
					throw timeoutError
				}

				if (
					error.message.includes("Failed to fetch") ||
					error.message.includes("fetch failed")
				) {
					logDiagnostic(
						"error",
						"!! NETWORK FAILURE - possible CORS, DNS, or connection refused",
					)
					logDiagnostic(
						"error",
						"!! This error is silently swallowed in production - check your endpoint URL",
					)
				}

				throw error
			}

			const unknownError = new Error(String(error))
			logTransportError(unknownError, "unknown")
			throw unknownError
		}
	}
}
