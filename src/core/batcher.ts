/**
 * Log batcher with background flushing
 * Handles queueing, batching, and retry logic
 */

import type {
	BatcherConfig,
	InternalLogEntry,
	VedaTraceTransport,
} from "./types"

export class VedaTraceBatcher {
	private queue: InternalLogEntry[] = []
	private flushTimer: ReturnType<typeof setInterval> | null = null
	private isFlushing = false
	private pendingFlush: Promise<void> | null = null

	constructor(
		private transports: VedaTraceTransport[],
		private config: BatcherConfig,
		private onError?: (error: Error) => void,
		private onSuccess?: (() => void) | undefined,
		private immediateFlush = false,
		autoStart = true,
	) {
		if (autoStart && !immediateFlush) {
			this.startFlushTimer()
		}
	}

	/** Add log to queue */
	add(log: InternalLogEntry): void {
		this.queue.push(log)

		if (this.immediateFlush || this.queue.length >= this.config.batchSize) {
			this.flush()
		}
	}

	/** Flush logs to all transports */
	async flush(): Promise<void> {
		if (this.isFlushing) {
			// Return existing pending flush
			return this.pendingFlush ?? Promise.resolve()
		}

		if (this.queue.length === 0) {
			return Promise.resolve()
		}

		this.isFlushing = true
		const logsToSend = [...this.queue]
		this.queue = []

		this.pendingFlush = this.sendWithRetry(logsToSend).finally(() => {
			this.isFlushing = false
			this.pendingFlush = null
		})

		return this.pendingFlush
	}

	/** Send logs with retry logic */
	private async sendWithRetry(
		logs: InternalLogEntry[],
		attempt = 0,
	): Promise<void> {
		const errors: Error[] = []

		for (const transport of this.transports) {
			try {
				await transport.send(logs)
			} catch (error) {
				errors.push(error instanceof Error ? error : new Error(String(error)))
			}
		}

		if (errors.length > 0 && errors.length === this.transports.length) {
			// All transports failed
			if (attempt < this.config.maxRetries) {
				// Retry after delay
				await this.delay(this.config.retryDelay * (attempt + 1))
				return this.sendWithRetry(logs, attempt + 1)
			}

			// Max retries reached, report error
			const combinedError = new Error(
				`Failed to send logs after ${this.config.maxRetries} retries: ${errors.map((e) => e.message).join(", ")}`,
			)
			if (this.onError) {
				this.onError(combinedError)
			} else {
				// Prevent unhandled rejection in runtimes like Cloudflare Workers
				console.error("[VedaTrace]", combinedError.message)
			}
			return
		}

		// At least one transport succeeded
		this.onSuccess?.()
	}

	/** Start the flush interval timer */
	private startFlushTimer(): void {
		if (this.flushTimer) {
			clearInterval(this.flushTimer)
		}

		this.flushTimer = setInterval(() => {
			if (this.queue.length > 0) {
				this.flush().catch((error) => {
					if (this.onError) {
						this.onError(
							error instanceof Error ? error : new Error(String(error)),
						)
					} else {
						console.error(
							"[VedaTrace] Flush error:",
							error instanceof Error ? error.message : String(error),
						)
					}
				})
			}
		}, this.config.flushInterval)

		if (this.config.unrefTimer === true) {
			this.flushTimer.unref()
		}
	}

	/** Stop the flush timer */
	stop(): void {
		if (this.flushTimer) {
			clearInterval(this.flushTimer)
			this.flushTimer = null
		}
	}

	/** Start the flush timer (for manual control in edge runtimes) */
	start(): void {
		if (!this.flushTimer && !this.immediateFlush) {
			this.startFlushTimer()
		}
	}

	/** Delay helper */
	private delay(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms))
	}

	/** Get current queue size */
	getQueueSize(): number {
		return this.queue.length
	}
}
