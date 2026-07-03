# Task: Plex access revoke job with safety guards

## Description
Implement the `PLEX_ACCESS_REVOKE` job that removes a user's Plex access on final
cancellation, protected by hard guards that prevent removing admins, exempt users, or
non-Stripe-managed members.

## Background
Removal is the highest-risk operation. The safety invariant (Q9/FR-19): automatic
removal must NEVER unshare an admin, an `isExempt` user, or a user whose access is not
Stripe-managed (no `stripeSubscriptionId`). Past-due users keep access (Q10a) — removal
only for final canceled/unpaid. Removal uses
`unshareUserFromPlexServer({url,token}, plexUserId)` with the active server. See
`research/webhook-and-jobs.md` (REVOKE job) and `design/detailed-design.md` §4.4/FR-17..19.

## Technical Requirements
1. Implement `processPlexAccessRevoke(job)` in `lib/queue/jobs/stripe.ts`.
2. Evaluate guards FIRST and skip (log reason, succeed) if the target user: is an admin;
   is `isExempt`; has no `stripeSubscriptionId` (not Stripe-managed); or the subscription
   status is `PAST_DUE`.
3. Otherwise load the active Plex server and call `unshareUserFromPlexServer` with the
   user's `plexUserId`; update the subscription record accordingly.
4. Be idempotent (safe if already unshared); throw only on transient failures to allow
   retry.

## Dependencies
- `lib/connections/plex-invitations.ts` (`unshareUserFromPlexServer`); Step01 (`isExempt`,
  `Subscription`); Step06/07 (job types + processor module).

## Implementation Approach
1. Re-read current user/subscription state inside the job (do not trust stale payload).
2. Centralize the guard predicate so it is unit-testable and reused by any manual path.

## Acceptance Criteria

1. **Never removes protected users**
   - Given the target is an admin, `isExempt`, non-Stripe-managed, or `PAST_DUE`
   - When the revoke job runs
   - Then `unshareUserFromPlexServer` is NOT called and the job succeeds with a logged
     skip reason.

2. **Removes eligible users**
   - Given a canceled, Stripe-managed, non-exempt, non-admin user
   - When the revoke job runs
   - Then `unshareUserFromPlexServer` is called with the user's `plexUserId` and the
     record is updated.

3. **Idempotent**
   - Given the user is already unshared
   - When the job runs again
   - Then it completes without error and does not double-act.

4. **Transient failure retries**
   - Given the Plex unshare call fails transiently
   - When the job runs
   - Then it throws so BullMQ retries.

5. **Guard unit tests (highest value)**
   - Given revoke-job tests
   - When run
   - Then tests explicitly assert NO removal for admin/exempt/non-managed/past_due and
     removal ONLY for eligible users (mock plex helper + Prisma).

## Metadata
- **Complexity**: Medium
- **Labels**: bullmq, plex, deprovisioning, safety, stripe
- **Required Skills**: BullMQ, Plex API, Prisma, defensive programming
