---
name: conventional-commits
description: Write commit messages and PR titles for this repo, where the commit type decides the published npm version. Use when committing, writing a PR title, deciding between fix/feat/refactor, marking a breaking change, overriding a version bump, or explaining why a merged change did not release.
---

# Commit messages decide the release

This repo publishes `vedatrace` to npm. There is no manual version bump:
[Tegami](https://tegami.fuma-nama.dev/) parses commits since the last release
tag and computes the version from their types. Choosing the wrong type ships an
unintended version, or — far more commonly — ships nothing at all.

`scripts/tegami.mts` is the configuration. `CONTRIBUTING.md` is the human-facing
reference; this file is the operating procedure.

## Format

```
type(optional scope)!: subject
```

Only the first line is parsed. The body and footers become release-note detail.

## Type → release

| Type                                                   | Release   |
| ------------------------------------------------------ | --------- |
| `feat`                                                  | **minor** |
| `fix`, `perf`, `revert`                                 | **patch** |
| `refactor`, `docs`, `test`, `chore`, `style`, `build`, `ci` | none  |

`!` after the type, or a `BREAKING CHANGE:` footer, forces a **major** with any
type.

## Choosing the type

Ask one question: **would a user of the package notice?**

- Yes, and it is new surface they can call or configure → `feat`
- Yes, and it is behaviour that was wrong → `fix`
- Yes, and it is the same behaviour but faster or lighter → `perf`
- No → `refactor`, `chore`, `docs`, `test`, `style`, `build`, `ci`

Judge by effect, not by diff size. A one-line change to a default is a `fix`.
A thousand-line internal reshuffle that changes nothing observable is a
`refactor`.

**The trap:** `refactor:` releases nothing. Two real commits from this repo's
history got this wrong —

```
refactor: ensure pending flush resolves correctly in batcher
refactor: improve batcher reliability with queueMicrotask and runtime detection
```

Both fixed user-visible bugs. As `refactor:` they would have shipped to nobody.
If the subject contains words like *fix*, *correct*, *ensure*, *prevent*,
*resolve*, or *stop*, the type is almost certainly `fix`, not `refactor`.

## Scopes

Optional, and they do not affect the release. Tegami normally maps a scope to a
workspace package; this repo has one package, and `scripts/tegami.mts` points
scope-less commits at it. Use a scope only when it aids scanning —
`fix(express):`, `feat(react):`, `chore(deps):`.

## Subjects

Imperative mood, describing the effect on the user, lower case, no trailing
period:

```
fix: stop losing logs queued during a flush
feat: add waitUntil config option for reliable Cloudflare Workers delivery
perf: split oversized keepalive batches instead of retrying them
```

Not `update batcher.ts`, `changes`, or `fix bug`.

## Squash merges

When a PR is squash-merged, GitHub uses the **PR title** as the commit subject.
The PR title is therefore what gets parsed and must follow this format. Check it
before merging; the commits inside the PR no longer matter at that point.

When a PR is merge-committed, every commit is parsed and the highest bump among
them wins.

## Overriding the computed bump

When the commits understate the impact, or the release deserves prose rather
than assembled subject lines, add a file under `.tegami/` and commit it with the
change:

```markdown
---
packages:
  vedatrace: major
---

# Drop the legacy transport API

`VedaTraceHttpTransportBrowser` is gone. Set `keepalive` on the base transport.
```

Rules: `packages` frontmatter is required, the body needs at least one heading,
and the bump is `major`, `minor` or `patch`. The file merges with whatever the
commits produced and **the highest bump wins** — it can raise a release, never
lower one. `bun run release` writes one interactively.

Never hand-edit `CHANGELOG.md` or `.tegami/publish-lock.yaml`; both are
generated, and editing them corrupts the release state.

## Checking your work

`bun run release:version` prints the release plan:

```
npm:vedatrace: 0.3.0 -> 0.3.1 (1 changelogs)
```

There is no dry-run, so it really does apply the bump. Revert it afterwards —
this restores the version, the generated changelog files it consumed, and the
publish lock:

```bash
bun run release:version
git checkout -- package.json src/version.ts CHANGELOG.md .tegami
rm -f .tegami/publish-lock.yaml
```

Do not skip the `.tegami` path in that checkout: applying a draft *deletes* the
pending changelog files it consumed, and without restoring them you would commit
their removal.

"No pending version changes matched workspace packages" means nothing you
committed is releasable — usually a `refactor:` that should have been a `fix:`.

## When someone asks why a merge did not publish

Check in this order:

1. Commit type is non-releasable (`refactor`, `chore`, …) — the usual cause.
2. The PR was squash-merged and the **PR title** was not conventional, even
   though the commits inside were.
3. A publish is still owed from a previous release: the version step is blocked
   until `.tegami/publish-lock.yaml` clears. `bun run release:check` exits 0
   when a publish is pending.
4. The release tag is missing or stale — Tegami reads commits from
   `git describe --tags --abbrev=0`, so an unpushed tag makes it re-read
   already-released history.
