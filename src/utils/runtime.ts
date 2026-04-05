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
	const g = globalThis as any

	// --- 1. Deno (very reliable) ---
	if (typeof g.Deno !== "undefined" && g.Deno?.version?.deno) {
		return "deno"
	}

	// --- 2. Bun (very reliable) ---
	if (typeof g.Bun !== "undefined") {
		return "bun"
	}

	// --- 3. Cloudflare Workers (multiple signals) ---
	// Avoid relying ONLY on userAgent
	if (
		typeof g.WebSocketPair !== "undefined" || // CF-specific
		(typeof navigator !== "undefined" &&
			navigator.userAgent === "Cloudflare-Workers")
	) {
		return "cloudflare"
	}

	// --- 4. Node.js (avoid false positives from polyfills) ---
	if (
		typeof process !== "undefined" &&
		process.versions?.node &&
		!process.versions?.bun && // exclude Bun
		!process.versions?.deno // defensive (rare)
	) {
		return "node"
	}

	// --- 5. Browser ---
	if (typeof window !== "undefined" && typeof document !== "undefined") {
		return "browser"
	}

	// --- 6. Generic Edge runtime (Vercel Edge, etc.) ---
	// These usually have:
	// - no process
	// - no window
	// - fetch available
	if (
		typeof fetch !== "undefined" &&
		typeof window === "undefined" &&
		typeof process === "undefined"
	) {
		return "edge"
	}

	// --- Fallback ---
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
