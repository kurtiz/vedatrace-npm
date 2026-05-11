/**
 * VedaTrace Diagnostic Tool
 *
 * Intercepts and exposes all internal errors caught by the "Graceful Failure" mechanism.
 * Use this to debug why logs are not reaching the VedaTrace dashboard in Cloudflare Workers.
 *
 * Usage:
 *   Import this module BEFORE importing vedatrace.
 *   It patches batcher.ts and http.ts to add debug logging.
 */

const DEBUG = true

const DIAGNOSTIC_LOG_PREFIX = "[VedaTrace Diagnostics]"

export function logDiagnostic(
	level: "info" | "warn" | "error",
	...args: unknown[]
) {
	if (DEBUG) {
		console.log(`${DIAGNOSTIC_LOG_PREFIX} [${level.toUpperCase()}]`, ...args)
	}
}

export function logFetchRequest(
	url: string,
	method: string,
	headers: Record<string, string>,
	body: unknown,
) {
	logDiagnostic("info", "━━━ HTTP REQUEST INITIATED ━━━")
	logDiagnostic("info", `URL: ${url}`)
	logDiagnostic("info", `Method: ${method}`)
	logDiagnostic("info", "Headers:", JSON.stringify(headers, null, 2))
	logDiagnostic("info", "Payload body:", JSON.stringify(body, null, 2))
	logDiagnostic("info", "━━━━━━━━━━━━━━━━━━━━━━━━━━━")
}

export function logFetchResponse(
	status: number,
	statusText: string,
	body: string,
) {
	logDiagnostic("info", "━━━ HTTP RESPONSE RECEIVED ━━━")
	logDiagnostic("info", `Status: ${status} ${statusText}`)
	logDiagnostic("info", "Response body:", body)
	logDiagnostic("info", "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
}

export function logTransportError(error: Error, context: string) {
	logDiagnostic("error", `━━━ TRANSPORT ERROR (${context}) ━━━`)
	logDiagnostic("error", "Error name:", error.name)
	logDiagnostic("error", "Error message:", error.message)
	logDiagnostic("error", "Error stack:", error.stack)
	logDiagnostic("error", "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
}

export function logBatcherError(error: Error, context: string) {
	logDiagnostic("error", `━━━ BATCHER ERROR (${context}) ━━━`)
	logDiagnostic("error", "Error name:", error.name)
	logDiagnostic("error", "Error message:", error.message)
	logDiagnostic("error", "Error stack:", error.stack)
	logDiagnostic("error", "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
}

export function logQueueStatus(queueSize: number, isFlushing: boolean) {
	logDiagnostic(
		"info",
		`Queue status: size=${queueSize}, isFlushing=${isFlushing}`,
	)
}

export function logRuntimeDetection(
	runtime: string,
	details: Record<string, unknown>,
) {
	logDiagnostic("info", "━━━ RUNTIME DETECTION ━━━")
	logDiagnostic("info", `Detected runtime: ${runtime}`)
	logDiagnostic("info", "Detection details:", JSON.stringify(details, null, 2))
	logDiagnostic("info", "━━━━━━━━━━━━━━━━━━━━━━━━━")
}

export function logRetryAttempt(
	attempt: number,
	maxRetries: number,
	delayMs: number,
) {
	logDiagnostic(
		"warn",
		`Retry attempt ${attempt}/${maxRetries} in ${delayMs}ms`,
	)
}

export function logMaxRetriesExceeded(maxRetries: number, errors: Error[]) {
	logDiagnostic("error", "━━━ MAX RETRIES EXCEEDED ━━━")
	logDiagnostic("error", `Failed after ${maxRetries} retries`)
	logDiagnostic("error", "All errors:")
	errors.forEach((err, i) => {
		logDiagnostic("error", `  [${i + 1}] ${err.message}`)
	})
	logDiagnostic("error", "━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
}

export function logWaitUntilStatus(available: boolean, isAttached: boolean) {
	logDiagnostic("info", "━━━ EXECUTIONCONTEXT STATUS ━━━")
	logDiagnostic("info", `waitUntil available: ${available}`)
	logDiagnostic("info", `waitUntil attached to SDK: ${isAttached}`)
	logDiagnostic("info", "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
}
