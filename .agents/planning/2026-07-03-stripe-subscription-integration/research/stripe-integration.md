# Research: Stripe SDK & API Patterns

Sources fetched live from Stripe docs (2026-07-03):
- Checkout quickstart — https://docs.stripe.com/checkout/quickstart
- Webhooks — https://docs.stripe.com/webhooks
- Webhook quickstart (node) — https://docs.stripe.com/webhooks/quickstart?lang=node
- Customer Portal sessions — https://docs.stripe.com/api/customer_portal/sessions/create
- Cancel subscriptions — https://docs.stripe.com/billing/subscriptions/cancel
- API versioning — https://docs.stripe.com/api/versioning

## SDK version & initialization

- Current `stripe` Node SDK major line: **`^22.x`** (samples pin `"stripe": "^22.2.0"`).
- Current Stripe API version string: **`2026-06-24.dahlia`**.
- Initialization:
  ```ts
  import Stripe from "stripe"
  const stripe = new Stripe(secretKey, { apiVersion: "2026-06-24.dahlia" })
  ```
- ⚠️ **Caveat (from docs):** overriding `apiVersion` in Node "might cause inaccurate
  TypeScript types." Recommendation for this project: **omit the explicit
  `apiVersion`** and let the installed SDK use its pinned default, OR pin to the
  exact version the installed SDK ships with. Verify at build time against the
  actually-installed SDK version (local toolchain unavailable here — see
  [[plex-manager-no-local-toolchain]]).
- ⚠️ **Version-sensitive field:** In recent API versions, `current_period_end` moved
  off the top-level Subscription object onto subscription **items**. When we persist
  the period end for "renews on <date>", confirm the exact path against the installed
  SDK/API version. Prefer reading it from the subscription item or the invoice.

## Checkout Session (subscription mode)

Server-side, create a Checkout Session in `mode: "subscription"` and redirect to
`session.url`:
```ts
const session = await stripe.checkout.sessions.create({
  mode: "subscription",
  line_items: [{ price: priceId, quantity: 1 }],
  success_url: `${appUrl}/subscribe/success?session_id={CHECKOUT_SESSION_ID}`,
  cancel_url: `${appUrl}/subscribe`,
  client_reference_id: appUserId,          // <-- our identity binding (Q10b)
  metadata: { appUserId },                  // redundancy for later events
  subscription_data: { metadata: { appUserId } }, // propagate to the Subscription
  customer_email: userPlexEmail,            // prefill; Checkout may still change it
})
// redirect the browser to session.url
```
- `client_reference_id` + `metadata.appUserId` are how the webhook maps a Stripe
  customer/subscription back to our exact `User.id` regardless of the email typed in
  Checkout (decision Q10b). `subscription_data.metadata` ensures later
  `customer.subscription.*` events also carry `appUserId`.
- Store `stripeCustomerId` from the completed session for future portal/API calls.

## Offered prices display (R5, R6, R7)

Store only price IDs (`Config.stripePriceIds`). Render `/subscribe` by fetching each
from Stripe (short-lived cache):
```ts
const price = await stripe.prices.retrieve(priceId, { expand: ["product"] })
// price.unit_amount, price.currency, price.recurring?.interval, (price.product as Stripe.Product).name
```
- Skip + log any price id that no longer resolves (deleted in Stripe).
- Multiple ids → multiple selectable options, all binary-equivalent for access (R7).
- Checkout Session: set **`allow_promotion_codes: true`** (R6) so users can enter
  Stripe promo codes; manage discounts from the Stripe dashboard.

## Billing/Customer Portal (self-service manage/cancel — Q4)

```ts
const portal = await stripe.billingPortal.sessions.create({
  customer: stripeCustomerId,
  return_url: `${appUrl}/account`,
})
// redirect to portal.url
```
Portal capabilities (configurable per Stripe dashboard "portal configuration"):
`subscription_cancel`, `payment_method_update`, `subscription_update`, invoice
history. For our "cancel at period end" decision, configure the portal's cancel flow
to cancel at period end (Stripe portal setting), so it matches the app's admin-cancel
behavior.

## Cancellation timing (Q6 — at period end)

- Cancel at period end (reversible):
  ```ts
  await stripe.subscriptions.update(subId, { cancel_at_period_end: true })
  ```
- Immediate (NOT what we want by default): `await stripe.subscriptions.cancel(subId)`.
- **Event mapping (quoted from docs):**
  - Setting `cancel_at_period_end: true` → fires **`customer.subscription.updated`**
    (still active, just flagged; use to show "cancels on <date>").
  - When the period actually ends and the sub is deleted → fires
    **`customer.subscription.deleted`** → THIS drives Plex removal.
  - Immediate cancel also fires `customer.subscription.deleted`.

## Webhook verification (App Router specifics in webhook-and-jobs.md)

- Verify with the **raw** request body:
  ```ts
  const event = stripe.webhooks.constructEvent(rawBody, sigHeader, webhookSecret)
  ```
- Docs (quoted): "Stripe requires the raw body of the request to perform signature
  verification. ... Any manipulation to the raw body ... causes verification to
  fail." In Next.js App Router, read `await req.text()` (do NOT `req.json()` first).
- Docs best practices (quoted): "Quickly return a successful status code (2xx) prior
  to any complex logic that might cause a timeout"; "process incoming events with an
  asynchronous queue." → **verify → enqueue BullMQ job → return 200 immediately.**
- Idempotency (quoted): "guard against duplicated event receipts by logging the
  event IDs you've processed"; for the rare double-emit, dedupe on
  `data.object.id` + `event.type`. → We persist processed `event.id`s
  (a `StripeEvent`/processed-events table) and skip duplicates.
- Subscribe to ONLY the events we need (docs discourage over-subscribing):
  - `checkout.session.completed` → provision access (invite + auto-accept).
  - `customer.subscription.updated` → sync status / cancel_at_period_end / past_due.
  - `customer.subscription.deleted` → revoke Plex access (enqueue removal job).
  - `invoice.payment_failed` → mark past_due (keep access during dunning — Q10a).
  - (optional) `invoice.paid` / `customer.subscription.created` for completeness.

## Events → app actions (summary table)

| Stripe event | App action |
|---|---|
| `checkout.session.completed` | Upsert Subscription (active), store customerId/subId, enqueue **invite+auto-accept** job |
| `customer.subscription.updated` | Update status/period end; if `cancel_at_period_end` show "cancels on <date>"; if `past_due` keep access + surface warning |
| `customer.subscription.deleted` | Set status canceled; enqueue **Plex removal** job (guarded: skip admins/exempt/grandfathered) |
| `invoice.payment_failed` | Set status past_due; keep access |

## Open items to verify at build time
- Exact installed `stripe` SDK version + matching `apiVersion`.
- Exact path to period-end timestamp for the installed API version.
- Whether to configure the webhook endpoint's API version to match the SDK.
