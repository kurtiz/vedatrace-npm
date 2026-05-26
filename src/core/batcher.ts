/**
 * VedaTrace Batcher - Context-Aware for Cloudflare Workers
 *
 * Three flush modes:
 * 1. Reliable mode (context or waitUntilFn): debounced flush + waitUntil for guaranteed delivery
 * 2. Immediate mode: flush() called directly from add() during handler execution
 * 3. Batch mode: periodic/batch-size flush for long-running environments
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
	private flushQueued = false
	private isFlushing = false
	private pendingFlush: Promise<void> | null = null
	private context: VedaTraceEdgeContext | undefined
	private waitUntilFn: ((promise: Promise<unknown>) => void) | undefined

	constructor(
		private transports: VedaTraceTransport[],
		private config: BatcherConfig,
		private immediateFlush = false,
	) {
		this.context = config.executionContext
		this.waitUntilFn = config.waitUntil
	}

	setContext(ctx: VedaTraceEdgeContext): void {
		this.context = ctx
	}

	getContext(): VedaTraceEdgeContext | undefined {
		return this.context
	}

	add(log: InternalLogEntry): void {
		this.queue.push(log)

		if (this.context || this.waitUntilFn) {
			this.debouncedFlush()
			return
		}

		if (this.immediateFlush) {
			this.flush()
			return
		}

		if (!this.flushTimer) {
			this.startFlushTimer()
		}

		if (this.queue.length >= this.config.batchSize) {
			this.flush()
		}
	}

	private debouncedFlush(): void {
		if (this.flushQueued) return

		this.flushQueued = true
		queueMicrotask(() => {
			this.flushQueued = false
			this.flush().catch((error) => {
				if (this.config.onError) {
					this.config.onError(
						error instanceof Error ? error : new Error(String(error)),
					)
				} else {
					console.error(
						"[VedaTrace] Debounced flush error:",
						error instanceof Error ? error.message : String(error),
					)
				}
			})
		})
	}

	async flush(): Promise<void> {
		if (this.isFlushing) {
			return this.pendingFlush ?? (await Promise.resolve())
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

		if (this.context && typeof this.context.waitUntil === "function") {
			this.context.waitUntil(flushPromise)
		} else if (typeof this.waitUntilFn === "function") {
			this.waitUntilFn(flushPromise)
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

			if (this.config.onError) {
				this.config.onError(combinedError)
			} else {
				console.error("[VedaTrace]", combinedError.message)
			}
			return
		}

		if (this.config.onSuccess) {
			this.config.onSuccess()
		}
	}

	private startFlushTimer(): void {
		if (this.flushTimer) {
			clearInterval(this.flushTimer)
		}

		this.flushTimer = setInterval(() => {
			if (this.queue.length > 0) {
				this.flush().catch((error) => {
					if (this.config.onError) {
						this.config.onError(
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
		this.flushQueued = false
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
