/**
 * VedaTrace Batcher - Context-Aware for Cloudflare Workers
 *
 * Three flush modes:
 * 1. Reliable mode (context or waitUntilFn): debounced flush + waitUntil for guaranteed delivery
 * 2. Immediate mode: flush() called directly from add() during handler execution
 * 3. Batch mode: periodic/batch-size flush for long-running environments
 */

import { isFatal, isRetryable, retryAfterMs } from "./errors"
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
	/**
	 * Set when the ingestion endpoint rejects our credentials. Every subsequent
	 * batch would fail identically, so we stop rather than spend a request (and a
	 * retry storm) per flush for the life of the process. start() clears it.
	 */
	private halted = false

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
		if (this.halted) return

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
			this.flush().catch((error) => this.reportError(error))
		})
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

		const flushPromise = this.sendWithRetry(logsToSend)
			.finally(() => {
				this.isFlushing = false
				this.pendingFlush = null
			})
			// Anything logged while that send was in flight is still sitting in the
			// queue. Without this drain it waits for the next add() or timer tick —
			// and in a Worker, where the handler returns right after, those last logs
			// were simply lost. Chaining keeps them inside the same promise, so the
			// waitUntil below covers them too.
			.then(() => {
				if (this.queue.length > 0 && !this.halted) {
					return this.flush()
				}
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
		const errors: unknown[] = []

		for (const transport of this.transports) {
			try {
				await transport.send(logs)
			} catch (error) {
				errors.push(error)
			}
		}

		// A partial failure still delivered the logs somewhere; only a total
		// failure is worth retrying.
		if (errors.length === 0 || errors.length < this.transports.length) {
			this.config.onSuccess?.()
			return
		}

		// Bad key or blocked origin: retrying cannot help, and neither can the
		// next batch. Say so once and stand down.
		const fatalError = errors.find(isFatal)
		if (fatalError) {
			this.halt(fatalError)
			return
		}

		if (errors.some(isRetryable) && attempt < this.config.maxRetries) {
			// Honour a server-sent Retry-After over our own backoff.
			const backoff = this.config.retryDelay * (attempt + 1)
			await this.delay(retryAfterMs(errors) ?? backoff)
			return this.sendWithRetry(logs, attempt + 1)
		}

		const detail = errors.map(describeError).join(", ")
		this.reportError(
			new Error(
				errors.some(isRetryable)
					? `Failed to send ${logs.length} logs after ${this.config.maxRetries} retries: ${detail}`
					: `Failed to send ${logs.length} logs: ${detail}`,
			),
		)
	}

	/** Stop accepting logs after an unrecoverable authentication failure. */
	private halt(error: unknown): void {
		this.halted = true
		this.queue = []
		this.stop()
		this.reportError(
			new Error(
				`VedaTrace disabled: ${describeError(error)}. Check your API key and the key's allowed origins, then call logger.start() to resume.`,
			),
		)
	}

	private reportError(error: unknown): void {
		const normalized = error instanceof Error ? error : new Error(String(error))

		if (this.config.onError) {
			this.config.onError(normalized)
		} else {
			console.error("[VedaTrace]", normalized.message)
		}
	}

	private startFlushTimer(): void {
		if (this.flushTimer) {
			clearInterval(this.flushTimer)
		}

		this.flushTimer = setInterval(() => {
			if (this.queue.length > 0) {
				this.flush().catch((error) => this.reportError(error))
			}
		}, this.config.flushInterval)

		if (this.config.unrefTimer === true) {
			this.flushTimer.unref?.()
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
		this.halted = false

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

	/** True once an auth failure has shut the batcher down. */
	isHalted(): boolean {
		return this.halted
	}

	setExecutionContext(ctx: VedaTraceEdgeContext): void {
		this.context = ctx
	}
}

function describeError(error: unknown): string {
	return error instanceof Error ? error.message : String(error)
}
