# Task: Stripe status mapping and version-safe period-end reader

## Description
Implement helpers that translate Stripe subscription statuses into the app's
`SubscriptionStatus` enum and safely read the current-period-end timestamp regardless of
API-version field placement.

## Background
The app enum is `ACTIVE | PAST_DUE | CANCELED | INCOMPLETE | UNPAID`. Stripe statuses
include `active`, `trialing`, `past_due`, `canceled`, `incomplete`,
`incomplete_expired`, `unpaid`. In recent API versions `current_period_end` may live on
subscription items rather than the top-level object, so reading it must be defensive.
See `research/stripe-integration.md` and `design/detailed-design.md` §4.1/§5.

## Technical Requirements
1. Implement `mapStripeStatus(stripeStatus)` in `lib/stripe/events.ts`:
   `active|trialing → ACTIVE`, `past_due → PAST_DUE`, `canceled → CANCELED`,
   `incomplete|incomplete_expired → INCOMPLETE`, `unpaid → UNPAID`.
2. Implement a version-safe period-end reader that returns a `Date | null` from a Stripe
   subscription object, checking both top-level and item-level locations.
3. Return `null` (not throw) when the value is absent.

## Dependencies
- Step01 (`SubscriptionStatus` enum); `stripe` types (step03/task-01).

## Implementation Approach
1. Use a switch/map for statuses with an explicit default (map unknown → INCOMPLETE or a
   documented safe default).
2. For period end, check the documented locations in order and coerce epoch seconds to a
   `Date`.

## Acceptance Criteria

1. **All statuses mapped**
   - Given each Stripe status value
   - When `mapStripeStatus` is called
   - Then it returns the correct app enum value per the mapping.

2. **Unknown status safe**
   - Given an unexpected status string
   - When mapped
   - Then it returns a documented safe default rather than throwing.

3. **Period end from top-level**
   - Given a subscription object with a top-level period end
   - When read
   - Then a correct `Date` is returned.

4. **Period end from item-level / absent**
   - Given a subscription where the value is on an item, or absent
   - When read
   - Then the item value is returned as a `Date`, or `null` if absent (no throw).

5. **Unit tests**
   - Given the helper tests
   - When run
   - Then all mappings and both period-end locations plus the absent case are covered.

## Metadata
- **Complexity**: Low
- **Labels**: stripe, mapping, lib, resilience
- **Required Skills**: TypeScript, Stripe data model
