/**
 * VedaTrace - Hono + Cloudflare Workers Example
 *
 * Demonstrates how to use VedaTrace with Hono framework on Cloudflare Workers.
 * The pattern works with any Hono app deployed to Cloudflare.
 */

import { Hono } from "hono";
import { vedatrace } from "vedatrace";

const app = new Hono<{ Bindings: { VEDATRACE_API_KEY: string } }>();

app.use("*", async (c, next) => {
	const logger = vedatrace({
		apiKey: c.env.VEDATRACE_API_KEY,
		service: "hono-cf-worker",
	});

	logger.withContext(c.executionCtx);
	c.set("logger", logger);

	await next();
});

app.get("/", (c) => {
	const logger = c.get("logger");
	logger.info("GET / requested");

	return c.json({
		message: "Hello from Hono on Cloudflare Workers!",
		timestamp: new Date().toISOString(),
	});
});

app.post("/api/test", async (c) => {
	const logger = c.get("logger");
	const body = await c.req.json();

	logger.info("POST /api/test", { body });

	return c.json({ status: "ok", received: body });
});

app.onError((err, c) => {
	const logger = c.get("logger");
	logger.error("Unhandled error", {
		message: err.message,
		stack: err.stack,
	});

	return c.json({ error: "Internal Server Error" }, 500);
});

export default app;
