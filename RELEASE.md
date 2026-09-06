# Release Process

Releases are driven by [Tegami](https://tegami.fuma-nama.dev/) and, in the
normal case, by your commit messages alone.

## The short version

Write conventional commits. Merge your PR. That's it.

```
fix: stop losing logs queued during a flush     -> patch   0.3.0 -> 0.3.1
feat: add sampleRate config                     -> minor   0.3.1 -> 0.4.0
feat!: drop the legacy transport API            -> major   0.4.0 -> 1.0.0
refactor: tidy the batcher internals            -> nothing
```

`perf:` and `revert:` also produce a patch. A `BREAKING CHANGE:` footer produces
a major, same as the `!`. Everything else — `chore:`, `docs:`, `refactor:`,
`style:`, `test:`, `ci:`, `build:` — releases nothing, which is the point: a
refactor should not publish a version.

Scopes are optional. `fix:` and `fix(vedatrace):` behave identically here.

**[CONTRIBUTING.md](./CONTRIBUTING.md#commit-messages) is the full reference** —
how to pick a type, what happens under squash merges, and the `refactor:` trap
that silently ships nothing. Agents working in this repo get the same guidance
from `.claude/skills/conventional-commits/`.

## What happens after you merge

1. Your commit lands on `main`. The Release workflow verifies the tree (lint,
   typecheck, tests, build, publint, attw, tarball smoke test).
2. No publish is owed yet, so Tegami computes the bump from the commits since
   the last tag, rewrites `package.json` and `src/version.ts`, prepends to
   `CHANGELOG.md`, writes `.tegami/publish-lock.yaml`, and opens a
   **Version Packages** PR.
3. That PR is auto-merged.
4. The merge lands on `main`, the workflow runs again, sees a publish is owed,
   and ships to npm with provenance — then tags the commit and cuts a GitHub
   release.

The publish lock is committed before anything is published, so a failed publish
can be retried by re-running the job rather than re-versioning.

### One setup step for a fully hands-off loop

Anything done with the built-in `GITHUB_TOKEN` is barred from triggering another
workflow run. So a version PR it opens gets no CI, and a merge it performs never
starts step 4 — the PR merges and then sits there.

A GitHub App token has no such restriction. The workflow mints one when these
two repository secrets exist:

| Secret                      | Where it comes from                                  |
| --------------------------- | ---------------------------------------------------- |
| `RELEASE_APP_CLIENT_ID`     | The App's settings page, "Client ID"                  |
| `RELEASE_APP_PRIVATE_KEY`   | The `.pem` you download when generating a private key |

The App needs **Contents: Read and write** and **Pull requests: Read and write**
under *Repository permissions*, and must be **installed on this repository** —
creating it is not enough.

Paste the private key whole, including the `-----BEGIN RSA PRIVATE KEY-----` and
`-----END RSA PRIVATE KEY-----` lines.

Until both secrets exist the workflow falls back to `github.token`: everything
still runs, the publish just needs a nudge — re-run Release, or push any commit
to `main`.

`gh pr merge --auto` also needs **Allow auto-merge** enabled in
Settings → General; the workflow falls back to an immediate merge if it isn't.
If `main` requires approving reviews, auto-merge will wait for an approval no
bot will give — exempt the App in the branch protection rule, or drop that
requirement. Required *status checks* are fine and are the reason the version PR
is opened as the App: it gets CI, so `--auto` has something real to wait on.

### Turning auto-merge off

Set the repository variable `AUTO_MERGE_RELEASE` to `false`. The version PR is
still opened automatically; you just review and merge it yourself.

## Overriding the computed version

Write a file in `.tegami/` and commit it alongside your change:

```markdown
---
packages:
  vedatrace: major
---

# Drop the legacy transport API

`VedaTraceHttpTransportBrowser` is gone; use `keepalive` on the base transport.
```

Hand-written entries are merged with whatever the commits produced and **the
highest bump wins** — so a file can raise a release but never lower one. Use it
when the commit messages understate the impact, or when you want release notes
written in prose rather than assembled from subject lines.

`bun run release` opens Tegami's interactive prompt to write one of these for
you. See [CONTRIBUTING.md](./CONTRIBUTING.md#overriding-the-computed-version)
for the field rules.

## Local commands

| Command                 | What it does                                          |
| ----------------------- | ----------------------------------------------------- |
| `bun run release`       | Interactive changelog entry                            |
| `bun run release:version` | Apply the bump and write the publish lock            |
| `bun run release:check` | Exit 0 if a publish is owed                            |
| `bun run release:publish` | Publish from the lock                                |

Tegami requires **Node 24+**.

## Publishing credentials

There are none. The workflow authenticates to npm with OIDC
([trusted publishing](https://docs.npmjs.com/trusted-publishers/)) via the
`id-token: write` permission and the `release` environment, which must match the
Trusted Publisher entry on npmjs.com. Provenance is generated automatically.

If you ever see the publish fall back to token auth and fail, check that the job
upgraded npm — trusted publishing needs npm >= 11.5.1, and the npm bundled with
Node is older.

## Emergency manual release

```bash
bun run test
bun run build
npm login
npm publish
```

## See also

- [Tegami documentation](https://tegami.fuma-nama.dev/)
- [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/)
- `scripts/tegami.mts` — the release configuration
- `CHANGELOG.md` — generated
