#!/usr/bin/env node
/**
 * Packs the tarball and imports it from a clean directory, the way a consumer
 * would, in both ESM and CJS and across every export subpath.
 *
 * Unit tests import from `src/` through a tsconfig path alias, so they cannot
 * see a broken `exports` map, a missing dist file, or a subpath that resolves in
 * ESM but not CJS. Those are the failures that reach users as "cannot find
 * module 'vedatrace/next'" the moment they install it.
 */
import { execFileSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const dir = mkdtempSync(join(tmpdir(), "vedatrace-smoke-"))

const run = (cmd, args, cwd) =>
	execFileSync(cmd, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] })

try {
	const packed = JSON.parse(run("npm", ["pack", "--json", "--pack-destination", dir], root))
	const tarball = join(dir, packed[0].filename)

	writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "smoke", private: true }))
	run("npm", ["install", "--no-audit", "--no-fund", tarball], dir)

	// React and Express are optional peers; install them so the subpaths resolve.
	run("npm", ["install", "--no-audit", "--no-fund", "react", "express"], dir)

	writeFileSync(
		join(dir, "esm.mjs"),
		`
		import vedatrace, { vedatrace as named, VedaTraceTransportError, SDK_VERSION } from "vedatrace"
		import { vedaTraceMiddleware } from "vedatrace/express"
		import { withVedaTrace, serverLogger } from "vedatrace/next"
		import { VedaTraceHttpTransport } from "vedatrace/transports"

		const missing = Object.entries({ vedatrace, named, VedaTraceTransportError, vedaTraceMiddleware, withVedaTrace, serverLogger, VedaTraceHttpTransport })
			.filter(([, v]) => v === undefined)
			.map(([k]) => k)
		if (missing.length) throw new Error("ESM export missing: " + missing.join(", "))
		if (!/^\\d+\\.\\d+\\.\\d+/.test(SDK_VERSION)) throw new Error("bad SDK_VERSION: " + SDK_VERSION)

		// A logger with no key must stay inert rather than throw.
		named({ service: "smoke" }).info("hello")
		console.log("ESM ok, version " + SDK_VERSION)
		`,
	)

	writeFileSync(
		join(dir, "cjs.cjs"),
		`
		const mod = require("vedatrace")
		const { vedaTraceMiddleware } = require("vedatrace/express")
		const { withVedaTrace } = require("vedatrace/next")
		const { VedaTraceHttpTransport } = require("vedatrace/transports")

		const factory = mod.vedatrace ?? mod.default
		if (typeof factory !== "function") throw new Error("CJS entry does not export vedatrace()")
		if (!mod.VedaTraceTransportError) throw new Error("CJS missing VedaTraceTransportError")
		if (!vedaTraceMiddleware || !withVedaTrace || !VedaTraceHttpTransport) throw new Error("CJS subpath export missing")

		factory({ service: "smoke" }).info("hello")
		console.log("CJS ok")
		`,
	)

	// React is JSX-compiled, so exercise it through the bundled output only.
	writeFileSync(
		join(dir, "react.mjs"),
		`
		import { VedaTraceProvider, useVedaTrace } from "vedatrace/react"
		if (!VedaTraceProvider || !useVedaTrace) throw new Error("react subpath export missing")
		console.log("react subpath ok")
		`,
	)

	process.stdout.write(run("node", ["esm.mjs"], dir))
	process.stdout.write(run("node", ["cjs.cjs"], dir))
	process.stdout.write(run("node", ["react.mjs"], dir))

	// The published tarball must not carry source or scripts.
	const files = run("tar", ["tzf", tarball], dir).split("\n").filter(Boolean)
	const leaked = files.filter((f) => f.startsWith("package/src/") || f.startsWith("package/scripts/"))
	if (leaked.length) throw new Error("tarball leaks files: " + leaked.join(", "))
	console.log(`tarball ok (${files.length} files, ${(readFileSync(tarball).length / 1024).toFixed(1)} KB)`)

	console.log("\nsmoke test passed")
} finally {
	rmSync(dir, { recursive: true, force: true })
}
