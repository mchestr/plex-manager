# Task: Enqueue grant job on checkout.session.completed (respecting enabled flag)

## Description
Wire the webhook processor to enqueue the Plex access grant job when a subscription
becomes active, but only when the integration is enabled.

## Background
Step06 records subscription status; step07 task-01 built the grant job. This task
connects them: on `checkout.session.completed`, after upserting the ACTIVE subscription,
enqueue `PLEX_ACCESS_GRANT`. While Stripe is disabled, the webhook still records status
but skips Plex side effects (FR-29). See `research/webhook-and-jobs.md` and
`design/detailed-design.md` §4.4/FR-12/FR-29.

## Technical Requirements
1. In `processStripeWebhook`, after handling `checkout.session.completed`, enqueue
   `PLEX_ACCESS_GRANT` for the mapped user.
2. Skip enqueuing the grant when `stripeEnabled === false` (status still recorded).
3. Ensure enqueue is idempotent-friendly (safe if the event is retried).

## Dependencies
- Step06 task-03 (`processStripeWebhook`), Step07 task-01 (grant job), Step02
  (`stripeEnabled`).

## Implementation Approach
1. Read `stripeEnabled` in the processor; gate the grant enqueue behind it.
2. Use a deterministic job id (e.g. tied to user/subscription) to avoid duplicate grants
   on retries.

## Acceptance Criteria

1. **Grant enqueued when enabled**
   - Given Stripe enabled and a `checkout.session.completed` event
   - When processed
   - Then the ACTIVE subscription is recorded AND a `PLEX_ACCESS_GRANT` job is enqueued.

2. **Skipped when disabled**
   - Given Stripe disabled
   - When the same event is processed
   - Then the subscription status is still recorded but NO grant job is enqueued.

3. **Retry-safe**
   - Given the event is delivered/processed twice
   - When processed
   - Then it does not create duplicate effective grants (dedupe via job id / state check).

4. **End-to-end provisioning**
   - Given a non-member completes Checkout (enabled)
   - When the webhook flow runs
   - Then the user ends up invited/accepted (or pending) and subsequently passes the
     access gate.

5. **Unit tests**
   - Given processor tests
   - When run
   - Then enabled-enqueues, disabled-skips, and retry-safety are covered.

## Metadata
- **Complexity**: Low
- **Labels**: bullmq, stripe, webhook, provisioning, integration
- **Required Skills**: BullMQ, TypeScript, integration wiring
