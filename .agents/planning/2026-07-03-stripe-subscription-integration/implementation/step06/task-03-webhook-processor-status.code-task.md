# Task: Stripe webhook job processor (status recording only)

## Description
Implement the `STRIPE_WEBHOOK` job processor that re-fetches the event by id, records it
for idempotency, and updates the `Subscription` row's status/fields — with no Plex side
effects yet.

## Background
For correctness the processor re-fetches the event from Stripe by id (acts on Stripe's
current truth, keeps queue payloads tiny). It maps Stripe statuses via `mapStripeStatus`
and reads period end via the version-safe reader. This task deliberately excludes Plex
provisioning/removal (added in steps 07/08) so the event→DB spine can be verified in
isolation. See `research/webhook-and-jobs.md` and `design/detailed-design.md` §4.4/§5.

## Technical Requirements
1. Implement `processStripeWebhook(job)` in `lib/queue/jobs/stripe.ts`: retrieve the
   event by `eventId` from Stripe; persist a `StripeEvent` record for idempotency.
2. Handle: `checkout.session.completed` → upsert `Subscription` as `ACTIVE`, storing
   `stripeCustomerId`, `stripeSubscriptionId`, `priceId`, `currentPeriodEnd`, and mapping
   the app user via `client_reference_id`/`metadata.appUserId`.
3. Handle `customer.subscription.updated` → sync `status`, `currentPeriodEnd`,
   `cancelAtPeriodEnd`; `customer.subscription.deleted` → `CANCELED`;
   `invoice.payment_failed` → `PAST_DUE`.
4. Ignore unhandled event types gracefully.
5. Do NOT perform any Plex invite/removal in this task.

## Dependencies
- Step03 (`getStripe`, `mapStripeStatus`, period-end reader), Step06 task-01/02, Step01
  (`Subscription`, `StripeEvent`).

## Implementation Approach
1. Switch on `event.type`; upsert/update `Subscription` keyed by user or stripe ids.
2. Persist `StripeEvent` as part of processing to reinforce idempotency.

## Acceptance Criteria

1. **Checkout completed → active subscription**
   - Given a `checkout.session.completed` event bound to an app user
   - When processed
   - Then a `Subscription` is upserted with status ACTIVE and the stripe/customer ids and
     period end stored.

2. **Updated → status synced**
   - Given a `customer.subscription.updated` event (e.g. cancel_at_period_end true)
   - When processed
   - Then the row's status/period/`cancelAtPeriodEnd` reflect the event.

3. **Deleted / payment_failed mapped**
   - Given `customer.subscription.deleted` / `invoice.payment_failed`
   - When processed
   - Then status becomes CANCELED / PAST_DUE respectively.

4. **Idempotent + no Plex effects**
   - Given the processor runs
   - When it executes
   - Then a `StripeEvent` is recorded and NO Plex invite/removal occurs in this task.

5. **Processor unit tests**
   - Given processor tests (called as a plain function with a fixture event)
   - When run
   - Then each event type's DB mutation is asserted (mocked Prisma + `stripe.events`),
     establishing the BullMQ processor test pattern.

## Metadata
- **Complexity**: Medium
- **Labels**: bullmq, stripe, webhook, subscriptions, jobs
- **Required Skills**: BullMQ, Stripe events, Prisma, TypeScript
