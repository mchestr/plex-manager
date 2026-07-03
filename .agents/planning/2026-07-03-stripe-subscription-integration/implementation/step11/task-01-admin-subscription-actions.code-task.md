# Task: Admin subscription server actions (cancel, grant/comp, toggle exempt)

## Description
Implement admin-only server actions to cancel a subscription (at period end), grant comp
access (invite + exempt), and toggle a user's exemption.

## Background
Admin actions live behind `requireAdmin()`. Admin cancel uses cancel-at-period-end so
Plex removal flows through the normal `customer.subscription.deleted` webhook path
(single source of truth). Grant reuses the `PLEX_ACCESS_GRANT` job and marks the user
`isExempt` with `exemptReason='comp'` (R10). See `research/ui-and-testing.md` §B and
`design/detailed-design.md` §4.2/FR-23/FR-24/FR-25.

## Technical Requirements
1. Create `actions/admin/subscriptions.ts` (all `requireAdmin()`).
2. `adminCancelSubscription(userId)` → set `cancel_at_period_end: true` on the user's
   Stripe subscription; return success/error. (Removal happens via webhook at period end.)
3. `adminGrantAccess(userId)` → enqueue `PLEX_ACCESS_GRANT` and set `isExempt = true`,
   `exemptReason = 'comp'`.
4. `adminToggleExempt(userId, reason?)` → flip `isExempt`, setting/clearing `exemptReason`.
5. Validate inputs; return `{success}|{error}`; revalidate the users path.

## Dependencies
- Step03 (`getStripe`), Step07 task-01 (grant job), Step01 (`isExempt`/`Subscription`),
  `lib/admin.ts` `requireAdmin`.

## Implementation Approach
1. Cancel: look up `stripeSubscriptionId`, call `stripe.subscriptions.update(id,
   { cancel_at_period_end: true })`.
2. Grant/toggle: update the user row and (for grant) enqueue the shared grant job.

## Acceptance Criteria

1. **Admin cancel schedules period-end cancellation**
   - Given an admin cancels a user's active subscription
   - When the action runs
   - Then Stripe is updated with `cancel_at_period_end: true` and success is returned
     (no immediate Plex removal).

2. **Grant comp invites + exempts**
   - Given an admin grants access to a user
   - When the action runs
   - Then a `PLEX_ACCESS_GRANT` job is enqueued and the user is set `isExempt = true`,
     `exemptReason = 'comp'`.

3. **Toggle exempt flips flag**
   - Given `adminToggleExempt`
   - When invoked
   - Then `isExempt` flips and `exemptReason` is set/cleared accordingly.

4. **Auth enforced**
   - Given a non-admin caller
   - When any action is invoked
   - Then it rejects.

5. **Unit tests**
   - Given the action tests
   - When run
   - Then cancel (stripe update), grant (enqueue + exempt), toggle, and auth rejection
     are covered (mock stripe, queue, Prisma, session).

## Metadata
- **Complexity**: Medium
- **Labels**: admin, server-actions, stripe, subscriptions
- **Required Skills**: Next.js Server Actions, Stripe API, Prisma, BullMQ
