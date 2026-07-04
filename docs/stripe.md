# Stripe Subscriptions

This repository ships with an **optional, admin-controlled Stripe subscription**
capability. When enabled, Plex users who are **not** members of the managed
server can still authenticate but are gated to a `/subscribe` page. A successful
subscription automatically invites and admits them to the Plex server; a
cancellation (at period end) or final payment failure automatically removes them.

The entire feature is behind a master toggle (`Config.stripeEnabled`). **When
disabled — the default — the application behaves exactly as it does today:**
non-members are rejected at login and there is no subscribe flow. This makes the
feature safe to ship dark and enable per-deployment.

> Payment handling is fully offloaded to Stripe. The app never sees or stores
> card data — subscribing uses Stripe **Checkout** and managing/cancelling uses
> the Stripe **Billing Portal**, both Stripe-hosted.

## Table of Contents

- [How It Works](#how-it-works)
- [Prerequisites](#prerequisites)
- [Configuration (Admin UI)](#configuration-admin-ui)
- [Registering the Webhook](#registering-the-webhook)
- [Enabling the Feature](#enabling-the-feature)
- [Grandfathering Existing Members](#grandfathering-existing-members)
- [Subscription Lifecycle](#subscription-lifecycle)
- [Admin Management](#admin-management)
- [Disabling the Feature (Safe & Reversible)](#disabling-the-feature-safe--reversible)
- [Environment & Config Notes](#environment--config-notes)
- [Build-Time Open Items](#build-time-open-items)
- [Troubleshooting](#troubleshooting)

## How It Works

```
Plex login ─▶ member?  ──yes─▶ into app (unchanged)
                 │
                 └─no─▶ Stripe enabled?  ──no─▶ ACCESS_DENIED (today's behavior)
                          │
                          └─yes─▶ session created, gated to /subscribe
                                    │
                            Checkout (Stripe-hosted)
                                    │
                       checkout.session.completed webhook
                                    │
                            BullMQ: invite + auto-accept to Plex
                                    │
                             user is in the app
```

- **Gate:** a pure-DB check (`lib/guards.ts` → `getAccessGateStatus`) allows a
  user into the app when ANY of: Stripe disabled, the user is an admin, the user
  is exempt, or the user has an `ACTIVE`/`PAST_DUE` subscription. `PAST_DUE`
  keeps access during Stripe's dunning/retry window.
- **Webhook:** `POST /api/stripe/webhook` verifies the Stripe signature against
  the raw body, dedupes on the event id, enqueues a BullMQ job, and returns 200
  quickly. All side effects (Plex invite/removal) happen asynchronously in the
  job with retries.
- **Provisioning:** on a completed checkout the app invites the user to the
  active Plex server and auto-accepts on their behalf using their stored Plex
  token. If auto-accept can't run (missing/expired token), the invite is left
  pending and the user is shown an in-app "check your email to accept the Plex
  invite" notice. The subscription is active regardless.

## Prerequisites

1. **A Stripe account** (test mode is fine to start).
2. **At least one recurring Price** created in Stripe
   (Products → add a product → add a recurring price). Copy each Price ID
   (`price_…`). Multiple prices may be offered; all grant the same binary access.
3. **A Redis-backed BullMQ queue** running (`REDIS_URL` configured) so webhook
   jobs are processed. See the Job Queue section of `example.env`.
4. **A public webhook URL.** Stripe must be able to reach
   `https://yourdomain.com/api/stripe/webhook`. For local development use the
   Stripe CLI (`stripe listen --forward-to localhost:3000/api/stripe/webhook`).

## Configuration (Admin UI)

All Stripe settings are configured in the app — no redeploy or env vars needed.

Go to **Admin → Settings → Stripe Subscriptions** and fill in:

| Field | Where to find it | Notes |
| --- | --- | --- |
| **Secret Key** | Stripe Dashboard → Developers → API keys → *Secret key* (`sk_live_…` / `sk_test_…`) | Stored **encrypted**. Leave blank on later saves to keep the existing value. |
| **Webhook Signing Secret** | Created when you register the webhook endpoint (`whsec_…`) — see below | Stored **encrypted**. Leave blank to keep existing. |
| **Price IDs** | Stripe Dashboard → Products → your recurring price(s) (`price_…`) | One per line or comma-separated. At least one required. |
| **Subscriber Library Access** | Checkbox list of your Plex libraries | Libraries shared with subscribers when access is granted. Leave all unchecked to share every library. |

> **If a configured library is later deleted** (or recreated with a new section
> id), grants continue with the libraries that still exist and a warning is
> logged. If **none** of the configured libraries exist anymore, grant jobs fail
> (and retry) until you update the selection here — access is never silently
> widened to all libraries.

Click **Save**. Secrets are never sent back to the browser; the form only shows
whether a value is stored.

## Registering the Webhook

1. In the Stripe Dashboard, go to **Developers → Webhooks → Add endpoint**.
2. Set the **Endpoint URL** to:

   ```
   https://yourdomain.com/api/stripe/webhook
   ```

3. Select these events to send:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_failed`
4. Save, then copy the endpoint's **Signing secret** (`whsec_…`) into the
   **Webhook Signing Secret** field in the admin settings and Save.

The route (`app/api/stripe/webhook/route.ts`) is `force-dynamic`, verifies the
signature against the raw request body, and is rate-limited. It requires **no**
admin auth — the Stripe signature is the authentication. Bad signatures return
`400` (never `5xx`, so Stripe does not retry a forged request); a duplicate event
returns `200` with no re-enqueue.

## Enabling the Feature

The master **Enable Stripe subscriptions** toggle is **blocked** until Stripe is
fully configured (FR-3). It stays greyed out with a "Missing: …" hint until all
of the following are present:

- a secret key,
- a webhook signing secret, and
- at least one price ID.

Once all three are saved, flip the toggle on. From that point:

- Plex non-members can create a session and are gated to `/subscribe`.
- The `/subscribe` page lists your configured prices (fetched live from Stripe).
- Successful subscriptions provision Plex access automatically.

## Grandfathering Existing Members

Existing members are **grandfathered** so enabling the feature never removes
anyone's current access. This is done by a **SQL data migration** (run in the
same migration that adds the Stripe columns) that sets `isExempt = true` and
`exemptReason = 'grandfathered'` for **all existing users**.

This is correct because a `User` row only exists today if the user passed the
Plex server-access check at login. New users created after the migration default
to `isExempt = false` and are subject to the gate. There is no runtime backfill
and no Plex token is needed at gate time — the gate is a pure DB read.

## Subscription Lifecycle

| Stripe event | App effect | Plex effect (when enabled) |
| --- | --- | --- |
| `checkout.session.completed` | Upsert `Subscription` → `ACTIVE`; store customer/subscription/price/period-end | Enqueue **grant**: invite + auto-accept (or leave invite pending) |
| `customer.subscription.updated` | Sync status, period end, and `cancelAtPeriodEnd` | Keeps access for `cancel_at_period_end` and `past_due`; enqueues **revoke** only on mapped `UNPAID` |
| `customer.subscription.deleted` | Status → `CANCELED` (fires **at period end**) | Enqueue **revoke**: unshare from Plex |
| `invoice.payment_failed` | Status → `PAST_DUE` | None — access retained during dunning |

Status mapping (`lib/stripe/events.ts` → `mapStripeStatus`): Stripe
`active`/`trialing` → `ACTIVE`; `past_due` → `PAST_DUE`; `canceled` → `CANCELED`;
`incomplete`/`incomplete_expired` → `INCOMPLETE`; `unpaid` → `UNPAID`; anything
unknown → `INCOMPLETE` (safe default — treated as "no access").

**Cancellation is at period end** (`cancel_at_period_end`): the user keeps their
paid time and the "Cancels on `<date>`" state is shown. Plex removal is driven by
`customer.subscription.deleted`, which fires when the period actually ends.

**Removal safety invariant (FR-19):** automatic removal
(`evaluateRevokeGuard` in `lib/queue/jobs/stripe.ts`) never unshares an admin, an
exempt user, a non-Stripe-managed user, or a `PAST_DUE` subscriber. The revoke
job re-reads live DB state before acting.

**Self-service (users):**
- The account/status surface shows the current plan, state, and renewal/period-end
  date with a **Manage subscription** button that opens the Stripe Billing Portal.
- A `PAST_DUE` user keeps full access and sees a persistent global banner linking
  to the Billing Portal.
- A canceled/removed user is gated back to `/subscribe` and can re-subscribe.

## Admin Management

Subscription management is folded into the existing **Admin → Users** page (no
separate page):

- A **Subscription** column shows Active / Past due / Canceled / None plus an
  exempt marker and the renewal/end date.
- A **subscription-state filter**.
- Per-user row actions: **Cancel subscription** (cancels at period end via
  Stripe), **Grant access (comp)** (invite + auto-accept + mark exempt,
  independent of Stripe), and **Toggle exempt**.
- A per-user deep link to view the customer/subscription in the Stripe Dashboard.

## Disabling the Feature (Safe & Reversible)

Turning the master toggle **off** is safe and reversible (FR-4):

- It does **not** cancel any Stripe subscriptions.
- It does **not** remove any Plex access.
- Existing subscribers simply fall back to normal Plex-access rules.

While disabled, the webhook **still** verifies signatures and records
subscription **status**, but performs **no** Plex grant/revoke side effects
(FR-29). This keeps the app's view of Stripe accurate without touching Plex, so
re-enabling later is seamless.

Disabling is a single `Config.stripeEnabled = false` write — it makes no calls to
Stripe or Plex.

## Environment & Config Notes

Stripe credentials are **not** environment variables — they are stored (encrypted)
in the `Config` singleton and edited from the admin UI. The only related
infrastructure requirement is the job queue:

- `REDIS_URL` — required so the BullMQ worker can process webhook jobs.
- `ENABLE_QUEUE_WORKER` — must not be disabled on the instance that should process
  the jobs.

See the Job Queue section of `example.env` for details. There is intentionally no
`STRIPE_*` env variable.

## Build-Time Open Items

These were flagged during design (`design/detailed-design.md` §8.4) and should be
re-verified against the **installed** `stripe` SDK:

1. **SDK version / `apiVersion`.** `lib/stripe/client.ts` intentionally does
   **not** hard-pin `apiVersion` (target is `2026-06-24.dahlia`) because pinning a
   version string that doesn't match the installed SDK's bundled TypeScript types
   produces inaccurate types in Node. Only pin it once the installed `stripe`
   major exposes that version in its type union.
2. **Period-end field path.** `current_period_end` is API-version-sensitive: older
   versions expose it on the subscription; newer versions expose it on the
   subscription **items**. `getCurrentPeriodEnd` (`lib/stripe/events.ts`) reads
   both defensively and returns `null` (never throws) when absent — the UI then
   shows a "renews soon" style fallback. Confirm the path for your SDK version.
3. **Webhook endpoint API version.** Decide whether to set the Stripe webhook
   endpoint's API version to match the installed SDK so event payload shapes are
   predictable.

## Troubleshooting

- **Toggle won't enable / greyed out.** Stripe isn't fully configured. The card
  shows exactly what's missing (secret key, webhook secret, or a price ID).
- **`/subscribe` shows "not available right now".** No prices resolved:
  Stripe is disabled/unconfigured, no price IDs are set, or every configured
  price ID is invalid/deleted in Stripe. Invalid IDs are skipped and logged; they
  never crash the page.
- **Webhook returns 400.** Signature verification failed — the stored **Webhook
  Signing Secret** doesn't match the endpoint's secret, or the raw body was
  altered by a proxy. Re-copy the `whsec_…` value.
- **Subscribed but no Plex access.** Check the queue worker is running
  (`REDIS_URL` set, worker enabled) and that an active Plex server is configured.
  If the user's Plex token was missing/expired, the invite is left **pending** and
  the user must accept it from their email — this is expected (FR-13).
- **A user wasn't removed after cancelling.** Removal happens at **period end**
  (`customer.subscription.deleted`), not immediately. Admins, exempt users,
  non-Stripe-managed users, and `PAST_DUE` subscribers are never auto-removed by
  design.
