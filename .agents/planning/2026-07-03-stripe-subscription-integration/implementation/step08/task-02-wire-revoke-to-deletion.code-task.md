# Task: Enqueue revoke job on subscription deletion/unpaid (respecting enabled flag)

## Description
Wire the webhook processor to enqueue the Plex revoke job when a subscription is finally
deleted or marked unpaid, only when the integration is enabled.

## Background
Cancellation is at period end: `cancel_at_period_end` fires `customer.subscription.updated`
(no removal — just show "cancels on <date>"), and `customer.subscription.deleted` fires at
period end (drives removal). `unpaid` also warrants removal; `past_due` does not. While
disabled, record status but skip Plex effects (FR-29). See `research/stripe-integration.md`
(events) and `design/detailed-design.md` §4.4/FR-17/FR-18/FR-29.

## Technical Requirements
1. In `processStripeWebhook`, enqueue `PLEX_ACCESS_REVOKE` on
   `customer.subscription.deleted` (and when status maps to `UNPAID`).
2. Do NOT enqueue revoke for `cancel_at_period_end` updates or `past_due` (access
   retained; UI shows pending cancellation / dunning).
3. Skip enqueuing when `stripeEnabled === false` (status still recorded).
4. Use a deterministic job id to avoid duplicate revokes on retries.

## Dependencies
- Step06 task-03 (`processStripeWebhook`), Step08 task-01 (revoke job), Step02
  (`stripeEnabled`).

## Implementation Approach
1. Branch enqueue logic on event type / mapped status; gate behind `stripeEnabled`.
2. Rely on the job's internal guards as a second safety layer.

## Acceptance Criteria

1. **Revoke on deletion (enabled)**
   - Given Stripe enabled and a `customer.subscription.deleted` event
   - When processed
   - Then status becomes CANCELED and a `PLEX_ACCESS_REVOKE` job is enqueued.

2. **No revoke on cancel-at-period-end / past_due**
   - Given a `customer.subscription.updated` with `cancel_at_period_end`, or a
     `past_due` transition
   - When processed
   - Then NO revoke job is enqueued (access retained).

3. **Skipped when disabled**
   - Given Stripe disabled and a deletion event
   - When processed
   - Then status is recorded but NO revoke job is enqueued.

4. **End-to-end removal**
   - Given a non-exempt subscriber whose period ends (enabled)
   - When the deletion event flows through
   - Then they are unshared from Plex (subject to job guards).

5. **Unit tests**
   - Given processor tests
   - When run
   - Then deletion-enqueues, cancel-at-period-end/past_due-no-enqueue, and disabled-skip
     are covered.

## Metadata
- **Complexity**: Low
- **Labels**: bullmq, stripe, webhook, deprovisioning, integration
- **Required Skills**: BullMQ, Stripe events, TypeScript
