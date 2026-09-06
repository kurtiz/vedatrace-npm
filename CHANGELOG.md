## vedatrace@0.3.1

### correctness batch — per-request logger leak, browser crash, lost logs, retry storms

- **fix(express, next): stop creating a logger per request.** `vedaTraceMiddleware()` and `withVedaTrace()` called `vedatrace()` inside the request handler. Every call opened its own batcher, HTTP transport and flush interval, and registered three `process` listeners — so a Node app hit `MaxListenersExceededWarning` after ten requests and leaked a timer per request thereafter. Both now build one logger when the middleware is constructed and derive per-request context with `child()`, which shares the parent's batcher. Measured on 50 requests: 50 listeners before, 1 after.
- **fix: remove the `process.env` read that crashed browser bundles.** The SDK version came from `process.env.npm_package_version`, evaluated at module scope. Bundlers leave the bare `process` reference in place, so importing `vedatrace/react` under Vite threw `ReferenceError: process is not defined`; npm also only sets that variable for its own lifecycle scripts, so the version was always `undefined`. The version is now generated into `src/version.ts` at build time.
- **fix(batcher): stop losing logs written during a flush.** `flush()` returned early while a send was in flight, leaving anything logged in the meantime queued with nothing scheduled to send it. In a Worker — where the handler returns as soon as `flush()` resolves — those last logs were dropped. The flush promise now chains a drain, so `waitUntil` covers them too.
- **fix(batcher): stop retrying requests that cannot succeed.** Every failure was retried three times with backoff, including `401 Invalid API key` and `400 No valid logs`. Retries are now limited to 408/425/429/5xx and network errors, and a `Retry-After` header takes precedence over local backoff.
- **fix(batcher): stand down after an authentication failure.** A `401`/`403` now reports once through `onError` and halts the batcher instead of spending a doomed request on every subsequent flush. `logger.start()` resumes it.
- **fix(browser): stop breaking the back/forward cache.** The lifecycle handler registered `beforeunload` and `unload`, either of which makes a page ineligible for the bfcache in Chrome and Safari — so the SDK slowed down every back-navigation in the host app. It now uses `visibilitychange` + `pagehide` only, which covers the same cases.
- **fix(browser): make the final flush actually send.** `finalFlush()` called `transport.flush()`, an explicit no-op, and its comment claimed a `navigator.sendBeacon` path that did not exist (and could not: `sendBeacon` cannot set the `X-API-Key` header the ingestion endpoint authenticates with). The exit flush now goes through the batcher's keepalive transport, and oversized batches are split to stay under the 64 KiB body limit the fetch spec puts on keepalive requests — over that limit the request was rejected outright.
- **fix(next): make `serverLogger` work.** It was constructed at import time with no API key, so it had no transport and silently dropped every call. It is now built lazily on first use; `getServerLogger(config)` is available for explicit configuration.
- **feat: read `VEDATRACE_API_KEY` from the environment** when no `apiKey` is passed, guarded so it cannot throw in browsers or Workers without `nodejs_compat`.
- **feat: export `VedaTraceTransportError`** carrying `status`, `retryable`, `fatal` and `retryAfterMs`, so `onError` handlers can tell a bad key from a network blip.
- **chore: fix the dependency declarations.** `express` was declared as a peer of `"latest"`, which is a dist-tag rather than a semver range; it is now `>=4`. `@types/*` moved into `devDependencies` as well, so the repo can typecheck itself in CI. Adds `sideEffects: false`, `engines.node >=18` and a `typecheck` script.

## 0.3.0

### Minor Changes

- 0edc65c: feat: waitUntil config option for reliable Cloudflare Workers log delivery

## 0.3.0

### Minor Changes

- feat: add `waitUntil` config option for reliable Cloudflare Workers log delivery

  Cloudflare Workers terminate execution immediately after returning a `Response`,
  cancelling any in-flight HTTP requests — including log delivery. This release
  adds the `waitUntil` config option so VedaTrace can extend the worker's
  lifetime until the flush completes.

  ```ts
  import { waitUntil } from "cloudflare:workers";

  const logger = vedatrace({
    apiKey: env.API_KEY,
    service: "my-worker",
    waitUntil,
  });

  // Logs flush automatically — no manual .flush() needed
  logger.info("Hello");
  ```

  Three delivery modes are now available:

  - **`waitUntil` config** (recommended): pass `import { waitUntil } from 'cloudflare:workers'` — flush happens automatically via `queueMicrotask` + `waitUntil`
  - **Execution context**: call `logger.withContext(ctx)` to attach the Cloudflare `ExecutionContext` — VedaTrace calls `ctx.waitUntil()` internally
  - **Manual fallback**: `ctx.waitUntil(logger.flush())` for explicit control

- feat: add `immediateFlush` config option to bypass batching and flush on every log call
- feat: add `debug` config option for verbose SDK operation logging
- feat: enable `keepalive: true` on HTTP transport in serverless environments (was browser-only)
- feat: add fallback Node.js process handlers (`beforeExit`, `SIGTERM`, `SIGINT`) when runtime is misidentified as `cloudflare` due to navigator polyfill (e.g. TanStack Start dev)

### Patch Changes

- fix: replace `setTimeout` with `queueMicrotask` in debounced flush to ensure flush runs before handler returns
- fix: guard `context.waitUntil()` call with `typeof` check to prevent `TypeError` when TanStack Start's generic context is used

## 0.2.1

### Patch Changes

- fix: minor bug fixes and improvements

## 0.2.0

### Minor Changes

- feat: multi-runtime support with context-aware batching

  - Add Cloudflare Workers ExecutionContext support via withContext()
  - Implement browser lifecycle handling (visibilitychange, pagehide, beforeunload)
  - Add runtime-specific flush intervals (3s for Node/Bun/Deno/Browser, 1s for Edge)
  - Update Bun and Deno to use standard batching instead of immediateFlush
  - Add unref timer support for graceful process exit in Node/Bun/Deno
  - Clean up batcher API: move onError/onSuccess to BatcherConfig
  - Add VedaTraceHttpTransportBrowser with keepalive support
  - Update SDK version to read from package.json dynamically

## 0.1.9

### Patch Changes

- 72ecb71: fixed runtime issue on start up and flusher

## 0.1.8

### Patch Changes

- 6b21e83: fix batcher on error catches

## 0.1.7

### Patch Changes

- 8cb03a6: Fix unref timer function that crashes in non-node environment like edge/browser

## 0.1.7

### Patch Changes

- Fix unhandled promise rejection in batcher that crashes Cloudflare Workers when HTTP transport fails and no onError handler is set. Errors now fall back to console.error instead of being silently dropped.
- 8cb03a6: Fix unref timer function that crashes in non-node environment like edge/browser

## 0.1.6

### Patch Changes

- 5979e38: update ingestion endpoint

## 0.1.5

### Patch Changes

- 7d60ece: fixed log hangs and minor bugs

## 0.1.4

### Patch Changes

- 9f9a3b8: rety CI/CD with OIDC

## 0.1.3

### Patch Changes

- 03cb1b9: added an environment to the CI/CD to enable the OIDC authentication

## 0.1.2

### Patch Changes

- 95fae9c: retry publish with OIDC

## 0.1.1

### Patch Changes

- 3548c8f: Test release setup
