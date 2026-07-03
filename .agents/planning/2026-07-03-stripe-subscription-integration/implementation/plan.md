# Implementation Plan: Stripe Subscription Integration

Test-driven, incremental plan. Each step is a working, demoable increment that builds
on the previous and ends wired-in (no orphaned code). Tests are written **with** the
code in the same step (not deferred). Assumes the requirements, design, and research
docs are available as context.

> Convention reminders: Server Actions for mutations; API route only for the webhook;
> `@/` imports; strict TS; reuse `components/ui/*`; tests colocated in `__tests__/`;
> Prisma client from `@/lib/generated/prisma/client`; secrets via encrypted `Config`.
> Local toolchain may be unavailable — every step lists what to run, but verification
> may happen in CI.

## Progress Checklist

- [ ] Step 1: Schema, enum, encryption registration + grandfathering migration
- [ ] Step 2: Stripe config in Config + admin settings card + master toggle (gated on config)
- [ ] Step 3: `lib/stripe` client + offered-prices + status mapping
- [ ] Step 4: Conditional auth relaxation + access gate + `/subscribe` redirect
- [ ] Step 5: `/subscribe` page + Checkout Session (end-to-end to Stripe)
- [ ] Step 6: Webhook route (verify + dedupe + enqueue) and Stripe webhook job (status only)
- [ ] Step 7: Plex grant job wired to `checkout.session.completed` (auto-invite + accept)
- [ ] Step 8: Plex revoke job wired to cancellation/deletion (with safety guards)
- [ ] Step 9: Account status page + Billing Portal + past-due/pending Alert banners
- [ ] Step 10: Admin user-list — subscription column + filter
- [ ] Step 11: Admin user-list — actions (cancel, grant/comp, toggle exempt, Stripe link)
- [ ] Step 12: Shared primitives polish, disabled-state hardening, docs + E2E

---

## Step 1: Schema, enum, encryption registration + grandfathering migration

**Objective:** Land the data layer: `Subscription` + `StripeEvent` models,
`SubscriptionStatus` enum, `User.isExempt`/`exemptReason` (+ relation), `Config` Stripe
fields; register secrets for encryption; grandfather existing users via SQL.

**Guidance:**
- Edit `prisma/schema.prisma` per design §5. Add `Config: ['stripeSecretKey',
  'stripeWebhookSecret']` to `ENCRYPTED_FIELDS` in `lib/prisma.ts`.
- Generate migration (`npm run db:migrate -- --name add_stripe_subscriptions`), then
  hand-append to the generated `migration.sql`:
  `UPDATE "User" SET "isExempt" = true, "exemptReason" = 'grandfathered';`
  (after the ADD COLUMN statements). Run `npm run db:generate`.

**Tests:**
- Encryption round-trip test extended to cover `Config.stripeSecretKey`/
  `stripeWebhookSecret` (mirror existing encrypted-field tests in `__tests__/lib`).
- A small test asserting the migration SQL contains the grandfathering UPDATE (guard
  against regressions), or a documented manual verification if SQL-asserting is not the
  convention.
- Add `makePrismaSubscription` to `__tests__/utils/test-builders.ts`.

**Integration:** Schema + generated client are used by all later steps.

**Demo:** In `db:studio`, show the new tables/columns and that all existing users have
`isExempt = true, exemptReason = 'grandfathered'`; new inserts default to false.

---

## Step 2: Stripe config storage + admin settings card + master toggle

**Objective:** Admins can save Stripe secret key, webhook secret, and price IDs, and
flip `stripeEnabled` — with enabling **blocked until fully configured**.

**Guidance:**
- Extend `actions/admin/admin-config.ts`: `updateStripeSettings({secretKey?,
  webhookSecret?, priceIds})` and `setStripeEnabled(enabled)` (Zod-validate; when
  enabling, require secret + webhook secret + ≥1 price id; `requireAdmin()`,
  `config.upsert`, `revalidatePath`). Add a `getStripeConfig()` that returns booleans
  (`hasSecret`, `hasWebhookSecret`) not raw secrets to the client.
- Add `components/ui/switch.tsx` (reusable, extracted from watchlist toggle markup;
  `role="switch"`, `data-testid`).
- Add a Stripe card to `app/admin/settings/page.tsx` + a
  `components/admin/settings/StripeSettingsForm.tsx` (password inputs for secrets, price
  IDs input, master `Switch`; toggle disabled until configured, with a helper message).

**Tests:**
- Action tests: enable blocked when config incomplete (`{error}`); succeeds when
  complete; non-admin `rejects.toThrow()`; secrets persisted via upsert.
- Component tests: toggle disabled until configured; password fields; save calls action
  + toast; `Switch` primitive unit test.

**Integration:** Config read by `lib/stripe` (Step 3) and the auth gate (Step 4).

**Demo:** Admin enters test keys + a price id, sees the enable toggle unlock, flips it
on/off; incomplete config keeps it disabled.

---

## Step 3: `lib/stripe` client + offered prices + status mapping

**Objective:** A configured Stripe client and the helpers the UI/jobs need.

**Guidance:**
- `lib/stripe/client.ts` `getStripe()` (null if unconfigured; don't hard-pin
  `apiVersion` unless matching installed SDK).
- `lib/stripe/prices.ts` `getOfferedPrices()` (retrieve each configured price w/ product
  expand, brief cache, skip+log invalid ids).
- `lib/stripe/events.ts` `mapStripeStatus()` + version-safe period-end reader.
- Add `stripe` to `package.json` deps.

**Tests:**
- `mapStripeStatus` all Stripe statuses → enum.
- `getOfferedPrices` maps fields, skips invalid id (mock `stripe.prices.retrieve`).
- `getStripe` returns null when unconfigured.

**Integration:** Used by `/subscribe`, checkout, portal, and webhook job.

**Demo:** A temporary script/test prints offered prices from configured test price ids.

---

## Step 4: Conditional auth relaxation + access gate + `/subscribe` redirect

**Objective:** When Stripe is enabled, non-members can log in and are redirected to
`/subscribe`; when disabled, behavior is exactly as today. Members/admins/exempt/
subscribers pass.

**Guidance:**
- `lib/auth.ts`: read `stripeEnabled`; only skip the `ACCESS_DENIED` throw (no-access
  case) when enabled. Keep API-failure errors.
- `lib/guards.ts`: add `getAccessGateStatus(userId)` + `ensureSubscriptionOrAccess()`
  (rules per design FR-7; short-circuits allowed when disabled/admin/exempt/active/
  past_due). Call it in `app/(app)/layout.tsx` after onboarding guard.
- Create a minimal `/subscribe` placeholder route (outside `(app)`), to be filled in
  Step 5; ensure no redirect loop.

**Tests:**
- Auth: disabled→throws ACCESS_DENIED; enabled+no-access→no throw; API failure→error.
- Gate truth table; guard redirects only when not allowed.

**Integration:** The gate now protects all `(app)` routes.

**Demo:** With Stripe off, a non-member login is rejected (as today). With Stripe on,
the same login succeeds but lands on `/subscribe`; an admin/existing member goes
straight to the app.

---

## Step 5: `/subscribe` page + Checkout Session (end-to-end to Stripe)

**Objective:** A gated user can pick a plan and be redirected into Stripe Checkout.

**Guidance:**
- `lib/stripe/checkout.ts` `createCheckoutSession(userId, priceId)` (subscription mode,
  `client_reference_id`, `subscription_data.metadata.appUserId`,
  `allow_promotion_codes`, success/cancel URLs).
- `actions/subscription.ts` `startCheckout(priceId)` (auth required; NOT gated).
- Build `/subscribe` UI from `getOfferedPrices()` (loading via `LoadingSpinner`);
  `/subscribe/success` placeholder. If Stripe disabled → redirect home.

**Tests:**
- `createCheckoutSession` param assembly (mock stripe).
- `startCheckout` returns session URL / `{error}` when unconfigured.
- `/subscribe` renders prices, button calls action, shows loading; disabled→redirect.

**Integration:** Uses Steps 3–4. Provisioning happens via webhook (Step 6–7).

**Demo:** Click Subscribe → redirected to a real Stripe test Checkout page for the
selected price (promo-code box visible).

---

## Step 6: Webhook route + Stripe webhook job (status recording only)

**Objective:** Stripe events are verified, deduped, enqueued, and processed to keep
`Subscription` status truthful — no Plex side effects yet.

**Guidance:**
- Add job types `STRIPE_WEBHOOK` (+ `PLEX_ACCESS_GRANT`/`PLEX_ACCESS_REVOKE`
  placeholders) to `lib/queue/types.ts`; register in `lib/queue/jobs/index.ts`.
- `app/api/stripe/webhook/route.ts`: raw body verify, `StripeEvent` dedupe, enqueue
  `STRIPE_WEBHOOK` with `jobId=event.id`, 200; 400 on bad sig; rate-limited; no admin.
- `lib/queue/jobs/stripe.ts` `processStripeWebhook`: retrieve event; persist
  `StripeEvent`; upsert `Subscription` for `checkout.session.completed` (ACTIVE +
  customer/sub ids), `customer.subscription.updated` (status/period/cancelAtPeriodEnd),
  `deleted` (CANCELED), `invoice.payment_failed` (PAST_DUE). **No** Plex calls yet.

**Tests:**
- Route: valid→200+enqueue; invalid sig→400; duplicate event→200 no-op.
- Job: each event type → correct Subscription mutation (mock Prisma + `stripe.events`).
- Establish the BullMQ processor-as-plain-function test pattern.

**Integration:** Completing a Checkout now creates/updates a `Subscription` row.

**Demo:** Using Stripe CLI (`stripe trigger`/`stripe listen`) or dashboard test events,
show the DB `Subscription` row transitioning ACTIVE → past_due → canceled.

---

## Step 7: Plex grant job wired to `checkout.session.completed`

**Objective:** A completed subscription auto-invites + auto-accepts the user to Plex.

**Guidance:**
- `lib/queue/jobs/stripe.ts` `processPlexAccessGrant`: load active PlexServer + user;
  `inviteUserToPlexServer`; if `plexAuthToken` present → `acceptPlexInvite`; record
  `plexInviteStatus` (`accepted`/`pending`); on accept failure do NOT throw (pending).
- `processStripeWebhook` enqueues `PLEX_ACCESS_GRANT` on `checkout.session.completed`
  **only when `stripeEnabled`** (skip side effects when disabled — FR-29).

**Tests:**
- Grant: invite called; accept when token; pending (no throw) when missing/expired;
  status persisted. Skipped when disabled.

**Integration:** End-to-end subscribe now yields Plex access; user passes the gate.

**Demo:** Complete a test Checkout for a non-member → they receive/accept the Plex
invite and, on next load, reach the app (or see "invite pending" if no token).

---

## Step 8: Plex revoke job wired to cancellation/deletion (safety guards)

**Objective:** Period-end cancellation / final non-payment removes Plex access —
**never** touching admins, exempt users, or non-Stripe-managed members.

**Guidance:**
- `processPlexAccessRevoke`: **guards first** (skip if admin / `isExempt` / no
  `stripeSubscriptionId` / status is `PAST_DUE`); else `unshareUserFromPlexServer`;
  update status/log. Re-check state (idempotent).
- `processStripeWebhook` enqueues `PLEX_ACCESS_REVOKE` on
  `customer.subscription.deleted` (and `unpaid`) when enabled.

**Tests (highest-value — Q9 invariant):**
- Revoke NEVER unshares admin / exempt / non-managed / past_due.
- Revoke DOES unshare a canceled, managed, non-exempt user.
- Skipped entirely when disabled.

**Integration:** Full lifecycle (subscribe→access, cancel→removal-at-period-end).

**Demo:** Cancel a test subscription (period end) via Stripe → `deleted` event → the
non-exempt subscriber is unshared; repeat targeting an admin/exempt user → no removal.

---

## Step 9: Account status page + Billing Portal + banners

**Objective:** Subscribers see their status and can manage via Stripe; past-due and
pending-invite states are surfaced.

**Guidance:**
- `actions/subscription.ts` `openBillingPortal()` (`createPortalSession`).
- Account/status UI: plan, renewal/period-end (version-safe), state; "Manage
  subscription" → portal; "cancels on <date>" when `cancelAtPeriodEnd`.
- Add `components/ui/alert.tsx`; surface a past-due banner (R9) and pending-invite
  notice (R3) from `app/(app)/layout.tsx` (server-driven flags).

**Tests:**
- `openBillingPortal` returns portal URL / `{error}` when no customer.
- Status component renders each state; banner shows only when past_due; `Alert` unit
  test.

**Integration:** Self-service loop complete; re-subscribe (R8) works via `/subscribe`.

**Demo:** As an active subscriber, view status and open the Stripe portal; simulate
past_due to see the banner.

---

## Step 10: Admin user-list — subscription column + filter

**Objective:** Admins see subscription state per user and can filter by it.

**Guidance:**
- Extend `AdminUserWithWrappedStats` (`types/admin.ts`) with subscription/exempt fields.
- `getAllUsersWithWrapped`: add batched `fetchSubscriptionMap(userIds)`; attach in map.
- `user-table-row.tsx`: add Subscription column using `Badge` (+ exempt marker); bump
  empty-row `colSpan`.
- `users-filter.tsx`/`users-list.tsx`: add `subscription` filter + filtering logic.

**Tests:**
- `getAllUsersWithWrapped` attaches subscription data (mock Prisma; no N+1).
- Row renders each badge state; filter narrows correctly.

**Integration:** Admin visibility without a new page (Q5).

**Demo:** Users page shows a Subscription column and filters to only active/past-due/
canceled/none.

---

## Step 11: Admin user-list — actions (cancel, grant/comp, toggle exempt, Stripe link)

**Objective:** Admins can act on subscriptions from the row actions menu.

**Guidance:**
- `actions/admin/subscriptions.ts` (`requireAdmin()`): `adminCancelSubscription`
  (cancel_at_period_end via Stripe), `adminGrantAccess` (reuse `PLEX_ACCESS_GRANT` +
  set exempt/comp), `adminToggleExempt`.
- Action buttons in `user-actions-menu.tsx` following `UnshareUserButton` +
  `ConfirmModal` + `useToast`; conditional rendering; "View in Stripe" link when
  `stripeCustomerId`.

**Tests:**
- Each action: requireAdmin; success/error; cancel calls Stripe update; grant reuses
  grant path + sets exempt; toggle flips flag. Confirm-modal + toast in component tests.

**Integration:** Admin cancel flows into the same webhook removal path (single source
of truth); grant reuses the Step-7 job.

**Demo:** From a user row: cancel a subscription (shows "cancels on <date>"), grant a
comp (user gains access + Exempt badge), toggle exempt, and open the Stripe dashboard.

---

## Step 12: Primitives polish, disabled-state hardening, docs + E2E

**Objective:** Final consistency, safety, and documentation.

**Guidance:**
- Audit disabled-state everywhere (FR-2/FR-29): `/subscribe` hidden, gate no-op, webhook
  records-but-skips-side-effects, no subscribe CTAs.
- Finalize `Switch`/`Alert` styling + a11y; ensure `data-testid`s on new interactive
  elements.
- Docs: env/config notes (`example.env` if any Stripe-related), a `docs/stripe.md`
  covering setup (keys, webhook endpoint URL, price ids, enabling), and update
  `CLAUDE.md` integration section with a Stripe entry.
- E2E (Playwright, `data-testid` selectors): gated non-member → `/subscribe`; admin
  enables Stripe; status column visible. Stripe in test mode / stubbed; no real
  payment E2E in CI.

**Tests:** E2E specs above; any coverage gaps from prior steps.

**Integration:** Feature complete, documented, safe on/off.

**Demo:** Full walkthrough: enable Stripe in settings → non-member subscribes → gains
Plex access → sees status → cancels → removed at period end; admin sees/acts from the
user list; disabling reverts to original behavior with no side effects.

---

## Sequencing rationale
- Steps 1–3 lay data/config/client foundations.
- Step 4 delivers the visible gating behavior early (and proves the disabled=today
  invariant).
- Step 5 reaches Stripe end-to-end; Steps 6–8 build the reliable event→DB→Plex spine
  incrementally (status first, then grant, then guarded revoke).
- Steps 9–11 complete self-service and admin surfaces.
- Step 12 hardens, documents, and E2E-covers.

Each step is independently demoable and leaves the app working with the feature safely
off unless an admin enables it.
