/**
 * DIAGNOSTIC VERSION - core/batcher.ts
 *
 * This file is a drop-in replacement for src/core/batcher.ts that intercepts
 * and logs all batcher errors including retries and queue management issues.
 */

import type {
	BatcherConfig,
	InternalLogEntry,
	VedaTraceTransport,
} from "@/core/types"
import {
	logBatcherError,
	logDiagnostic,
	logMaxRetriesExceeded,
	logQueueStatus,
	logRetryAttempt,
	logTransportError,
} from "@/diagnostics/index"

export class DiagnosticBatcher {
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
	) {
		logDiagnostic("info", "━━━ BATCHER CREATED ━━━")
		logDiagnostic("info", "config:", JSON.stringify(config, null, 2))
		logDiagnostic("info", "immediateFlush:", immediateFlush)
		logDiagnostic(
			"info",
			"transports:",
			this.transports.map((t) => t.name),
		)
		logDiagnostic("info", "━━━━━━━━━━━━━━━━━━━━━━━")
	}

	add(log: InternalLogEntry): void {
		this.queue.push(log)
		logQueueStatus(this.queue.length, this.isFlushing)

		if (!this.flushTimer && !this.immediateFlush) {
			logDiagnostic("info", ">> Starting flush timer (first log received)")
			this.startFlushTimer()
		}

		if (this.immediateFlush || this.queue.length >= this.config.batchSize) {
			logDiagnostic(
				"info",
				`>> Triggering immediate flush (queue=${this.queue.length}, batchSize=${this.config.batchSize})`,
			)
			this.flush().catch((error) => {
				const err = error instanceof Error ? error : new Error(String(error))
				logBatcherError(err, "add() flush")
				if (this.onError) {
					this.onError(err)
				}
			})
		}
	}

	async flush(): Promise<void> {
		if (this.isFlushing) {
			logDiagnostic(
				"info",
				"Flush already in progress, returning pending flush",
			)
			return this.pendingFlush ?? Promise.resolve()
		}

		if (this.queue.length === 0) {
			logDiagnostic("info", "Queue empty, no flush needed")
			return Promise.resolve()
		}

		this.isFlushing = true
		const logsToSend = [...this.queue]
		this.queue = []

		logDiagnostic("warn", `>> FLUSH START: sending ${logsToSend.length} logs`)

		this.pendingFlush = this.sendWithRetry(logsToSend).finally(() => {
			this.isFlushing = false
			this.pendingFlush = null
			logDiagnostic("info", "<< FLUSH COMPLETE")
		})

		return this.pendingFlush
	}

	private async sendWithRetry(
		logs: InternalLogEntry[],
		attempt = 0,
	): Promise<void> {
		const errors: Error[] = []

		if (attempt > 0) {
			logRetryAttempt(
				attempt,
				this.config.maxRetries,
				this.config.retryDelay * attempt,
			)
		}

		for (const transport of this.transports) {
			try {
				logDiagnostic(
					"info",
					`>> Calling transport.send() on "${transport.name}"`,
				)
				await transport.send(logs)
				logDiagnostic(
					"info",
					`<< transport.send() succeeded on "${transport.name}"`,
				)
			} catch (error) {
				const err = error instanceof Error ? error : new Error(String(error))
				errors.push(err)
				logTransportError(err, `transport "${transport.name}"`)
			}
		}

		if (errors.length > 0 && errors.length === this.transports.length) {
			logDiagnostic("warn", `All ${errors.length} transports failed`)

			if (attempt < this.config.maxRetries) {
				const delay = this.config.retryDelay * (attempt + 1)
				logDiagnostic("warn", `Scheduling retry in ${delay}ms`)
				await this.delay(delay)
				return this.sendWithRetry(logs, attempt + 1)
			}

			logMaxRetriesExceeded(this.config.maxRetries, errors)

			const combinedError = new Error(
				`Failed to send logs after ${this.config.maxRetries} retries: ${errors.map((e) => e.message).join(", ")}`,
			)

			if (this.onError) {
				logDiagnostic("error", ">> Calling onError callback")
				this.onError(combinedError)
			} else {
				console.error("[VedaTrace]", combinedError.message)
			}
			return
		}

		logDiagnostic("info", "At least one transport succeeded")
		this.onSuccess?.()
	}

	private startFlushTimer(): void {
		if (this.flushTimer) {
			clearInterval(this.flushTimer)
		}

		this.flushTimer = setInterval(() => {
			logDiagnostic(
				"info",
				`[TIMER] Flush interval triggered, queue size: ${this.queue.length}`,
			)
			if (this.queue.length > 0) {
				this.flush().catch((error) => {
					const err = error instanceof Error ? error : new Error(String(error))
					logBatcherError(err, "timer flush")
					if (this.onError) {
						this.onError(err)
					} else {
						console.error("[VedaTrace] Flush error:", err.message)
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
}
