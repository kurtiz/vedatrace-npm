/**
 * Next.js integration for VedaTrace
 * Works with both App Router and Pages Router
 */

import type {
	LogMetadata,
	VedaTraceConfig,
	VedaTraceLoggerInterface,
} from "@/core/types"
import { vedatrace } from "@/index"

export interface NextJsConfig extends VedaTraceConfig {
	/** Generate request ID */
	generateRequestId?: () => string
	/** Additional metadata */
	requestMetadata?: () => LogMetadata
}

export interface NextJsContext {
	logger: VedaTraceLoggerInterface
	requestId: string
}

/**
 * Wrap a Next.js App Router handler with VedaTrace
 *
 * @example
 * ```typescript
 * // app/api/users/route.ts
 * import { withVedaTrace } from 'vedatrace/next'
 *
 * export const GET = withVedaTrace(async (req, { logger }) => {
 *   logger.info('Fetching users')
 *   return Response.json({ users: [] })
 * }, { apiKey: '...' })
 * ```
 */
export function withVedaTrace<
	T extends (req: Request, ctx: NextJsContext) => Promise<Response> | Response,
>(handler: T, config: NextJsConfig = {}): (req: Request) => Promise<Response> {
	const {
		generateRequestId = () =>
			`req_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
		requestMetadata = () => ({}),
		...vedaConfig
	} = config

	// Built once per wrapped route, not once per request. See the note in the
	// Express middleware: every vedatrace() call opens its own batcher, timer and
	// process listeners, so calling it inside the handler leaked one set per
	// request. child() shares the parent's batcher.
	const baseLogger = vedatrace(vedaConfig)

	return async (req: Request): Promise<Response> => {
		const requestId = generateRequestId()
		const logger = baseLogger.child({
			requestId,
			...requestMetadata(),
		})

		const startTime = Date.now()

		try {
			logger.info("Request started", {
				method: req.method,
				url: req.url,
			})

			const response = await handler(req, { logger, requestId })

			const duration = Date.now() - startTime
			logger.info("Request completed", {
				statusCode: response.status,
				durationMs: duration,
			})

			// Flush logs before returning
			await logger.flush()

			return response
		} catch (error) {
			logger.error("Request failed", {
				error: error instanceof Error ? error.message : String(error),
				durationMs: Date.now() - startTime,
			})

			await logger.flush()
			throw error
		}
	}
}

/**
 * Create a logger for Next.js API routes (Pages Router)
 *
 * @example
 * ```typescript
 * // pages/api/users.ts
 * import { createVedaTraceLogger } from 'vedatrace/next'
 * import type { NextApiRequest, NextApiResponse } from 'next'
 *
 * export default function handler(req: NextApiRequest, res: NextApiResponse) {
 *   const logger = createVedaTraceLogger({ apiKey: '...' })
 *   logger.info('API called')
 *   res.json({ ok: true })
 * }
 * ```
 */
export function createVedaTraceLogger(
	config: VedaTraceConfig = {},
): VedaTraceLoggerInterface {
	return vedatrace(config)
}

/**
 * Shared server-side logger for Next.js.
 *
 * Reads `VEDATRACE_API_KEY` from the environment. Built on first use rather than
 * at import time: the previous module-level instance was constructed with no API
 * key, which left it without a transport, so every call on it was silently
 * dropped — and it ran its runtime detection and process-handler setup just for
 * importing the module, including in the browser bundle.
 *
 * @example
 * ```typescript
 * // app/page.tsx (Server Component)
 * import { serverLogger } from 'vedatrace/next'
 *
 * export default async function Page() {
 *   serverLogger.info('Rendering page')
 *   return <div>Hello</div>
 * }
 * ```
 */
let serverLoggerInstance: VedaTraceLoggerInterface | null = null

/** Get (and lazily create) the shared Next.js server logger. */
export function getServerLogger(
	config: VedaTraceConfig = {},
): VedaTraceLoggerInterface {
	if (!serverLoggerInstance) {
		serverLoggerInstance = vedatrace({ service: "nextjs-server", ...config })
	}
	return serverLoggerInstance
}

/**
 * Convenience wrapper around {@link getServerLogger} that keeps the original
 * `serverLogger.info(...)` call shape while deferring construction to the first
 * call.
 */
export const serverLogger: VedaTraceLoggerInterface = {
	debug: (message, metadata) => getServerLogger().debug(message, metadata),
	info: (message, metadata) => getServerLogger().info(message, metadata),
	warn: (message, metadata) => getServerLogger().warn(message, metadata),
	error: (message, metadata) => getServerLogger().error(message, metadata),
	fatal: (message, metadata) => getServerLogger().fatal(message, metadata),
	child: (defaults) => getServerLogger().child(defaults),
	flush: () => getServerLogger().flush(),
	stop: () => getServerLogger().stop(),
	start: () => getServerLogger().start(),
	withContext(ctx) {
		getServerLogger().withContext(ctx)
		return this
	},
	hasContext: () => getServerLogger().hasContext(),
	getContext: () => getServerLogger().getContext(),
	get runtime() {
		return getServerLogger().runtime
	},
}
