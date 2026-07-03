# Task: Billing Portal server action

## Description
Add a server action that creates a Stripe Billing Portal session for the current user so
they can manage/cancel/update payment via Stripe's hosted UI.

## Background
Self-service management is offloaded to the Stripe Billing Portal (decision Q4). Opening
it requires the user's `stripeCustomerId` (stored at first successful checkout) and a
`return_url`. See `research/stripe-integration.md` (Billing Portal) and
`design/detailed-design.md` §4.1/§4.2/FR-14.

## Technical Requirements
1. Implement `openBillingPortal()` in `actions/subscription.ts` (auth required) that looks
   up the user's `stripeCustomerId` and calls
   `stripe.billingPortal.sessions.create({ customer, return_url })`.
2. Return the portal URL, or `{error}` when no customer id / Stripe unconfigured.
3. Never expose secrets; only return the portal URL.

## Dependencies
- Step03 (`getStripe`), Step01/06 (`Subscription.stripeCustomerId`), Step04 (auth).

## Implementation Approach
1. Thin action: auth → look up customer id → create portal session → return URL.
2. Configure `return_url` to the account/status page.

## Acceptance Criteria

1. **Returns portal URL**
   - Given an authenticated user with a `stripeCustomerId`
   - When `openBillingPortal()` is called
   - Then it returns the Billing Portal session URL.

2. **Error without customer**
   - Given a user with no `stripeCustomerId`
   - When called
   - Then it returns `{error}` (no throw).

3. **Unconfigured handled**
   - Given Stripe unconfigured/disabled
   - When called
   - Then it returns `{error}`.

4. **Unit tests**
   - Given the action tests
   - When run
   - Then URL return, missing-customer, and unconfigured paths are covered (mock stripe +
     Prisma + session).

## Metadata
- **Complexity**: Low
- **Labels**: stripe, billing-portal, server-actions
- **Required Skills**: Stripe Billing Portal, Next.js Server Actions
