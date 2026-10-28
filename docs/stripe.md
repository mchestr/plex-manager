# Stripe Subscriptions

This repository ships with an **optional, admin-controlled Stripe subscription**
capability. When enabled, Plex and Jellyfin members who are not exempt can
still authenticate but are gated to a `/subscribe` page. A successful
subscription automatically gives them access on the service they use (a Plex
share, or their Jellyfin account turned on); a cancellation (at period end) or
final payment failure automatically removes it (see
[Plex and Jellyfin Members](#plex-and-jellyfin-members)).

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
- [Exempting Existing Members](#exempting-existing-members)
- [Plex and Jellyfin Members](#plex-and-jellyfin-members)
- [Subscription Lifecycle](#subscription-lifecycle)
- [What a Lapsed Member Can Do](#what-a-lapsed-member-can-do)
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
                BullMQ: Plex invite + auto-accept, or Jellyfin account on
                                    │
                             user is in the app
```

- **Gate:** a pure-DB check (`getAccessLevel` in `lib/access.ts`) gives a user
  `full` access when ANY of: Stripe disabled, the user is an admin, the user is
  exempt, or the user has an `ACTIVE`/`PAST_DUE` subscription. `PAST_DUE` keeps
  access during Stripe's dunning/retry window. A disabled user is never
  entitled. See [What a Lapsed Member Can Do](#what-a-lapsed-member-can-do)
  for everyone else.
- **Webhook:** `POST /api/stripe/webhook` verifies the Stripe signature against
  the raw body, dedupes on the event id, enqueues a BullMQ job, and returns 200
  quickly. All side effects (Plex invite/removal) happen asynchronously in the
  job with retries. Each job re-reads the subscription from Stripe and never
  applies an older event over a newer one (see
  [Event Ordering and Recovery](#event-ordering-and-recovery)).
- **Provisioning:** on a completed checkout the app acts on each service the
  member uses. A Plex member is invited to the active Plex server and
  auto-accepted using their stored Plex token; if auto-accept can't run
  (missing/expired token), the invite is left pending and the member is shown
  an in-app "We've sent a Plex invite to your email" notice. A Jellyfin
  member's account is turned on. The subscription is active regardless.

## Prerequisites

1. **A Stripe account** (test mode is fine to start).
2. **At least one recurring Price** created in Stripe
   (Products → add a product → add a recurring price). Copy each Price ID
   (`price_…`). Multiple prices may be offered; all grant the same binary access.
3. **A Redis-backed BullMQ queue** running (`REDIS_URL` configured) so webhook
   jobs are processed. See the Job Queue section of `example.env`. Without
   `REDIS_URL` the toggle refuses to enable Stripe, and the admin "Grant access
   and exempt" action refuses too, since no job would ever run.
4. **A public webhook URL.** Stripe must be able to reach
   `https://yourdomain.com/api/stripe/webhook`. For local development use the
   Stripe CLI (`stripe listen --forward-to localhost:3000/api/stripe/webhook`).

## Configuration (Admin UI)

All Stripe settings are configured in the app — no redeploy or env vars needed.

Go to **Admin → Settings → Stripe billing** (in Integrations). The section shows
the saved settings; select **Set up** (or **Edit** once something is saved) and
fill in:

| Field | Where to find it | Notes |
| --- | --- | --- |
| **Secret key** | Stripe Dashboard → Developers → API keys → *Secret key* (`sk_live_…` / `sk_test_…`) | Stored **encrypted**. Leave blank on later saves to keep the existing value. |
| **Webhook signing secret** | Created when you register the webhook endpoint (`whsec_…`) — see below | Stored **encrypted**. Leave blank to keep existing. |
| **Price IDs** | Stripe Dashboard → Products → your recurring price(s) (`price_…`) | One per line or comma-separated. At least one required. |
| **Subscriber library access** | Checkbox list of your Plex libraries | Libraries shared with subscribers when access is granted. Leave all unchecked to share every library. |

> **If a configured library is later deleted** (or recreated with a new section
> id), grants continue with the libraries that still exist and a warning is
> logged. If **none** of the configured libraries exist anymore, grant jobs fail
> (and retry) until you update the selection here — access is never silently
> widened to all libraries.

Click **Save changes**; the section closes back to its summary. **Cancel** (or
Escape) leaves without saving, and asks first when something was changed.
Secrets are never sent back to the browser: the summary shows only that a key
is saved and its last four characters, and a key the current encryption key
can't read offers **Enter it again**.

## Registering the Webhook

1. In the Stripe Dashboard, go to **Developers → Webhooks → Add endpoint**.
2. Set the **Endpoint URL** to:

   ```
   https://yourdomain.com/api/stripe/webhook
   ```

3. Select these events to send:
   - `checkout.session.completed`
   - `checkout.session.async_payment_succeeded`
   - `checkout.session.async_payment_failed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_failed`
4. Save, then copy the endpoint's **Signing secret** (`whsec_…`) into the
   **Webhook signing secret** field (Stripe billing, **Edit**) in the admin
   settings and select **Save changes**.

The route (`app/api/stripe/webhook/route.ts`) is `force-dynamic` and verifies the
signature against the raw request body. It requires **no** admin auth — the
Stripe signature is the authentication. It has no IP rate limit, because anyone
who spoofs Stripe's addresses could otherwise get genuine deliveries rejected.
Bodies over 1 MiB are refused with `413` before the signature check, so an
unsigned request cannot make the app buffer an unbounded body. Bad signatures return
`400` (never `5xx` for a bad signature, so Stripe does not retry a forged
request). While the job queue is unavailable (Redis down) the route answers
`503` within about two seconds, so Stripe retries the delivery later. An event
that was already processed returns `200` with no re-enqueue. A resend of an event that
was never processed recovers it (see
[Event Ordering and Recovery](#event-ordering-and-recovery)).

## Enabling the Feature

The master **Subscriptions** switch at the top of the Stripe billing section is
**blocked** until Stripe is fully configured (FR-3). It stays greyed out, with a
"You cannot turn on subscriptions yet." alert naming what is missing, until all
of the following are present:

- a secret key,
- a webhook signing secret,
- at least one price ID, and
- the job queue (`REDIS_URL` set on the server).

Once all four are in place, flip the switch on. It takes effect at once, without
Edit or Save changes. If any members sign in with
Jellyfin only and are not exempt, the toggle first asks you to confirm, naming
them ("Ask 3 Jellyfin members to subscribe?"). These accounts were
usually made in Jellyfin itself rather than through an app invite, so they have
no exemption: cancel, mark the ones who should keep free access exempt on
**Admin → Users**, then turn it on. From that point:

- Plex non-members can create a session and are gated to `/subscribe`, and so
  are Jellyfin members who are not exempt.
- The `/subscribe` page lists your configured prices (fetched live from Stripe)
  as plan cards: the product's name, the price, and up to three benefit lines
  from the product's **Marketing features** (Products → your product → Marketing
  feature list). One plan gets the primary button: the price whose metadata has
  `recommended` = `true`, else the first configured price.
- After Checkout, `/subscribe/success` ("You're in") polls a live checklist
  every 3 seconds for up to 2 minutes: Payment confirmed, then one line per
  service: the Plex share or "We've sent a Plex invite to your email", and
  "Your Jellyfin account is enabled". A member with both sees both.
- Successful subscriptions provision access automatically.

## Exempting Existing Members

Existing members are marked **exempt** so enabling the feature never removes
anyone's current access. This is done by a **SQL data migration** (run in the
same migration that adds the Stripe columns) that sets `isExempt = true` for
**all existing users**. The migration that later renamed `exemptReason` to
`exemptNote` cleared the marker that data step wrote; those members stay exempt.

This is correct because a `User` row only exists today if the user passed the
Plex server-access check at login. New users created after the migration default
to `isExempt = false` and are subject to the gate. There is no runtime backfill
and no Plex token is needed at gate time — the gate is a pure DB read.

**Invite codes are exempt membership.** Redeeming an admin-created invite code
(Plex or Jellyfin) marks the user `isExempt = true` with
and the note `Joined by invite` — the same semantics as the admin "Grant access
and exempt" action, since the invite already grants server access outside of Stripe. An
invited user therefore never lands on `/subscribe`. An existing exemption
and its note are never overwritten. Admins can revoke the
exemption per-user from the admin users page if an invited user should later be
subject to the gate.

## Plex and Jellyfin Members

Grant and revoke follow the services a member has an account on
(`memberServices` in `lib/members/service.ts`: a `plexUserId`, a
`jellyfinUserId`, or both), through `grantServiceAccess` and
`revokeServiceAccess` in `lib/members/access-actions.ts`:

| Service | Grant (checkout, resubscribe, admin grant) | Revoke (period end, unpaid) |
| --- | --- | --- |
| Plex | Invite the member's Plex email to the subscriber libraries and auto-accept; an existing share counts as accepted | Remove the member's share of the active server |
| Jellyfin | Turn the account on (`IsDisabled: false`), keeping every other policy field | Turn the account off (`IsDisabled: true`); the account and its history stay |

- A member with both services gets both. Jellyfin goes first, because turning
  an account on is safe to repeat, so a retry after a Plex failure never
  invites twice.
- The Plex invite goes only to the email of a member with a `plexUserId`, which
  came from plex.tv. A Jellyfin username is never used as an address.
- A member with no usable identity (no linked service, or a Plex account with
  no email) is skipped with the code `NO_MEMBER_SERVICE`, stored in
  `Subscription.accessSkipCode` and logged. The job succeeds, so it is not
  retried.
- What each run did is stored on the subscription: `plexInviteStatus`
  (`accepted`, `pending`, `revoked`) and `jellyfinAccessStatus` (`enabled`,
  `disabled`, or `skipped` when Jellyfin no longer has the account). The
  Billing tab of a member's admin page shows both.
- **A Jellyfin administrator is never disabled.** Before the revoke changes
  anything it asks Jellyfin whether the member administers the server; an
  administrator, or a check that cannot answer, skips the whole revoke with a
  logged reason.
- The job names stay `PLEX_ACCESS_GRANT` and `PLEX_ACCESS_REVOKE`, so jobs
  queued before this change still run; the processors are `processAccessGrant`
  and `processAccessRevoke`.

## Subscription Lifecycle

Every handler re-reads the subscription from Stripe and writes its **live**
status, period end and `cancelAtPeriodEnd`; the event's own payload is a
snapshot from when it was created and is used only for its ids and time.

| Stripe event | App effect | Access effect (when enabled) |
| --- | --- | --- |
| `checkout.session.completed`, `checkout.session.async_payment_succeeded` | Create or update the member's `Subscription` from the live subscription; store customer/subscription/price/period-end | Enqueue **grant** when the row moves into `ACTIVE` |
| `checkout.session.async_payment_failed` | None (logged) | None |
| `customer.subscription.updated` | Sync the live status, period end, and `cancelAtPeriodEnd` | Keeps access for `cancel_at_period_end` and `past_due`; enqueues **grant** on a move into `ACTIVE` from `UNPAID`, `CANCELED` or `INCOMPLETE`, and **revoke** on `UNPAID` or `CANCELED` |
| `customer.subscription.deleted` | Status → `CANCELED` (fires **at period end**) | Enqueue **revoke**: unshare from Plex, turn the Jellyfin account off |
| `invoice.payment_failed` | Sync the live status: `PAST_DUE` during dunning | None while `PAST_DUE` — access retained during dunning |

A checkout is ignored, with no row and no grant, unless it is a subscription
checkout whose `payment_status` is `paid` or `no_payment_required`, whose
subscription's `metadata.appUserId` equals the session's `client_reference_id`
(the app sets both, so Payment Links and other integrations never match), and
whose price is one of the configured price IDs.

A member whose subscription is `ACTIVE` or `PAST_DUE` cannot start a second
checkout (`ALREADY_SUBSCRIBED`), and `/subscribe` shows them no plans but
"You already have access", with Manage billing (to `/membership`). A
returning member checks out as their existing Stripe customer.

Status mapping (`lib/stripe/events.ts` → `mapStripeStatus`): Stripe
`active`/`trialing` → `ACTIVE`; `past_due` → `PAST_DUE`; `canceled` → `CANCELED`;
`incomplete`/`incomplete_expired` → `INCOMPLETE`; `unpaid` → `UNPAID`; anything
unknown → `INCOMPLETE` (safe default — treated as "no access").

**Cancellation is at period end** (`cancel_at_period_end`): the user keeps their
paid time and the "Cancels on `<date>`" state is shown. Removal is driven by
`customer.subscription.deleted`, which fires when the period actually ends.

**Removal safety invariant (FR-19):** automatic removal
(`evaluateRevokeGuard` in `lib/queue/jobs/stripe.ts`) never unshares or
disables an admin, a Jellyfin administrator (or a member whose Jellyfin admin
check cannot answer), an exempt user, a non-Stripe-managed user, or a
`PAST_DUE` subscriber. The revoke
job re-reads live DB state before acting, requires the stored status to be
`CANCELED` or `UNPAID`, and asks Stripe: unless the live status is `canceled`,
`unpaid` or `incomplete_expired`, it skips with "subscription is active again".
The removal deletes only the member's share of the configured server (their
plex.tv friendship and other servers stay). A share that is already gone counts
as success, so a retried or rerun revoke settles without ending the member's
sessions twice. If plex.tv rejects the owner's token, the job fails at once
without retries; reconnect Plex in settings, then retry the job.
The grant job re-checks too: it does nothing unless the user has full access
and is exempt (admin grants) or holds an `ACTIVE` subscription, confirmed with
Stripe, and it records `accepted` without a new invite when the user already
has access to the server.

### Event Ordering and Recovery

Stripe sends events in no fixed order and may send one more than once.

- **Newer state only.** `Subscription.stripeEventAt` holds the creation time of
  the newest event applied to the row. An older event is skipped (logged as
  `stripe.stale_event`) and has no Plex effect, so a late
  `customer.subscription.updated` can never revive a canceled subscription.
- **Processed after success.** Each event gets a `StripeEvent` row when its job
  starts (`receivedAt`, `attempts`), and `processedAt` is set only after its
  handler succeeded. A failed attempt stores an error code in `lastError` and
  the job retries; after the last attempt the failure is logged as
  `stripe.event_failed` and audited as `STRIPE_EVENT_FAILED`.
- **Resend to recover.** For an event whose `processedAt` is empty, use
  **Resend** on the event in the Stripe Dashboard (Developers → Events): the
  webhook retries its failed job, leaves a job that is still queued or running
  alone, and enqueues it again when the job record has expired (after 7 days).
  An event that was processed is never run twice.

**Self-service (users):**
- The account/status surface shows the current plan, state, and renewal/period-end
  date with a **Manage subscription** button that opens the Stripe Billing Portal.
- A `PAST_DUE` user keeps full access and sees a persistent global banner linking
  to the Billing Portal.
- A canceled/removed user is gated back to `/subscribe` and can re-subscribe.

## What a Lapsed Member Can Do

With Stripe on, a user who is not entitled is **lapsed** when they have at
least one completed Rewind, and has **no access** otherwise (`getAccessLevel`
in `lib/access.ts`). A lapsed member keeps read-only access to their stored
Rewinds (FR-51). Each surface checks this itself, not only the `(app)` layout:
Server Actions through `memberAction({ entitlement })`, route handlers through
`requireEntitlement` (`lib/actions/route.ts`), pages through `proxy.ts` (on
every request, client-side navigations included) and the jobs in their queries.

| Surface | Active member | Lapsed member | No access |
| --- | --- | --- | --- |
| Rewind pages (`/rewind`, `/rewind/*`; old `/wrapped*` links redirect there) | Yes | Read their stored Rewinds | Sent to `/subscribe` |
| Home and every other app page | Yes | Sent to `/subscribe` | Sent to `/subscribe` |
| Poster images on their own Rewind | Yes | Yes | 403, unless a share link covers the poster |
| Generate a Rewind | Yes | `NOT_ENTITLED` | `NOT_ENTITLED` |
| Watchlist sync: turn on, sync now | Yes | `NOT_ENTITLED` | `NOT_ENTITLED` |
| Watchlist sync: settings and history | Yes | Yes | `NOT_ENTITLED` |
| Watchlist sync: turn off | Yes | Yes | Yes |
| Scheduled and queued watchlist syncs | Yes | Skipped (`NOT_ENTITLED`) | Skipped (`NOT_ENTITLED`) |
| Link Discord, resync the Discord role | Yes | Sent to `/subscribe`, `NOT_ENTITLED` | Sent to `/subscribe`, `NOT_ENTITLED` |
| Unlink Discord | Yes | Yes | Yes |
| Discord bot commands | Yes | No | No |
| Manage subscription, `/subscribe` | Yes | Yes | Yes |

Admins and exempt users are always active members. With Stripe off every
enabled user is an active member.

## Admin Management

Subscription management is folded into the existing **Admin → Users** page (no
separate page):

- A **Subscription** column shows Active / Past due / Canceled / None plus an
  exempt marker and the renewal/end date.
- A **subscription-state filter**.
- Per-user row actions: **Cancel subscription** (cancels at period end via
  Stripe; the dialog names the services whose access goes then), **Grant
  access and exempt** (Plex invite and auto-accept, or the Jellyfin account turned
  on, plus mark exempt, independent of Stripe; the dialog says "They will get
  access to {services}"), and **Mark exempt** / **Remove exemption**.
- A per-user deep link to view the customer/subscription in the Stripe Dashboard.

## Disabling the Feature (Safe & Reversible)

Turning the master toggle **off** is safe and reversible (FR-4):

- It does **not** cancel any Stripe subscriptions.
- It does **not** remove any Plex access or disable any Jellyfin account.
- Existing subscribers simply fall back to normal Plex-access rules.

While disabled, the webhook **still** verifies signatures and records
subscription **status**, but performs **no** Plex or Jellyfin grant/revoke side
effects (FR-29). This keeps the app's view of Stripe accurate without touching
Plex or Jellyfin, so re-enabling later is seamless.

Disabling is a single `Config.stripeEnabled = false` write — it makes no calls to
Stripe, Plex or Jellyfin.

## Environment & Config Notes

Stripe credentials are **not** environment variables — they are stored (encrypted)
in the `Config` singleton and edited from the admin UI. The only related
infrastructure requirement is the job queue:

- `REDIS_URL` — required so the BullMQ worker can process webhook jobs. Stripe
  cannot be enabled without it.
- `ENABLE_QUEUE_WORKER` — must not be disabled on the instance that should process
  the jobs.

See the Job Queue section of `example.env` for details. There is intentionally no
`STRIPE_*` env variable.

## Build-Time Open Items

These were flagged during design and should be
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
  shows exactly what's missing (secret key, webhook secret, a price ID, or the
  job queue).
- **`/subscribe` shows "Subscriptions aren't open right now".** No prices resolved:
  Stripe is disabled/unconfigured, no price IDs are set, or every configured
  price ID is invalid/deleted in Stripe. Invalid IDs are skipped and logged; they
  never crash the page.
- **Webhook returns 400.** Signature verification failed — the stored **Webhook
  Signing Secret** doesn't match the endpoint's secret, or the raw body was
  altered by a proxy. Re-copy the `whsec_…` value.
- **Subscribed but no Plex access.** Check the queue worker is running
  (`REDIS_URL` set, worker enabled) and that an active Plex server is configured.
  If the event failed (`StripeEvent.lastError` is set, `processedAt` empty), fix
  the cause and resend the event from the Stripe Dashboard.
  If the user's Plex token was missing/expired, the invite is left **pending** and
  the user must accept it from their email — this is expected (FR-13).
- **A user wasn't removed after cancelling.** Removal happens at **period end**
  (`customer.subscription.deleted`), not immediately. Admins, Jellyfin
  administrators, exempt users, non-Stripe-managed users, and `PAST_DUE`
  subscribers are never auto-removed by design.
- **Subscribed but nothing happened, `accessSkipCode` is `NO_MEMBER_SERVICE`.**
  The member has no Plex or Jellyfin account the app knows, or a Plex account
  with no email. Have them sign in again with their media server account, then
  grant access from the admin page.
