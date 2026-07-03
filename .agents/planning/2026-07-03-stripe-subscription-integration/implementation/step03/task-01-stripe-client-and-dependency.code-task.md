# Task: Stripe SDK dependency and configured client factory

## Description
Add the Stripe Node SDK and a factory that builds a Stripe client from stored config,
returning null when the integration is not configured.

## Background
Secrets live in the encrypted `Config` singleton (step01/step02). The SDK is `stripe`
(current major `^22.x`); the app's API version is `2026-06-24.dahlia`, but pinning
`apiVersion` in Node can produce inaccurate TS types, so it should only be set if it
matches the installed SDK — otherwise omit and verify at build time. See
`research/stripe-integration.md` and `design/detailed-design.md` §4.1/§8.4.

## Technical Requirements
1. Add `stripe` to `package.json` dependencies.
2. Implement `lib/stripe/client.ts` `getStripe()` that reads the secret key from
   `Config` and returns a configured `Stripe` instance, or `null` if unconfigured.
3. Do not hard-pin `apiVersion` unless it matches the installed SDK version (leave a
   clear note/decision point; default to the SDK's built-in version).
4. Never log or expose the secret key.

## Dependencies
- Step01/Step02 (`Config.stripeSecretKey`, decrypted on read).
- `@/lib/prisma`; `stripe` npm package.

## Implementation Approach
1. Read secret via a config accessor; construct `new Stripe(secret, options?)`.
2. Cache/memoize is optional; keep it simple and stateless if unsure.

## Acceptance Criteria

1. **Returns client when configured**
   - Given `Config.stripeSecretKey` is set
   - When `getStripe()` is called
   - Then it returns a `Stripe` instance.

2. **Returns null when unconfigured**
   - Given no secret key
   - When `getStripe()` is called
   - Then it returns `null` (callers handle gracefully).

3. **No secret leakage**
   - Given any invocation
   - When it runs
   - Then the secret key is never logged or returned to callers directly.

4. **Unit tests**
   - Given the client tests
   - When run
   - Then configured/unconfigured paths are covered (mocked config + `stripe`).

## Metadata
- **Complexity**: Low
- **Labels**: stripe, integration, lib, dependencies
- **Required Skills**: TypeScript, Stripe SDK, Prisma
