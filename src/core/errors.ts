/**
 * Transport error types
 *
 * The batcher needs to tell three cases apart:
 *   - retryable  (network blip, timeout, 429, 5xx) — back off and try again
 *   - permanent  (400 malformed batch) — retrying wastes the caller's time
 *   - fatal      (401/403 bad key or blocked origin) — every future batch will
 *                fail the same way, so stop instead of burning a request per flush
 */

/** HTTP statuses worth retrying. Everything else in 4xx is the caller's fault. */
const RETRYABLE_STATUSES = new Set([408, 425, 429])

/** Statuses that mean the credentials themselves are wrong. */
const FATAL_STATUSES = new Set([401, 403])

export class VedaTraceTransportError extends Error {
	readonly name = "VedaTraceTransportError"
	readonly status: number | undefined
	readonly retryable: boolean
	readonly fatal: boolean
	/** Server-requested backoff from a `Retry-After` header, in milliseconds. */
	readonly retryAfterMs: number | undefined

	constructor(
		message: string,
		options: {
			status?: number
			retryable?: boolean
			fatal?: boolean
			retryAfterMs?: number
		} = {},
	) {
		super(message)
		this.status = options.status
		this.fatal = options.fatal ?? false
		this.retryable = options.retryable ?? true
		this.retryAfterMs = options.retryAfterMs
	}

	/** Build an error from an HTTP response status. */
	static fromStatus(
		status: number,
		body: string,
		retryAfterMs?: number,
	): VedaTraceTransportError {
		const fatal = FATAL_STATUSES.has(status)
		const retryable = status >= 500 || RETRYABLE_STATUSES.has(status)

		return new VedaTraceTransportError(`HTTP ${status}: ${body}`, {
			status,
			retryable,
			fatal,
			retryAfterMs,
		})
	}
}

/**
 * Unknown errors (a thrown string, a DOM exception, an offline fetch) are
 * treated as retryable — a transient network fault is by far the likeliest
 * cause, and retrying a handful of times is cheap.
 */
export function isRetryable(error: unknown): boolean {
	if (error instanceof VedaTraceTransportError) return error.retryable
	return true
}

export function isFatal(error: unknown): boolean {
	return error instanceof VedaTraceTransportError && error.fatal
}

/** The longest server-requested backoff among a set of errors, if any. */
export function retryAfterMs(errors: unknown[]): number | undefined {
	let longest: number | undefined
	for (const error of errors) {
		if (error instanceof VedaTraceTransportError && error.retryAfterMs) {
			longest = Math.max(longest ?? 0, error.retryAfterMs)
		}
	}
	return longest
}

/** Parse a `Retry-After` header — either delta-seconds or an HTTP date. */
export function parseRetryAfter(header: string | null): number | undefined {
	if (!header) return undefined

	const seconds = Number(header)
	if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000)

	const date = Date.parse(header)
	if (!Number.isNaN(date)) return Math.max(0, date - Date.now())

	return undefined
}
