# vedatrace

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
