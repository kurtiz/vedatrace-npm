export type RuntimeType =
	| "node"
	| "browser"
	| "cloudflare"
	| "deno"
	| "bun"
	| "edge"

/**
 * Runtime environment detection utility
 * Detects Node.js, Browser, Cloudflare Workers, Deno, Bun
 */

export function detectRuntime(): RuntimeType {
	// Cloudflare Workers - check navigator FIRST
	// TanStack Start polyfills process.versions.node, so we need this check first
	if (
		typeof navigator !== "undefined" &&
		navigator.userAgent === "Cloudflare-Workers"
	) {
		return "cloudflare"
	}

	// Deno
	const g = globalThis as Record<string, unknown> | undefined
	if (g?.Deno && (g.Deno as { version?: { deno?: string } }).version?.deno) {
		return "deno"
	}

	// Bun
	if (g?.Bun) {
		return "bun"
	}

	// Cloudflare Workers (fallback - WebSocketPair is Workers-specific)
	if (typeof g?.WebSocketPair !== "undefined") {
		return "cloudflare"
	}

	// Node.js
	if (typeof process !== "undefined" && process.versions?.node) {
		return "node"
	}

	// Browser
	if (typeof window !== "undefined" && typeof document !== "undefined") {
		return "browser"
	}

	// Generic Edge runtime
	if (
		typeof fetch !== "undefined" &&
		typeof window === "undefined" &&
		typeof process === "undefined"
	) {
		return "edge"
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

export function isServerless(): boolean {
	const runtime = detectRuntime()
	return runtime === "cloudflare" || runtime === "edge"
}

export function isLongRunning(): boolean {
	const runtime = detectRuntime()
	return runtime === "node" || runtime === "bun" || runtime === "deno"
}

export function isBrowser(): boolean {
	return detectRuntime() === "browser"
}
