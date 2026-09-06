# Contributing

## Setup

```bash
bun install
```

Node **24+** is required — Tegami, which drives releases, does not run on older
versions. The published package itself supports Node 18+.

| Command             | What it does                                             |
| ------------------- | -------------------------------------------------------- |
| `bun run test`      | Vitest, once                                              |
| `bun run typecheck` | `tsc --noEmit`                                            |
| `bun run lint`      | Biome, fixing in place                                    |
| `bun run lint:ci`   | Biome, checking only — what CI runs                       |
| `bun run build`     | Bundle to `dist/` via pkgroll                             |
| `bun run smoke`     | Pack the tarball, install it clean, import every subpath  |

Before opening a PR, `bun run lint:ci && bun run typecheck && bun run test` is
the same gate CI applies.

---

# Commit messages

**Your commit messages decide the next version number.** This repo has no
manual version bump step: [Tegami](https://tegami.fuma-nama.dev/) reads the
commits since the last release tag, computes the bump, and publishes. A commit
typed wrongly either ships a version you did not intend or — more often —
silently ships nothing.

## The format

```
type(optional scope)!: subject

optional body

optional footer
```

Only the first line decides the release. The rest becomes release-note detail.

## What each type does

| Type        | Release   | Use it for                                        |
| ----------- | --------- | ------------------------------------------------- |
| `feat`      | **minor** | New capability a user can call or configure       |
| `fix`       | **patch** | Behaviour that was wrong and is now right         |
| `perf`      | **patch** | Same behaviour, measurably faster or lighter      |
| `revert`    | **patch** | Undoing a previously released change              |
| `refactor`  | none      | Restructuring with no behaviour change            |
| `docs`      | none      | README, comments, this file                       |
| `test`      | none      | Tests only                                        |
| `chore`     | none      | Dependencies, tooling, housekeeping               |
| `style`     | none      | Formatting                                        |
| `build`     | none      | Build config                                      |
| `ci`        | none      | Workflows                                         |

Anything not in this table is parsed but releases nothing.

## Breaking changes

Either form produces a **major**, and both work with any type:

```
feat!: drop the legacy browser transport
```

```
feat: replace the transport interface

BREAKING CHANGE: VedaTraceTransport.send() now returns Promise<void>.
```

While the package is pre-1.0, weigh a major carefully — talk it through in the
PR first.

## Scopes are optional here

`fix:` and `fix(vedatrace):` behave identically. Tegami normally uses the scope
to work out which package in a workspace changed, but this repo publishes one
package, so `scripts/tegami.mts` points scope-less commits at it. Use a scope
when it makes the log easier to scan — `fix(express):`, `feat(react):` — not
because the release depends on it.

## The mistake to avoid

`refactor:` releases nothing. That is correct when nothing observable changed —
and wrong when something did. From this repo's own history:

```
refactor: ensure pending flush resolves correctly in batcher
refactor: improve batcher reliability with queueMicrotask and runtime detection
```

Both changed runtime behaviour users depend on. Both should have been `fix:`,
and as `refactor:` they would ship to nobody.

The test is not how the diff looks. It is: **would a user notice?** If yes, it
is `fix` or `feat`, however small the diff. If no, `refactor` is right, however
large.

## Squash merges

If a PR is squash-merged, GitHub uses the **PR title** as the commit subject —
so the PR title is what gets parsed, and it must follow this format. Individual
commit messages inside the PR then only matter for review.

If a PR is merge-committed, every commit in it is parsed, and several releasable
commits collapse into one release taking the highest bump among them.

## Examples

```
feat: add waitUntil config option for reliable Cloudflare Workers delivery
fix(react): stop VedaTraceProvider recreating its logger on every render
fix: honour Retry-After when the ingest endpoint returns 429
perf: split oversized keepalive batches instead of retrying them
refactor: extract the retry policy into core/errors.ts
chore(deps): bump biome to 2.3.14
feat!: require an explicit endpoint for self-hosted ingest
```

Subjects are imperative and describe the effect, not the edit — "stop losing
logs queued during a flush", not "update batcher.ts".

---

## Overriding the computed version

When the commits understate the impact, or you want release notes written as
prose rather than assembled from subject lines, commit a file under `.tegami/`:

```markdown
---
packages:
  vedatrace: major
---

# Drop the legacy transport API

`VedaTraceHttpTransportBrowser` is gone. Set `keepalive` on the base transport
instead — see the migration note in the README.
```

Bump values are `major`, `minor` or `patch`. The file is merged with whatever
the commits produced and **the highest bump wins**, so it can raise a release
but never lower one. `bun run release` opens an interactive prompt that writes
one for you.

Never hand-edit `CHANGELOG.md` or `.tegami/publish-lock.yaml` — both are
generated.

## Previewing the version your commits will produce

```bash
bun run release:version                                        # prints the plan
git checkout -- package.json src/version.ts CHANGELOG.md .tegami
rm -f .tegami/publish-lock.yaml                                # undo it
```

There is no dry-run — the command applies the bump, so the revert matters. It
also deletes any pending `.tegami/` entries it consumed, which is why that path
is in the checkout.

## What happens after your PR merges

See [RELEASE.md](./RELEASE.md). In short: CI verifies, opens an auto-merged
Version Packages PR, and publishes to npm on the following run.
