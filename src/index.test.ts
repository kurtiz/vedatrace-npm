/**
 * Tests for VedaTrace core functionality
 */

import { describe, expect, it, vi } from "vitest"
import { VedaTraceBatcher } from "@/core/batcher"
import { VedaTraceLogger } from "@/core/logger"
import type { VedaTraceLog, VedaTraceTransport } from "@/core/types"
import { vedatrace } from "@/index"

describe("VedaTrace SDK", () => {
	describe("vedatrace factory", () => {
		it("should create a logger with default config", () => {
			const logger = vedatrace()
			expect(logger).toBeInstanceOf(VedaTraceLogger)
		})

		it("should create a disabled logger when explicitly disabled", () => {
			const logger = vedatrace({ disabled: true })
			// Disabled logger should not have a batcher
			expect(logger).toBeDefined()
		})
	})

	describe("VedaTraceLogger", () => {
		it("should log at all levels", () => {
			const transport: VedaTraceTransport = {
				name: "test",
				send: vi.fn(),
			}

			const batcher = new VedaTraceBatcher([transport], {
				batchSize: 10,
				flushInterval: 1000,
				maxRetries: 3,
				retryDelay: 100,
			})

			const logger = new VedaTraceLogger({ service: "test-service" })
			logger.setBatcher(batcher)

			logger.debug("debug message")
			logger.info("info message")
			logger.warn("warn message")
			logger.error("error message")
			logger.fatal("fatal message")

			expect(batcher.getQueueSize()).toBe(5)
		})

		it("should support child loggers", () => {
			const transport: VedaTraceTransport = {
				name: "test",
				send: vi.fn(),
			}

			const batcher = new VedaTraceBatcher([transport], {
				batchSize: 10,
				flushInterval: 1000,
				maxRetries: 3,
				retryDelay: 100,
			})

			const logger = new VedaTraceLogger({ service: "parent" })
			logger.setBatcher(batcher)

			const childLogger = logger.child({ requestId: "123" })
			childLogger.info("test")

			expect(batcher.getQueueSize()).toBe(1)
		})

		it("should override service in metadata", async () => {
			const logs: VedaTraceLog[] = []
			const transport: VedaTraceTransport = {
				name: "test",
				// @ts-expect-error
				send: (l) => logs.push(...l),
			}

			const batcher = new VedaTraceBatcher([transport], {
				batchSize: 10, // Large enough to not auto-flush
				flushInterval: 10000,
				maxRetries: 3,
				retryDelay: 100,
			})

			const logger = new VedaTraceLogger({ service: "default-service" })
			logger.setBatcher(batcher)

			logger.info("message with default service")
			logger.info("message with custom service", { service: "custom-service" })

			// Manually flush
			await logger.flush()

			expect(logs.length).toBe(2)
			// @ts-expect-error
			expect(logs[0].service).toBe("default-service")
			// @ts-expect-error
			expect(logs[1].service).toBe("custom-service")
		})
	})

	describe("VedaTraceBatcher", () => {
		it("should batch logs", async () => {
			const sentLogs: VedaTraceLog[][] = []
			const transport: VedaTraceTransport = {
				name: "test",
				send: (logs) => {
					sentLogs.push(logs)
				},
			}

			const batcher = new VedaTraceBatcher([transport], {
				batchSize: 3,
				flushInterval: 10000, // Long interval to prevent auto-flush
				maxRetries: 3,
				retryDelay: 100,
			})

			// Add 2 logs (below batch size)
			batcher.add({ level: "info", message: "1" } as VedaTraceLog)
			batcher.add({ level: "info", message: "2" } as VedaTraceLog)

			expect(sentLogs.length).toBe(0) // Not flushed yet

			// Add 1 more log to trigger batch
			batcher.add({ level: "info", message: "3" } as VedaTraceLog)

			// Wait a tick for async flush
			await new Promise((resolve) => setTimeout(resolve, 10))

			expect(sentLogs.length).toBe(1)
			// @ts-expect-error
			expect(sentLogs[0].length).toBe(3)
		})

		it("should retry on failure", async () => {
			let attemptCount = 0
			const transport: VedaTraceTransport = {
				name: "test",
				send: () => {
					attemptCount++
					throw new Error("Network error")
				},
			}

			const batcher = new VedaTraceBatcher([transport], {
				batchSize: 1,
				flushInterval: 10000,
				maxRetries: 2,
				retryDelay: 10,
			})

			batcher.add({ level: "info", message: "test" } as VedaTraceLog)

			// Wait for retries
			await new Promise((resolve) => setTimeout(resolve, 100))

			// Initial attempt + 2 retries = 3 attempts
			expect(attemptCount).toBe(3)
		})
	})
})
