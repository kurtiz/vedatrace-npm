/**
 * Release pipeline (Tegami).
 *
 * Versions come from conventional commits: `feat:` is a minor, `fix:`/`perf:`/
 * `revert:` a patch, and a `!` or a `BREAKING CHANGE:` footer a major. Anything
 * else (`chore:`, `docs:`, `refactor:`, `style:`, `test:`, `ci:`, `build:`)
 * releases nothing, which is what you want — a refactor should not publish.
 *
 * To override a computed bump, hand-write a file in `.tegami/`:
 *
 *     ---
 *     packages:
 *       vedatrace: major
 *     ---
 *
 *     # Why this is a major
 *
 * A hand-written file is merged with whatever the commits produced, and the
 * highest bump wins — so it can raise a version but never lower one.
 *
 * Run `bun run release` for the interactive local flow; CI runs the commands
 * directly. Requires Node 24+ (Tegami's floor).
 */
import { mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { tegami, type TegamiPlugin } from "tegami"
import { runCli } from "tegami/cli"
import { github } from "tegami/plugins/github"
import { syncVersion } from "./sync-version.mjs"

/** The single published package in this workspace. */
const PACKAGE_NAME = "vedatrace"
const CHANGELOG_DIR = ".tegami"

/**
 * Keep `src/version.ts` in step with the bump.
 *
 * The SDK stamps its version onto every log entry from that file, and the build
 * regenerates it — but without this the version PR would carry a stale value,
 * so the repo would read one version behind for the whole review window.
 */
const syncSdkVersion: TegamiPlugin = {
	name: "vedatrace:sync-version",
	enforce: "post",
	applyDraft() {
		const written = syncVersion()
		if (written) console.log(`[tegami] src/version.ts -> ${written}`)
	},
}

const release = tegami({
	// `conventionalCommits: true` is deliberately NOT set. It injects *virtual*
	// changelog entries on every draft, and because the git tag only advances at
	// publish time, the run after the version PR merges regenerates the very same
	// entries and versions a second time — 0.3.1 becomes 0.3.2 without a single
	// new commit. Materialising real files below avoids that: `draft.apply()`
	// consumes them, so they cannot be counted twice.
	plugins: [
		github({
			repo: "VedaTrace/vedatrace-npm",
			versionPr: { base: "main" },
		}),
		syncSdkVersion,
	],
	npm: {
		// Publish through npm rather than bun: npm trusted publishing (OIDC) is an
		// npm CLI feature and needs npm >= 11.5.1.
		client: "npm",
		// ...but do not let the npm client refresh the lockfile: this repo locks
		// with bun, and the default would drop a stray package-lock.json into the
		// version PR beside bun.lock. Nothing is lost — bun.lock records the
		// workspace's dependencies, not its own version, so a bump cannot stale it.
		updateLockFile: false,
	},
})

/**
 * Turn conventional commits since the last tag into real changelog files.
 *
 * Tegami resolves a commit's affected packages from its scope, so an *unscoped*
 * `fix: ...` resolves to no package and releases nothing — and this repo's
 * history is unscoped throughout. In a single-package workspace the target is
 * never ambiguous, so an entry that names no package is pointed at this one.
 *
 * The rewrite uses the implicit style (`packages: ["vedatrace"]`), which lets
 * Tegami keep deriving the bump from heading depth in the generated body rather
 * than us recomputing it.
 */
async function materializeCommitChangelogs(): Promise<number> {
	// Never write while a publish is still owed: the lock is mid-flight, the tag
	// has not moved yet, and these same commits would regenerate into an orphan
	// file that the blocked version run leaves behind.
	const { status } = await release.getPublishStatus()
	if (status === "pending") return 0

	const entries = await release.generateChangelog({ write: false })
	if (entries.length === 0) return 0

	await mkdir(CHANGELOG_DIR, { recursive: true })

	for (const entry of entries) {
		const unscoped = Object.keys(entry.packages).length === 0
		const content = unscoped
			? entry.content.replace(
					/^---\npackages: \{\}\n---\n/,
					`---\npackages: ["${PACKAGE_NAME}"]\n---\n`,
				)
			: entry.content

		await writeFile(join(CHANGELOG_DIR, entry.filename), content)
	}

	return entries.length
}

await runCli(release, {
	async version() {
		const count = await materializeCommitChangelogs()
		if (count > 0) {
			console.log(`[tegami] generated ${count} changelog file(s) from commits`)
		}
		return release.draft()
	},
})
