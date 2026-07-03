# Research: Auth Gating Change

How to let non-members log in and gate them to `/subscribe`, based on codebase
investigation. No middleware exists; all gating is in layouts/pages/guards.

## 1. The `ACCESS_DENIED` throw to relax

`lib/auth.ts` ~lines 141–159 (Plex CredentialsProvider `authorize`):
```ts
const accessCheck = await checkUserServerAccess(
  { url: plexServer.url, token: plexServer.token, adminPlexUserId: plexServer.adminPlexUserId },
  plexUser.id
)
if (!accessCheck.success || !accessCheck.hasAccess) {
  logger.warn("Plex user denied access", { /* ... */ })
  throw new Error("ACCESS_DENIED")   // <-- relax this
}
```
`checkUserServerAccess` is defined in `lib/connections/plex-user-access.ts` (~53–137)
and returns `{ success: boolean; hasAccess: boolean; error?: string }`. It is a **live
Plex API call** (`getPlexUsers`) — membership is not cached.

**Change (CONDITIONAL on `Config.stripeEnabled`):** Read `stripeEnabled` in the
`authorize` callback.
- If `stripeEnabled === false` (default / existing installs): behave **exactly as
  today** — throw `ACCESS_DENIED` on `hasAccess === false`. Nothing changes.
- If `stripeEnabled === true`: do NOT throw on `hasAccess === false`; allow the user
  record to be created/updated (existing code path at ~164–220). Still handle
  `success === false` (Plex/API failure) as a real error — only the *no-access* case
  is relaxed, and only when Stripe is enabled. Downgrade the "denied" log to info.

This keeps the auth behavior change fully gated behind the admin toggle (requirement
R4): the relaxed login only exists when an admin has enabled Stripe.

> Guard subtlety: relaxing this means ANY Plex user on plex.tv can now create a
> session. That's acceptable because the `/subscribe` gate blocks all app features,
> but we must ensure member-only pages are unreachable pre-subscription (see §4).

## 2. Membership source of truth

- Live per request/sign-in via `getPlexUsers(token)` and matching the server's
  `machineIdentifier` (`actions/user-queries.ts` `buildPlexAccessMap`, ~345–428).
- No stored `hasPlexAccess` column today. For gating we need a fast, per-request
  answer without hammering the Plex API on every navigation. **Decision for design:**
  the gate keys off *subscription/exempt/grandfather* state (DB), not a live Plex
  call, to avoid latency. Live Plex access is still used by the admin list.

## 3. Redirect-gate pattern to mirror (onboarding)

`(app)` layout composes server-side guards — `app/(app)/layout.tsx`:
```ts
export const dynamic = 'force-dynamic'
export default async function AppGuardLayout({ children }) {
  await ensureSetupComplete()
  await ensureOnboardingComplete()
  return <>{children}</>
}
```
`lib/guards.ts`:
```ts
export async function ensureOnboardingComplete() {
  const { isComplete } = await getOnboardingStatus()
  if (!isComplete) redirect("/onboarding")
}
```
**Plan:** add `ensureSubscriptionOrAccess()` guard and call it in `(app)/layout.tsx`
**after** `ensureOnboardingComplete()`. Because every authenticated app route renders
under `(app)/layout.tsx`, this single insertion gates all member features.

## 4. Where the gate lives & what it checks

Add to `lib/guards.ts`:
```ts
export async function ensureSubscriptionOrAccess() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return           // unauthenticated handled elsewhere
  const gate = await getAccessGateStatus(session.user.id)  // new server fn
  if (!gate.allowed) redirect("/subscribe")
}
```
`getAccessGateStatus(userId)` returns `allowed = true` when ANY of:
0. **`Config.stripeEnabled === false`** → always allowed (gate is a no-op; the whole
   feature is off — requirement R4). This is checked first so disabled installs behave
   exactly as today.
1. `user.isAdmin` (admins always allowed), OR
2. `user.isExempt` (grandfathered or comp — Q9 / R1 / R2), OR
3. active subscription (`Subscription.status ∈ {ACTIVE, PAST_DUE}` — past_due kept
   during dunning per Q10a).

**Grandfathering (R1, confirmed):** existing members are handled by a **deploy-time
backfill** that sets `isExempt = true` (with `exemptReason = 'grandfathered'`) for all
current Plex server members. So the runtime gate never makes a live Plex call — it is
pure-DB via rule (2). Admin comps use the same flag with `exemptReason = 'comp'`.

`/subscribe` itself lives OUTSIDE the `(app)` group (it must be reachable while
gated). Confirm route placement so the guard doesn't create a redirect loop.

## 5. `/subscribe` and `/account` route placement

- `/subscribe` — new top-level route (not under `(app)` guard). Authenticated but
  ungated. Shows offered price(s) + Subscribe button (creates Checkout Session).
- `/account` (or `/subscribe/manage`) — subscriber status + "Manage subscription"
  (Billing Portal). Could live under `(app)` since active subscribers pass the gate.

## 6. Session/JWT shape

`types/next-auth.d.ts` currently exposes `session.user.isAdmin`. JWT carries
`isAdmin` + `checkedAt`, re-checked from DB every 5 min (`ADMIN_RECHECK_INTERVAL_MS`).

**Decision:** Do NOT put subscription status in the JWT (avoids stale-access windows
that matter for billing). Instead the guard fetches gate status server-side per
request (Option A). This is simpler and correct; the per-request DB read is cheap
(single indexed lookup). Only revisit if profiling shows it matters.

## 7. Admin authorization pattern (for admin UI changes)

`app/admin/layout.tsx` calls `requireAdmin()` (`lib/admin.ts`), which throws
`UnauthenticatedError`/`UnauthorizedAdminError` (caught by `app/admin/error.tsx`).
Server actions also call `requireAdmin()` (e.g. `unshareUserLibrary`). New admin
subscription actions (cancel, toggle-exempt) follow the same `requireAdmin()` gate.

## Diagram: sign-in + gating flow

```mermaid
flowchart TD
  A[Plex PIN auth] --> B{checkUserServerAccess}
  B -- API failure --> E[Error: cannot sign in]
  B -- hasAccess true --> C[Create/refresh session]
  B -- hasAccess false --> C
  C --> D[Route under (app)/layout]
  D --> G{ensureSubscriptionOrAccess}
  G -- admin/exempt/active/grandfathered --> APP[App features]
  G -- otherwise --> SUB[redirect /subscribe]
  SUB --> PAY[Stripe Checkout] --> WH[webhook: checkout.session.completed]
  WH --> INV[invite + auto-accept job] --> APP
```
