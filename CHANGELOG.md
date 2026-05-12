# vedatrace

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
