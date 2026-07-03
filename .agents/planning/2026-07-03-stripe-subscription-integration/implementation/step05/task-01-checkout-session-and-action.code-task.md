# Task: Checkout session builder and startCheckout server action

## Description
Create the Stripe Checkout Session in subscription mode with identity binding and promo
codes, exposed through a user-facing server action.

## Background
Checkout must bind the app user via `client_reference_id = user.id` and propagate
`metadata.appUserId` to the subscription so webhooks map back reliably (never by email).
Promo codes are enabled (R6). The action must be callable while the user is gated (it is
the escape hatch from `/subscribe`), so it requires auth but NOT the subscription gate.
See `research/stripe-integration.md` and `design/detailed-design.md` §4.1/§4.2/FR-10..12.

## Technical Requirements
1. Implement `createCheckoutSession(userId, priceId)` in `lib/stripe/checkout.ts`:
   `mode: 'subscription'`, `line_items: [{ price: priceId, quantity: 1 }]`,
   `client_reference_id: userId`, `subscription_data.metadata.appUserId: userId`,
   `allow_promotion_codes: true`, `success_url` (with session id) and `cancel_url`, and
   prefill `customer_email` from the user's Plex email when available.
2. Implement `startCheckout(priceId)` in `actions/subscription.ts` (auth required; gate
   NOT required) that validates the price id is among the configured offered prices and
   returns the Checkout URL or `{error}`.
3. Return a clear `{error}` when Stripe is unconfigured/disabled.

## Dependencies
- Step03 (`getStripe`, `getOfferedPrices`); Step04 (auth). App base URL from env/config.

## Implementation Approach
1. Build the session in the lib layer; keep the action thin (auth, validation, call,
   return URL).
2. Validate `priceId` against `getOfferedPrices()` to prevent arbitrary price usage.

## Acceptance Criteria

1. **Session params correct**
   - Given a valid user and offered price id
   - When `createCheckoutSession` is called
   - Then the session is created with subscription mode, `client_reference_id`,
     `subscription_data.metadata.appUserId`, `allow_promotion_codes: true`, and success/
     cancel URLs.

2. **Action returns URL**
   - Given an authenticated user calling `startCheckout` with an offered price
   - When it completes
   - Then it returns the Checkout session URL.

3. **Rejects non-offered price**
   - Given a price id not in the configured offered set
   - When `startCheckout` is called
   - Then it returns `{error}` and does not create a session.

4. **Unconfigured/disabled handled**
   - Given Stripe unconfigured/disabled
   - When `startCheckout` is called
   - Then it returns `{error}` (no throw).

5. **Unit tests**
   - Given the tests
   - When run
   - Then param assembly, offered-price validation, disabled handling, and auth are
     covered (mocked `stripe`, config, session).

## Metadata
- **Complexity**: Medium
- **Labels**: stripe, checkout, server-actions, payments
- **Required Skills**: Stripe Checkout, Next.js Server Actions, TypeScript
