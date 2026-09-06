/**
 * Regression tests for the 0.3.1 bug batch.
 *
 * Each block pins one defect that shipped in 0.2.x/0.3.0, so a refactor cannot
 * quietly reintroduce it.
 */

import { readFileSync } from "node:fs"
import { afterEach, describe, expect, it, vi } from "vitest"
import { VedaTraceBatcher } from "@/core/batcher"
import { VedaTraceTransportError } from "@/core/errors"
import type { InternalLogEntry, VedaTraceTransport } from "@/core/types"
import { VedaTraceHttpTransport } from "@/transports/http"
import { SDK_VERSION } from "@/version"

const batcherConfig = {
	batchSize: 100,
	flushInterval: 60_000,
	maxRetries: 3,
	retryDelay: 1,
}

function log(message: string): InternalLogEntry {
	return { level: "info", message }
}

describe("SDK version", () => {
	it("is a real version, not the process.env.npm_package_version fallback", () => {
		// The old code read process.env.npm_package_version, which npm only sets
		// for its own lifecycle scripts — so consumers always got "0.0.0" — and
		// left a bare `process` reference that threw in browsers.
		expect(SDK_VERSION).toMatch(/^\d+\.\d+\.\d+/)
		expect(SDK_VERSION).not.toBe("0.0.0")
	})

	it("matches package.json", () => {
		const pkg = JSON.parse(readFileSync("package.json", "utf8"))
		expect(SDK_VERSION).toBe(pkg.version)
	})

	it("ships no bare process.env reads in browser-reachable source", () => {
		for (const file of [
			"src/core/logger.ts",
			"src/core/batcher.ts",
			"src/transports/http.ts",
			"src/utils/browser-lifecycle.ts",
		]) {
			expect(readFileSync(file, "utf8")).not.toContain("process.env")
		}
	})
})

describe("batcher: logs queued during a flush", () => {
	it("drains logs added while a send is in flight", async () => {
		let release: (() => void) | undefined
		const sent: string[][] = []

		const transport: VedaTraceTransport = {
			name: "test",
			send: async (logs) => {
				sent.push(logs.map((l) => l.message))
				if (sent.length === 1) {
					await new Promise<void>((resolve) => {
						release = resolve
					})
				}
			},
		}

		const batcher = new VedaTraceBatcher([transport], batcherConfig)
		batcher.add(log("first"))

		const flushPromise = batcher.flush()
		// Arrives while the first send is still awaiting.
		batcher.add(log("second"))
		release?.()
		await flushPromise

		// Before the fix the second log sat in the queue until the next add() or
		// timer tick — and in a Worker, where the handler returns immediately
		// after flush() resolves, it was simply lost.
		expect(sent).toEqual([["first"], ["second"]])
		expect(batcher.getQueueSize()).toBe(0)
	})
})

describe("batcher: retry policy", () => {
	it("does not retry a permanent 400", async () => {
		const send = vi.fn(async () => {
			throw VedaTraceTransportError.fromStatus(400, "No valid logs")
		})
		const onError = vi.fn()

		const batcher = new VedaTraceBatcher([{ name: "test", send }], {
			...batcherConfig,
			onError,
		})
		batcher.add(log("bad"))
		await batcher.flush()

		expect(send).toHaveBeenCalledTimes(1)
		expect(onError).toHaveBeenCalledOnce()
	})

	it("still retries a 500", async () => {
		const send = vi.fn(async () => {
			throw VedaTraceTransportError.fromStatus(500, "boom")
		})

		const batcher = new VedaTraceBatcher([{ name: "test", send }], {
			...batcherConfig,
			onError: vi.fn(),
		})
		batcher.add(log("transient"))
		await batcher.flush()

		expect(send).toHaveBeenCalledTimes(1 + batcherConfig.maxRetries)
	})

	it("retries a 429 and honours Retry-After", async () => {
		const error = VedaTraceTransportError.fromStatus(429, "slow down", 5)
		expect(error.retryable).toBe(true)
		expect(error.retryAfterMs).toBe(5)

		const send = vi.fn(async () => {
			throw error
		})
		const batcher = new VedaTraceBatcher([{ name: "test", send }], {
			...batcherConfig,
			onError: vi.fn(),
		})
		batcher.add(log("throttled"))
		await batcher.flush()

		expect(send).toHaveBeenCalledTimes(1 + batcherConfig.maxRetries)
	})

	it("halts after a 401 and reports once", async () => {
		const send = vi.fn(async () => {
			throw VedaTraceTransportError.fromStatus(401, "Invalid API key")
		})
		const onError = vi.fn()

		const batcher = new VedaTraceBatcher([{ name: "test", send }], {
			...batcherConfig,
			onError,
		})
		batcher.add(log("one"))
		await batcher.flush()

		expect(send).toHaveBeenCalledTimes(1)
		expect(batcher.isHalted()).toBe(true)
		expect(onError).toHaveBeenCalledOnce()

		// Subsequent logs are dropped rather than spending a doomed request each.
		batcher.add(log("two"))
		await batcher.flush()
		expect(send).toHaveBeenCalledTimes(1)

		// start() is the documented way back.
		batcher.start()
		batcher.add(log("three"))
		await batcher.flush()
		expect(send).toHaveBeenCalledTimes(2)
		batcher.stop()
	})

	it("treats a partial transport failure as success", async () => {
		const failing = vi.fn(async () => {
			throw new Error("down")
		})
		const working = vi.fn(async () => {})
		const onSuccess = vi.fn()

		const batcher = new VedaTraceBatcher(
			[
				{ name: "a", send: failing },
				{ name: "b", send: working },
			],
			{ ...batcherConfig, onSuccess, onError: vi.fn() },
		)
		batcher.add(log("partial"))
		await batcher.flush()

		expect(failing).toHaveBeenCalledTimes(1)
		expect(onSuccess).toHaveBeenCalledOnce()
	})
})

describe("http transport", () => {
	const originalFetch = globalThis.fetch

	afterEach(() => {
		globalThis.fetch = originalFetch
	})

	it("classifies responses by status", async () => {
		globalThis.fetch = vi.fn(
			async () =>
				new Response("Invalid API key", {
					status: 401,
					headers: { "Retry-After": "2" },
				}),
		) as typeof fetch

		const transport = new VedaTraceHttpTransport({ apiKey: "veda_test" })
		const error = await transport.send([log("x")]).catch((e) => e)

		expect(error).toBeInstanceOf(VedaTraceTransportError)
		expect(error.status).toBe(401)
		expect(error.fatal).toBe(true)
		expect(error.retryable).toBe(false)
	})

	it("splits an oversized keepalive batch under the 64 KiB limit", async () => {
		const bodies: number[] = []
		globalThis.fetch = vi.fn(async (_url, init) => {
			bodies.push(new TextEncoder().encode(String(init?.body)).length)
			return new Response(null, { status: 202 })
		}) as unknown as typeof fetch

		const transport = new VedaTraceHttpTransport({
			apiKey: "veda_test",
			keepalive: true,
		})

		// ~8 KB per log, 32 logs — comfortably over the spec's keepalive cap, which
		// rejects the request outright rather than truncating it.
		const big = Array.from({ length: 32 }, (_, i) => ({
			...log(`log-${i}`),
			metadata: { blob: "x".repeat(8 * 1024) },
		}))
		await transport.send(big)

		expect(bodies.length).toBeGreaterThan(1)
		for (const size of bodies) expect(size).toBeLessThanOrEqual(64 * 1024)
	})

	it("sends the wire shape the ingestion endpoint validates", async () => {
		let body: unknown
		globalThis.fetch = vi.fn(async (_url, init) => {
			body = JSON.parse(String(init?.body))
			return new Response(null, { status: 202 })
		}) as unknown as typeof fetch

		const transport = new VedaTraceHttpTransport({ apiKey: "veda_test" })
		await transport.send([{ ...log("hello"), timestamp: 1_700_000_000_000 }])

		expect(body).toEqual([
			{
				level: "info",
				message: "hello",
				service: undefined,
				timestamp: "2023-11-14T22:13:20.000Z",
				metadata: undefined,
			},
		])
	})
})
