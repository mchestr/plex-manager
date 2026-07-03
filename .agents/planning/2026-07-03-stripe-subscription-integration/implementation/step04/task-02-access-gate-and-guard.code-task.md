# Task: Access gate status + (app) layout guard with /subscribe redirect

## Description
Implement the pure-DB access-gate logic and wire a guard into the authenticated layout
so non-allowed users are redirected to `/subscribe`, while everyone else passes.

## Background
There is no middleware; gating is layout/guard-based. `app/(app)/layout.tsx` already
composes `ensureSetupComplete()` and `ensureOnboardingComplete()` from `lib/guards.ts`.
The gate must be pure-DB (no live Plex call) and allow a user when ANY of: Stripe
disabled; `isAdmin`; `isExempt`; active subscription (`ACTIVE` or `PAST_DUE`). A
placeholder `/subscribe` route (outside `(app)`) is created to avoid a redirect loop.
See `research/auth-gating.md` §3/§4 and `design/detailed-design.md` FR-5/FR-7.

## Technical Requirements
1. Add `getAccessGateStatus(userId)` (in `lib/guards.ts` or a helper) returning whether
   a user is allowed per the rules above, reading only the DB.
2. Add `ensureSubscriptionOrAccess()` that redirects to `/subscribe` when not allowed
   and is a no-op when allowed or when unauthenticated (handled elsewhere).
3. Call `ensureSubscriptionOrAccess()` in `app/(app)/layout.tsx` AFTER
   `ensureOnboardingComplete()`.
4. Create a minimal `/subscribe` route outside the `(app)` group (placeholder content;
   filled in step05) that does not itself trigger the gate.

## Dependencies
- Step01 (`isExempt`, `Subscription`), Step02 (`stripeEnabled`).
- `lib/guards.ts`, `app/(app)/layout.tsx`, `getServerSession`.

## Implementation Approach
1. Implement the truth table as a single DB read (user flags + subscription status).
2. Ensure `/subscribe` and any pre-auth routes are excluded from the guarded group.

## Acceptance Criteria

1. **Disabled = allowed (no-op)**
   - Given `stripeEnabled = false`
   - When the guard runs for any user
   - Then the user is allowed (no redirect) — behavior matches today.

2. **Non-allowed redirected**
   - Given Stripe enabled and a user who is not admin/exempt and has no active/past_due
     subscription
   - When they load an `(app)` route
   - Then they are redirected to `/subscribe`.

3. **Allowed users pass**
   - Given an admin, an exempt user, or a user with an ACTIVE/PAST_DUE subscription
   - When they load an `(app)` route
   - Then they pass to the app (no redirect).

4. **No redirect loop**
   - Given a gated user
   - When redirected to `/subscribe`
   - Then `/subscribe` renders (it is outside the guarded group).

5. **Unit tests**
   - Given gate/guard tests
   - When run
   - Then the full truth table (disabled/admin/exempt/active/past_due/none) and the
     redirect behavior are covered.

## Metadata
- **Complexity**: Medium
- **Labels**: auth, gating, nextjs, guards, stripe
- **Required Skills**: Next.js App Router, server components, auth patterns
