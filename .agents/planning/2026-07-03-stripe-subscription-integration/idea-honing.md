# Idea Honing: Stripe Subscription Integration

Requirements clarification for the Stripe subscription integration. Questions are
asked one at a time; each answer is recorded below before moving on.

> **Key codebase finding (grounding):** Today `lib/auth.ts` rejects login for any
> Plex user lacking managed-server access (`checkUserServerAccess()` → throws
> `ACCESS_DENIED`). Plex membership operations already exist in
> `lib/connections/plex-invitations.ts`: `inviteUserToPlexServer()`,
> `acceptPlexInvite()`, `unshareUserFromPlexServer()`. A BullMQ job queue and a
> `Config` singleton with at-rest field encryption both exist and are the
> established patterns for background work and secret storage.

---

## Q1: What should happen when a subscription becomes active — does the app automatically grant Plex access?

Your request is explicit that a *cancellation* webhook removes the user from the
Plex server. The activation side is implied but not stated. When a user completes
a Stripe subscription, which of these should happen?

**Answer:** **Auto-invite + auto-accept.** On the successful-subscription webhook, the
app automatically calls `inviteUserToPlexServer()` with the user's Plex email AND
uses the user's stored `plexAuthToken` to call `acceptPlexInvite()`, so access is
granted with zero user action. This is symmetric with the auto-removal on cancel.

- **Dependency/risk noted:** relies on a valid stored `plexAuthToken` for the user.
  Need a fallback if the token is missing/expired (e.g. leave invite pending and
  surface "check your email / re-authenticate" to the user). To be handled in error
  handling / edge-case questions later.

---

## Q2: What is the subscription/pricing model on the Stripe side?

This determines how we configure Stripe and what the "Subscribe" button does.

**Answer:** **Admin-configurable prices.** The admin configures which Stripe Price
ID(s) to offer from the app's settings, rather than hard-coding a plan. The app
stores these in the `Config` singleton (consistent with existing credential/config
pattern). The Subscribe UI renders the offered price(s); if more than one is
configured, the user picks. Entitlement is binary for now (subscribed = Plex access);
tier→library mapping is out of scope unless raised later.

---

## Q3: Where in the flow does a non-member land, and how is access gated in the UI?

Today a non-member can't even log in (`ACCESS_DENIED`). We're changing that. Once a
Plex-authenticated non-subscriber is allowed in, what should they experience?

**Answer:** **Locked to subscribe page.** A Plex-authenticated user who is not a
server member and not subscribed can log in, but is redirected to a dedicated
`/subscribe` page and cannot access any app features until subscribed. This mirrors
the existing onboarding-redirect gating pattern in `app/(app)/page.tsx`. Only after
an active subscription (and the resulting Plex access) do they reach the normal app.

- **Implication:** the auth `ACCESS_DENIED` throw must be relaxed to allow the
  session to be created, with authorization enforced at the routing/layout layer
  (redirect to `/subscribe`) rather than at sign-in. Existing members and admins are
  unaffected. Need to be careful this doesn't accidentally expose member features.

---

## Q4: How should a subscriber view/manage their subscription?

Your request says users should see their current subscription. Stripe provides a
hosted Billing Portal for managing/cancelling.

**Answer:** **Show status + Stripe Billing Portal.** The app natively displays the
current subscription status (plan, renewal/period-end date, state such as
active/past_due/canceled) and provides a "Manage subscription" button that creates a
Stripe Billing Portal session and redirects there for cancel / update-payment /
invoices. This offloads sensitive billing UI to Stripe and minimizes code/PCI scope.
Requires storing the `stripeCustomerId` to open the portal.

---

## Q5: Admin view — how should subscription info appear, and what admin actions are needed?

Your request prefers folding this into the existing user-list page rather than
adding admin pages.

**Answer:** All four capabilities, folded into the existing
`app/admin/users` page (no new admin page):

1. **Subscription status column** — show state (Active / Past due / Canceled / None)
   plus renewal/period-end date. Extends `getAllUsersWithWrapped()` +
   `user-table-row.tsx`.
2. **Filter by subscription** — new filter alongside existing access/role filters
   (subscribed / unsubscribed / past-due), in `users-list.tsx`.
3. **Link to Stripe** — per-user deep link to the customer/subscription in the Stripe
   Dashboard for deeper management (avoids building billing controls in-app).
4. **Admin cancel action** — "Cancel subscription" in `user-actions-menu.tsx` that
   cancels the Stripe subscription via API; Plex removal then happens through the
   normal cancellation webhook path (single source of truth for removal).

---

## Q6: Timing of Plex removal on cancellation — immediate or at period end?

Stripe distinguishes "cancel at period end" (user keeps access until paid period
ends) from immediate cancellation. This affects which webhook drives removal.

**Answer:** **At period end.** The user keeps Plex access through the period they
already paid for. Cancellation is done as `cancel_at_period_end` in Stripe; actual
Plex removal is driven by the `customer.subscription.deleted` webhook that Stripe
fires when the period ends. Admin "cancel" action also uses cancel-at-period-end for
consistency. In the meantime the app can display "cancels on <date>". Payment-failure
handling (past_due/dunning) is treated separately in edge cases — default is to keep
access until Stripe transitions the subscription to canceled/unpaid.

---

## Q7: Stripe API keys/config — storage location and setup surface?

Grounding shows two patterns: env vars, or the encrypted `Config` singleton edited
via the setup wizard / admin settings. Stripe needs a secret API key, a webhook
signing secret, and the offered Price ID(s).

**Answer:** **DB `Config` singleton + admin UI.** Store the Stripe secret API key,
webhook signing secret, and offered Price ID(s) in the encrypted `Config` model
(secrets auto-encrypted at rest via the Prisma extension, like LLM provider keys),
edited through an admin settings / setup-wizard step. Admin can change config without
a redeploy. A publishable key isn't strictly needed if we use hosted Checkout +
Billing Portal (redirect flows). Feature is effectively "off" until configured.

---

## Q8: Scope/priority — is everything one deliverable, or is there a phased priority?

This is a sizeable feature (auth changes, Checkout, webhooks, billing portal, admin
UI). Understanding priority helps sequence the implementation plan.

**Answer:** **Full feature, phased.** Build the whole thing, but sequence so a working
end-to-end core lands first (config → subscribe → Checkout → webhook grants access →
status page), then layer on admin user-list integration, admin cancel action, and
polish. Matches the PDD "demoable increments" approach.

---

## Q9: Edge cases & failure handling — confirm default handling of the trickier paths.

A few edge cases materially affect the design. Confirm the default treatment (we can
refine any of these).

### Q9a: Existing members (grandfathering)

**Answer:** **Admin-managed exemptions.** Existing Plex members (and admins) are
grandfathered — they keep access without a subscription. Additionally, admins get a
per-user "comp / exempt from subscription" flag to grant free access to specific
people going forward.

- **Design implications:**
  - Auto-removal on cancellation applies **only** to users whose access is
    Stripe-managed (i.e., they have a `Subscription` record and are not exempt).
    Removal logic MUST never unshare an exempt user, an admin, or a grandfathered
    member who has no Stripe subscription.
  - Need an `isExempt` (comp) boolean on `User` (or subscription-adjacent), toggleable
    from the admin user-list actions menu.
  - "Grandfathered" = has Plex access now but no Stripe subscription. Practically, the
    gate only redirects users who have **neither** Plex access **nor** an active
    subscription **nor** exemption. So existing members simply never hit the gate.
  - The subscribe-page gate (Q3) therefore triggers only for: authenticated Plex user
    who is NOT a current server member, NOT exempt, and has NO active subscription.

---

## Q10: Remaining edge cases — confirm default handling.

**Q10a — Past-due / dunning:** **Keep access during dunning.** While Stripe status is
`past_due`, leave Plex access intact; only remove when Stripe finally marks the
subscription `canceled`/`unpaid`. Consistent with the "at period end" philosophy;
relies on Stripe's configured retry/dunning settings. The app surfaces "payment
failed — update your card" via the status page during this window.

**Q10b — Identity linking:** **Bind via `client_reference_id` + metadata.** Pass the
app `userId` into the Checkout Session as `client_reference_id` and store it in the
subscription/customer `metadata`, so webhooks map the Stripe customer back to the
exact app user regardless of the email typed into Stripe. Do not rely on email
matching. Store `stripeCustomerId` on first successful session for portal + future
events.

**Q10c — Auto-accept fallback:** **Leave invite pending + notify.** If auto-accept
can't run (missing/expired stored `plexAuthToken`), still send the Plex invite via
`inviteUserToPlexServer()`, mark the invite pending, and tell the user to "check your
email to accept the Plex invite." Subscription is active regardless of accept status;
the status page reflects "invite pending / accepted."

---

## Requirements Clarification — Complete

All 10 questions answered. Consolidated decisions:

1. **On subscribe:** auto-invite + auto-accept (via stored Plex token), symmetric with removal.
2. **Pricing:** admin-configurable Stripe Price ID(s); binary entitlement (subscribed = access).
3. **Non-sub gating:** logged-in non-members locked to `/subscribe` until active.
4. **Self-service:** native status display + Stripe Billing Portal for manage/cancel.
5. **Admin (folded into user-list):** status column, subscription filter, Stripe deep link, admin cancel action.
6. **Removal timing:** at period end (`cancel_at_period_end` → `customer.subscription.deleted`).
7. **Config:** encrypted `Config` singleton + admin UI (secret key, webhook secret, price IDs).
8. **Scope:** full feature, phased (core end-to-end first, then admin/polish).
9. **Existing members:** grandfathered + admin-managed per-user `comp/exempt` flag; removal only ever touches Stripe-managed, non-exempt users.
10. **Edge cases:** keep access during dunning; bind identity via `client_reference_id`/metadata; auto-accept failure → leave invite pending + notify.

---

## Refinements (post-research)

Research surfaced three points to refine. Decisions:

**R1 — Grandfathering mechanism (refines Q9):** **Backfill existing members as
exempt.** At deploy, a one-off admin action calls the Plex API once, finds all
current server members, and sets an exempt flag on their DB users. The runtime gate
stays **pure-DB** (fast, no per-request Plex call, no coupling to Plex availability).
Admins can toggle exemption per user afterward. This is the concrete implementation of
the "grandfathered + admin-managed exemptions" decision.

**R2 — Exempt model (refines Q9 / R1):** **Single `isExempt` boolean + `exemptReason`
field** (`'grandfathered' | 'comp' | null`). Gate logic keys off the boolean; the
reason lets the backfill tag existing members as `grandfathered` and admin comps as
`comp`, so the admin UI can distinguish origin and reporting stays meaningful. No
separate booleans.

**R3 — Pending-invite notification (refines Q10c):** **In-app status only.** The
subscribe-success / account page shows "Subscription active — check your email to
accept the Plex invite" and reflects invite status (pending / accepted). No new
email/Discord infrastructure. Plex already emails its own invite; Stripe emails
receipts. If richer notification is wanted later, Discord DM (for linked users) is the
natural next step, but it's out of scope for v1.

**R4 — Master enable/disable toggle (NEW requirement):** Admins get a single toggle
(`Config.stripeEnabled`) that turns the whole Stripe integration on or off.

- **When DISABLED (default):** the app behaves **exactly as it does today** — the
  `lib/auth.ts` `checkUserServerAccess()` gate still throws `ACCESS_DENIED` for
  non-members, there is no `/subscribe` option, no subscribe CTA, and the
  subscription guard is a no-op. The relaxed-login change from Q3/§auth-gating is
  **conditional on this flag being on.** Existing unauthorized-user flow is untouched.
- **When ENABLED:** the relaxed login applies (non-members can sign in), the
  `/subscribe` gate activates, Checkout/portal/webhooks are live, and admins can offer
  subscriptions.
- **Implications:**
  - The auth `authorize` callback must read `stripeEnabled` before deciding whether to
    throw `ACCESS_DENIED` (disabled → throw as today; enabled → allow + gate later).
  - The `ensureSubscriptionOrAccess()` guard short-circuits to "allowed" when
    `stripeEnabled === false` (so nothing changes for existing installs).
  - **Toggling OFF (confirmed — safe/reversible, no side effects):** existing
    subscribers simply stop being gated and fall back to normal Plex-access rules. We
    do **NOT** auto-cancel Stripe subscriptions and do **NOT** remove users from Plex
    on disable. Re-enabling resumes everything. Admins can still cancel individual
    subs via Stripe if they choose.
  - **Webhook while disabled:** to honor the "no surprise Plex changes" spirit of the
    above, the design default is that the webhook keeps **verifying + recording
    subscription status** (so the DB stays truthful for a future re-enable) but
    **skips Plex invite/removal side effects** while `stripeEnabled === false`.
    (Recorded as the design default; noted in the edge-case section.)
  - **Enabling (confirmed — block until configured):** the toggle cannot be turned on
    until a valid secret key, webhook secret, AND ≥1 price ID are saved. The admin UI
    greys/disables the enable control and explains what's missing, preventing a broken
    "enabled but non-functional" state.

---

## Requirements — Final (post-refinement)

All original questions (Q1–Q10) plus refinements (R1–R4) are resolved. Net changes
from the base set:
- **Grandfathering** is implemented via an **exempt backfill** at deploy; runtime gate
  is pure-DB. `isExempt` boolean + `exemptReason` (`grandfathered|comp|null`).
- **Pending-invite** surfaced **in-app only**.
- **Master `stripeEnabled` toggle** gates the entire feature; **OFF = today's exact
  behavior** (ACCESS_DENIED for non-members, no subscribe). OFF is safe/reversible
  with no side effects; ON requires complete Stripe config.

Ready for the design phase.

---

## Refinements Round 2 (pricing display + access edge cases)

**R5 — Pricing display:** **Fetch details from Stripe.** Store only the offered price
IDs in `Config.stripePriceIds`; the `/subscribe` page fetches each Price/Product from
the Stripe API to render amount, currency, interval, and product name (with
short-lived caching to avoid per-request calls). This keeps displayed pricing always
accurate to Stripe. Implication: a server-side helper (e.g. `getOfferedPrices()`) that
calls `stripe.prices.retrieve(id, { expand: ['product'] })` for each configured id and
caches the result; handle a price id that no longer exists gracefully (skip + log).

**R6 — Promotion codes:** **Enabled.** Set `allow_promotion_codes: true` on the
Checkout Session so users can enter Stripe promo codes; discounts are managed from the
Stripe dashboard. No extra app schema.

**R7 — Multiple prices, one entitlement:** The app may offer **several prices at once**
(e.g. monthly + yearly), all granting the **same binary access**. `/subscribe` shows
them as selectable options; the user picks one at Checkout. No tier→library mapping
(differentiated access remains out of scope).

**R8 — Post-cancel re-subscribe:** A canceled/removed user (Stripe enabled) is treated
like any non-member → gated to `/subscribe`, where they can **subscribe again** (new
Checkout, re-invite + auto-accept). No special block. Their existing (canceled)
`Subscription` row is reused/updated rather than blocking a new checkout; ensure a new
Checkout Session can be created for a user whose prior sub is canceled.

**R9 — Past-due UX:** Past-due users **keep full access** (per Q10a) and see a
**persistent global banner** "Payment failed — update your payment method" linking to
the Stripe Billing Portal. Banner shows only while `status === PAST_DUE`. (Design:
a small server-driven flag surfaced in the `(app)` layout/header.)

**R10 — Admin manual grant:** Admins can **manually grant access** from the user list:
an action that **invites the user to Plex** (`inviteUserToPlexServer`, + auto-accept if
token available) **and marks them exempt** (`isExempt = true`, `exemptReason = 'comp'`)
in one step, independent of Stripe. Complements the existing unshare action for full
manual control. Reuses the grant job/flow built for subscriptions.

### Knock-on effects reconciled
- **Data model:** `stripePriceIds` stays a simple JSON array of **price IDs only**
  (no admin label/interval needed, since we fetch from Stripe — R5). Add a cached
  price-details helper; no new persistent table for prices.
- **Admin UI (user list):** now gains **two** actions beyond view — "Cancel
  subscription" (existing decision) and **"Grant access (comp)"** (R10), plus the
  **exempt toggle** and status column/filter/Stripe link.
- **Grant job:** used by BOTH the subscription `checkout.session.completed` path and
  the admin manual-grant action (R10) — build once.
- **Global banner:** past-due banner (R9) is a new small piece of the authenticated
  layout; pairs with the pending-invite in-app notice (R3) as layout-level status.

**Also carried into design (from research, no decision needed — noting for the record):**
- Stripe SDK `^22.x`, API version `2026-06-24.dahlia`; avoid hard-pinning `apiVersion`
  in Node unless it matches the installed SDK (TS-type caveat). Verify at build time.
- `current_period_end` location is API-version-sensitive (may live on subscription
  items) — confirm exact path when persisting renewal date.
- Webhook processing: verify raw body (`await request.text()`) → persist `event.id`
  for idempotency → enqueue → return 200; re-fetch event by id inside the job.
- Removal guards are the critical safety invariant: never unshare admins, exempt
  users, or non-Stripe-managed members; `past_due` keeps access.

