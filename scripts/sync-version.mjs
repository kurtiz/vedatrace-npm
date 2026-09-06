#!/usr/bin/env node
/**
 * Writes the version from package.json into src/version.ts.
 *
 * Runs before every build and, via the Tegami plugin in scripts/tegami.mts,
 * immediately after a version bump — so the value the SDK reports on each log
 * entry can never drift from the published version, and the version PR carries
 * the updated file rather than lagging a release behind.
 */
import { readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")

/** @returns the version written, or null when it was already in sync */
export function syncVersion() {
	const { version } = JSON.parse(readFileSync(join(root, "package.json"), "utf8"))
	const target = join(root, "src", "version.ts")

	const source = readFileSync(target, "utf8")
	const updated = source.replace(
		/export const SDK_VERSION = "[^"]*"/,
		`export const SDK_VERSION = "${version}"`,
	)

	if (updated === source) return null
	writeFileSync(target, updated)
	return version
}

// Executed directly (npm script) rather than imported.
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
	const written = syncVersion()
	if (written) console.log(`[vedatrace] src/version.ts -> ${written}`)
}
