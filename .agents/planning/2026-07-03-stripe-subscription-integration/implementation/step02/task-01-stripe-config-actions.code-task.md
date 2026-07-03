# Task: Stripe config server actions with enable-guard

## Description
Provide admin server actions to save Stripe credentials/price IDs and to flip the
master `stripeEnabled` toggle, where enabling is blocked until Stripe is fully
configured.

## Background
`actions/admin/admin-config.ts` holds config actions using `requireAdmin()`,
`prisma.config.upsert({ where: { id: "config" }, ... })` with `updatedBy`, and
`revalidatePath`. Secrets are auto-encrypted by the Prisma extension (registered in
step01). The master toggle must not be enableable without a secret key, webhook secret,
and ≥1 price id (FR-3). Client components must never receive raw secret values. See
`design/detailed-design.md` §4.2/FR-1..FR-4 and `research/ui-and-testing.md` §A.

## Technical Requirements
1. Add `updateStripeSettings({ secretKey?, webhookSecret?, priceIds })` (admin-only,
   Zod-validated) that upserts the `Config` Stripe fields; store `priceIds` as a JSON
   array of price-id strings.
2. Add `setStripeEnabled(enabled: boolean)` (admin-only) that, when enabling, verifies
   secret key + webhook secret + ≥1 price id are present and returns a descriptive
   `{error}` listing what is missing otherwise.
3. Add `getStripeConfig()` returning non-secret status for the UI:
   `{ enabled, hasSecretKey, hasWebhookSecret, priceIds }` — never the raw secrets.
4. Revalidate affected paths after writes.

## Dependencies
- Step01 (Config Stripe fields + encryption registration).
- `actions/admin/admin-config.ts`, `lib/admin.ts` `requireAdmin`, `@/lib/prisma`, Zod.

## Implementation Approach
1. Follow the existing `updateWrappedSettings`/`setLLMDisabled` shape (auth, upsert,
   `updatedBy`, `revalidatePath`, `{success}|{error}` return).
2. Centralize the "is fully configured" check so both `setStripeEnabled` and later UI
   can reuse it.

## Acceptance Criteria

1. **Save settings persists (secrets encrypted)**
   - Given an admin calls `updateStripeSettings` with a secret key, webhook secret, and
     price ids
   - When it completes
   - Then the values are upserted into `Config` (secrets stored encrypted) and the
     action returns success.

2. **Enable blocked when incomplete**
   - Given Stripe config is missing any of secret key / webhook secret / ≥1 price id
   - When `setStripeEnabled(true)` is called
   - Then it returns `{error}` naming the missing pieces and does NOT set
     `stripeEnabled = true`.

3. **Enable allowed when complete**
   - Given all required config is present
   - When `setStripeEnabled(true)` is called
   - Then `stripeEnabled` becomes `true` and the action returns success.

4. **No secret leakage**
   - Given `getStripeConfig()` is called
   - When it returns
   - Then it exposes only booleans/price ids, never the raw secret key or webhook secret.

5. **Auth enforced + unit tests**
   - Given a non-admin caller
   - When any action is invoked
   - Then it rejects; and the test suite covers enable-blocked/allowed, persistence, and
     no-leakage (mocked `getServerSession`/Prisma).

## Metadata
- **Complexity**: Medium
- **Labels**: server-actions, admin, config, stripe, security
- **Required Skills**: Next.js Server Actions, Zod, Prisma, auth patterns
