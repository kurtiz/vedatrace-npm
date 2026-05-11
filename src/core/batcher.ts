/**
 * VedaTrace Batcher - Revised for Cloudflare Workers
 *
 * Key changes from original:
 * 1. Accepts ExecutionContext via config, enabling waitUntil() for background flushes
 * 2. Uses waitUntil() to protect flush promises from isolate suspension
 * 3. Falls back to immediateFlush when no ExecutionContext is available
 * 4. Removed reliance on unref timers in edge builds
 * 5. Micro-batching: flushes immediately on each log in edge/serverless environments
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
	) {}

	add(log: InternalLogEntry): void {
		this.queue.push(log)

		if (!this.flushTimer && !this.immediateFlush) {
			this.startFlushTimer()
		}

		if (this.immediateFlush || this.queue.length >= this.config.batchSize) {
			this.flush()
		}
	}

	async flush(): Promise<void> {
		if (this.isFlushing) {
			return this.pendingFlush ?? Promise.resolve()
		}

		if (this.queue.length === 0) {
			return Promise.resolve()
		}

		this.isFlushing = true
		const logsToSend = [...this.queue]
		this.queue = []

		const flushPromise = this.sendWithRetry(logsToSend).finally(() => {
			this.isFlushing = false
			this.pendingFlush = null
		})

		this.pendingFlush = flushPromise

		if (this.config.executionContext) {
			this.config.executionContext.waitUntil(flushPromise)
		}

		return flushPromise
	}

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
			if (attempt < this.config.maxRetries) {
				await this.delay(this.config.retryDelay * (attempt + 1))
				return this.sendWithRetry(logs, attempt + 1)
			}

			const combinedError = new Error(
				`Failed to send logs after ${this.config.maxRetries} retries: ${errors.map((e) => e.message).join(", ")}`,
			)

			if (this.onError) {
				this.onError(combinedError)
			} else {
				console.error("[VedaTrace]", combinedError.message)
			}
			return
		}

		this.onSuccess?.()
	}

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

	stop(): void {
		if (this.flushTimer) {
			clearInterval(this.flushTimer)
			this.flushTimer = null
		}
	}

	start(): void {
		if (!this.flushTimer && !this.immediateFlush) {
			this.startFlushTimer()
		}
	}

	private delay(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms))
	}

	getQueueSize(): number {
		return this.queue.length
	}

	setExecutionContext(ctx: {
		waitUntil(promise: Promise<unknown>): void
	}): void {
		this.config.executionContext = ctx
	}
}
