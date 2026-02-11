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

	return async (req: Request): Promise<Response> => {
		const requestId = generateRequestId()
		const logger = vedatrace(vedaConfig).child({
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
 * Server-side logger for Next.js
 * Use in Server Components or API routes
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
export const serverLogger = vedatrace({
	service: "nextjs-server",
})
