# Task: Stripe webhook route with signature verification, dedupe, and enqueue

## Description
Add the public webhook endpoint that verifies Stripe signatures against the raw body,
deduplicates events, enqueues processing, and returns 2xx quickly.

## Background
Stripe webhooks require the raw request body for HMAC signature verification; in the
App Router this means `await request.text()` (never `request.json()` first). Best
practice is to verify, persist the event id for idempotency, enqueue, and return 200
immediately, deferring heavy work to the queue. The route is authenticated by the Stripe
signature (no admin auth) but should be rate-limited. See `research/webhook-and-jobs.md`
and `design/detailed-design.md` §4.3/FR-28.

## Technical Requirements
1. Create `app/api/stripe/webhook/route.ts` with `export const dynamic = 'force-dynamic'`
   and a `POST` handler.
2. Read the raw body via `await request.text()` and the `stripe-signature` header;
   verify with `stripe.webhooks.constructEvent` using the stored webhook secret.
3. On verification failure, return HTTP 400 (do not 5xx) and do not enqueue.
4. On success, if `event.id` already exists in `StripeEvent`, return 200 without
   re-enqueuing (idempotency); otherwise enqueue `STRIPE_WEBHOOK` with `{ eventId }` and
   `jobId = event.id`, then return 200.
5. Apply a rate limiter; do NOT require admin auth.

## Dependencies
- Step03 (`getStripe`/webhook secret), Step06 task-01 (job type + `addJob`), Step01
  (`StripeEvent`), existing rate-limit helper.

## Implementation Approach
1. Follow the App Router route conventions (`NextResponse`, `dynamic`).
2. Keep the handler minimal: verify → dedupe check → enqueue → 200; all side effects in
   the job.

## Acceptance Criteria

1. **Valid event enqueued**
   - Given a validly signed event not seen before
   - When POSTed to the route
   - Then the signature verifies, a `STRIPE_WEBHOOK` job is enqueued with the event id,
     and the response is 200.

2. **Invalid signature rejected**
   - Given a body/signature that fails verification
   - When POSTed
   - Then the route returns 400 and enqueues nothing.

3. **Duplicate event no-op**
   - Given an event whose id is already in `StripeEvent`
   - When POSTed
   - Then the route returns 200 and does not enqueue again.

4. **Raw body used**
   - Given the handler
   - When processing
   - Then it reads the raw text body (not parsed JSON) before verification.

5. **Route tests**
   - Given route tests
   - When run
   - Then valid→200+enqueue, invalid→400, and duplicate→200 no-op are covered (mock
     `constructEvent`, `addJob`, `StripeEvent`).

## Metadata
- **Complexity**: Medium
- **Labels**: api-route, webhook, stripe, security, bullmq
- **Required Skills**: Next.js route handlers, Stripe webhooks, TypeScript
