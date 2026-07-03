# Task: Offered-prices fetcher with caching and resilience

## Description
Implement a helper that resolves the admin-configured price IDs into display-ready price
details fetched from Stripe, with brief caching and graceful handling of invalid IDs.

## Background
`Config.stripePriceIds` stores price IDs only; the `/subscribe` page shows amount,
currency, interval, and product name fetched live from Stripe (decision R5). Multiple
prices may be offered, all granting the same binary access (R7). Invalid/deleted price
IDs must be skipped, not crash the page. See `research/stripe-integration.md` (Offered
prices) and `design/detailed-design.md` §4.1.

## Technical Requirements
1. Implement `getOfferedPrices()` in `lib/stripe/prices.ts` that, for each configured
   price ID, calls `stripe.prices.retrieve(id, { expand: ['product'] })` and returns
   `{ priceId, amount, currency, interval, productName }[]`.
2. Skip and log any price ID that fails to resolve (deleted/invalid) without throwing.
3. Apply a short-lived cache to avoid a Stripe call on every request.
4. Return an empty array when Stripe is unconfigured/disabled.

## Dependencies
- Step03 task-01 (`getStripe`); Step02 config (`priceIds`); `stripe` SDK.

## Implementation Approach
1. Read price IDs from config; fetch each with product expansion.
2. Wrap each fetch so one failure skips only that price; cache the resolved list briefly.

## Acceptance Criteria

1. **Resolves configured prices**
   - Given valid configured price IDs
   - When `getOfferedPrices()` is called
   - Then it returns display details (amount, currency, interval, product name) for each.

2. **Skips invalid IDs**
   - Given one price ID no longer exists in Stripe
   - When called
   - Then that ID is skipped (logged) and the remaining valid prices are returned.

3. **Empty when unconfigured**
   - Given Stripe is unconfigured/disabled
   - When called
   - Then it returns an empty array (no throw).

4. **Caching avoids repeat calls**
   - Given two calls within the cache window
   - When invoked
   - Then Stripe is queried once (subsequent call served from cache).

5. **Unit tests**
   - Given the helper tests
   - When run
   - Then valid resolution, invalid-skip, unconfigured, and caching behaviors are covered
     (mocked `stripe.prices.retrieve`).

## Metadata
- **Complexity**: Medium
- **Labels**: stripe, pricing, lib, caching, resilience
- **Required Skills**: TypeScript, Stripe SDK, caching patterns
