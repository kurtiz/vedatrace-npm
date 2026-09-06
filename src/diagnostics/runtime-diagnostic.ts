/**
 * DIAGNOSTIC VERSION - utils/runtime.ts
 *
 * Enhanced runtime detection with detailed logging to help debug
 * environment identification issues in Cloudflare Workers.
 */

import { logRuntimeDetection } from "../diagnostics/index"

export type RuntimeType =
	| "node"
	| "browser"
	| "cloudflare"
	| "deno"
	| "bun"
	| "edge"

export function detectRuntime(): RuntimeType {
	const checks: Record<string, unknown> = {}

	const g = globalThis as Record<string, unknown> | undefined

	checks["navigator exists"] = typeof navigator !== "undefined"
	checks["navigator.userAgent"] =
		typeof navigator !== "undefined" ? navigator.userAgent : undefined
	checks["navigator.userAgent === 'Cloudflare-Workers'"] =
		typeof navigator !== "undefined" &&
		navigator.userAgent === "Cloudflare-Workers"

	checks["g.Deno exists"] = !!g?.Deno
	checks["g.Deno.version.deno exists"] = !!(
		g?.Deno && (g.Deno as { version?: { deno?: string } }).version?.deno
	)

	checks["g.Bun exists"] = !!g?.Bun
	checks["WebSocketPair exists"] = typeof g?.WebSocketPair !== "undefined"

	checks["process exists"] = typeof process !== "undefined"
	checks["process.versions?.node"] = process?.versions?.node

	checks["window exists"] = typeof window !== "undefined"
	checks["document exists"] = typeof document !== "undefined"

	checks["fetch exists"] = typeof fetch !== "undefined"

	let detected: RuntimeType = "edge"

	if (
		typeof navigator !== "undefined" &&
		navigator.userAgent === "Cloudflare-Workers"
	) {
		detected = "cloudflare"
	} else if (
		g?.Deno &&
		(g.Deno as { version?: { deno?: string } }).version?.deno
	) {
		detected = "deno"
	} else if (g?.Bun) {
		detected = "bun"
	} else if (typeof g?.WebSocketPair !== "undefined") {
		detected = "cloudflare"
	} else if (typeof process !== "undefined" && process.versions?.node) {
		detected = "node"
	} else if (typeof window !== "undefined" && typeof document !== "undefined") {
		detected = "browser"
	} else {
		detected = "edge"
	}

	logRuntimeDetection(detected, checks)

	return detected
}

export function isEdgeRuntime(): boolean {
	return (
		detectRuntime() === "cloudflare" ||
		detectRuntime() === "deno" ||
		detectRuntime() === "bun" ||
		detectRuntime() === "edge"
	)
}

export function getRuntimeDetails(): Record<string, unknown> {
	const g = globalThis as Record<string, unknown>
	return {
		runtime: detectRuntime(),
		timestamp: new Date().toISOString(),
		navigator:
			typeof navigator !== "undefined" ? navigator.userAgent : undefined,
		globalKeys: Object.keys(g).slice(0, 50),
		processVersions: process?.versions,
		hasRequest: typeof Request !== "undefined",
		hasAbortController: typeof AbortController !== "undefined",
		// WebSocketPair is Workers-only and has no ambient declaration here, so it
		// is probed through globalThis rather than as a bare identifier.
		hasWebSocketPair: "WebSocketPair" in g,
	}
}
