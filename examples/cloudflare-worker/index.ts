/**
 * VedaTrace - Generic Cloudflare Worker Example
 *
 * This example demonstrates how to use VedaTrace with ANY Cloudflare environment
 * (Workers, Pages, etc.) using the standard export default { fetch } pattern.
 *
 * The SDK is framework-agnostic - works with Hono, Fastify,itty-router, or raw fetch.
 *
 * Key principle: "Fire-and-forget" - the SDK handles the waitUntil lifecycle internally.
 * You just call logger.info() and the logs will be delivered in the background.
 */
import vedatrace from "../../src";

export default {
	async fetch(
		request: Request,
		env: Env,
		ctx: ExecutionContext,
	): Promise<Response> {
		// 1. Initialize logger with API key from environment
		const logger = vedatrace({
			apiKey: env.VEDATRACE_API_KEY,
			service: "my-cloudflare-worker",
			debug: false,
		});

		// 2. CRITICAL: Attach the ExecutionContext to enable waitUntil()
		// This is what keeps the flush alive after the response is sent
		logger.withContext(ctx);

		// 3. Log something - this will be delivered in the background
		logger.info("Request received", {
			method: request.method,
			url: request.url,
		});

		try {
			// Your application logic here
			const response = await handleRequest(request, env);

			logger.info("Request completed", {
				status: response.status,
			});

			return response;
		} catch (error) {
			logger.error("Request failed", {
				error: error instanceof Error ? error.message : String(error),
				stack: error instanceof Error ? error.stack : undefined,
			});

			return new Response("Internal Server Error", { status: 500 });
		}
	},
};

/** Your application logic */
async function handleRequest(_request: Request, _env: Env): Promise<Response> {
	// Example: return a simple JSON response
	// Replace with your actual application code
	const data = {
		message: "Hello from Cloudflare Workers with VedaTrace!",
		timestamp: new Date().toISOString(),
	};

	return new Response(JSON.stringify(data), {
		headers: { "Content-Type": "application/json" },
	});
}

interface Env {
	VEDATRACE_API_KEY: string;
}
