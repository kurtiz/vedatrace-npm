/**
 * Runtime environment detection utility
 * Detects Node.js, Browser, Cloudflare Workers, Deno, Bun
 */

export type RuntimeType =
	| "node"
	| "browser"
	| "cloudflare"
	| "deno"
	| "bun"
	| "edge"

export function detectRuntime(): RuntimeType {
	if (typeof process !== "undefined" && process.versions?.node) {
		return "node"
	}

	if (
		typeof globalThis !== "undefined" &&
		"navigator" in globalThis &&
		typeof self === "undefined"
	) {
		return "browser"
	}

	if (typeof caches !== "undefined") {
		return "cloudflare"
	}

	const maybeDeno = globalThis as Record<string, unknown> | undefined
	if (maybeDeno?.version) {
		return "deno"
	}

	const maybeBun = globalThis as Record<string, unknown> | undefined
	if (maybeBun?.Bun) {
		return "bun"
	}

	return "edge"
}

export function isEdgeRuntime(): boolean {
	const runtime = detectRuntime()
	return (
		runtime === "cloudflare" ||
		runtime === "deno" ||
		runtime === "bun" ||
		runtime === "edge"
	)
}
