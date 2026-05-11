/**
 * VedaTrace Batcher - Context-Aware for Cloudflare Workers
 *
 * Key features:
 * 1. Stores EdgeContext for waitUntil() integration
 * 2. setContext() method for post-initialization context attachment
 * 3. Fire-and-forget flush wrapped in ctx.waitUntil() when context is available
 * 4. Debounced flush to avoid excessive network calls
 * 5. Automatic flush on each log entry when context is present
 */

import type {
	BatcherConfig,
	InternalLogEntry,
	VedaTraceEdgeContext,
	VedaTraceTransport,
} from "./types"

export class VedaTraceBatcher {
	private queue: InternalLogEntry[] = []
	private flushTimer: ReturnType<typeof setInterval> | null = null
	private flushDebounceTimer: ReturnType<typeof setTimeout> | null = null
	private isFlushing = false
	private pendingFlush: Promise<void> | null = null
	private context: VedaTraceEdgeContext | undefined

	constructor(
		private transports: VedaTraceTransport[],
		private config: BatcherConfig,
		private onError?: (error: Error) => void,
		private onSuccess?: (() => void) | undefined,
		private immediateFlush = false,
	) {
		this.context = config.executionContext
	}

	/** Attach execution context after initialization */
	setContext(ctx: VedaTraceEdgeContext): void {
		this.context = ctx
	}

	/** Get current context */
	getContext(): VedaTraceEdgeContext | undefined {
		return this.context
	}

	/** Add log to queue with context-aware flush */
	add(log: InternalLogEntry): void {
		this.queue.push(log)

		if (!this.flushTimer && !this.immediateFlush) {
			this.startFlushTimer()
		}

		if (this.immediateFlush || this.context) {
			this.debouncedFlush()
		} else if (this.queue.length >= this.config.batchSize) {
			this.flush()
		}
	}

	/** Debounced flush - prevents rapid-fire flushes */
	private debouncedFlush(): void {
		if (this.flushDebounceTimer) {
			clearTimeout(this.flushDebounceTimer)
		}

		this.flushDebounceTimer = setTimeout(() => {
			this.flushDebounceTimer = null
			this.flush().catch((error) => {
				if (this.onError) {
					this.onError(
						error instanceof Error ? error : new Error(String(error)),
					)
				} else {
					console.error(
						"[VedaTrace] Debounced flush error:",
						error instanceof Error ? error.message : String(error),
					)
				}
			})
		}, 100)
	}

	/** Flush logs to all transports with waitUntil protection */
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

		if (this.context) {
			this.context.waitUntil(flushPromise)
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
		if (this.flushDebounceTimer) {
			clearTimeout(this.flushDebounceTimer)
			this.flushDebounceTimer = null
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

	setExecutionContext(ctx: VedaTraceEdgeContext): void {
		this.context = ctx
	}
}
