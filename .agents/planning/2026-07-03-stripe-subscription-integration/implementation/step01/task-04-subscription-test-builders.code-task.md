# Task: Add subscription test builders and extend admin-user fixture

## Description
Extend the shared test-fixture factory so later tasks can construct `Subscription`
rows, Stripe event fixtures, and admin-user objects with subscription/exempt fields
without duplicating boilerplate.

## Background
`__tests__/utils/test-builders.ts` centralizes factory functions used across the test
suite (e.g. `makePrismaUser`, `makeAdminSession`, `makeAdminUserWithStats`). Tests mock
`@/lib/prisma` and assert against these builder outputs. Adding builders now (alongside
the schema) keeps subsequent TDD steps consistent and DRY. See
`research/ui-and-testing.md` §D and `design/detailed-design.md` §7.

## Technical Requirements
1. Add a `makePrismaSubscription(overrides?)` builder returning a valid `Subscription`
   shape (sensible defaults: `status: 'ACTIVE'`, ids present, `cancelAtPeriodEnd: false`,
   a `currentPeriodEnd`), overridable per field.
2. Add a Stripe event fixture builder (e.g. `makeStripeEvent(type, overrides?)`)
   producing a minimal object shaped like `Stripe.Event` with `id`, `type`, and
   `data.object`, suitable for webhook/job tests.
3. Extend `makeAdminUserWithStats` (or add an option) so it can include
   `subscriptionStatus`, `currentPeriodEnd`, `cancelAtPeriodEnd`, `isExempt`,
   `exemptReason`, and `stripeCustomerId`.
4. Keep builders typed against the generated Prisma/Stripe types where practical, with
   defaults that satisfy the types.

## Dependencies
- Task-01 (Prisma types) and Task-03 (exempt fields) for accurate typing.
- Jest test infrastructure; existing `__tests__/utils/test-builders.ts` patterns.
- `stripe` types may not be installed until a later step; if so, type the event fixture
  loosely (documented) and tighten when the SDK is added.

## Implementation Approach
1. Follow the existing builder style in `test-builders.ts` (plain functions with an
   `overrides` spread) to add the new factories.
2. Provide realistic defaults so a bare `makePrismaSubscription()` yields a coherent
   active subscription; expose overrides for status/period/exempt scenarios.

## Acceptance Criteria

1. **Subscription builder defaults**
   - Given `makePrismaSubscription()` called with no args
   - When invoked
   - Then it returns a coherent active `Subscription` object (valid ids, status ACTIVE,
     `cancelAtPeriodEnd` false) matching the Prisma type.

2. **Subscription builder overrides**
   - Given `makePrismaSubscription({ status: 'PAST_DUE', cancelAtPeriodEnd: true })`
   - When invoked
   - Then the returned object reflects exactly those overrides with other fields at
     defaults.

3. **Stripe event fixture**
   - Given `makeStripeEvent('customer.subscription.deleted')`
   - When invoked
   - Then it returns an object with `id`, `type` set to the argument, and a `data.object`
     usable by webhook/job tests.

4. **Admin-user fixture includes subscription fields**
   - Given the extended `makeAdminUserWithStats` with subscription overrides
   - When invoked
   - Then the returned object includes `subscriptionStatus`, `isExempt`, `exemptReason`,
     and `stripeCustomerId` with the provided/overridden values.

5. **Builders type-check and are consumed by a smoke test**
   - Given a small test importing the new builders
   - When the test suite runs
   - Then the builders compile with no TypeScript errors and the smoke test asserts the
     default shapes.

## Metadata
- **Complexity**: Low
- **Labels**: testing, fixtures, jest, stripe, prisma
- **Required Skills**: Jest, TypeScript, test data design
