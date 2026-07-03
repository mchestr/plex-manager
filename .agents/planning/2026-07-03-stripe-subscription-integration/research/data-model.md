# Research: Data Model, Encryption & Migration

Based on `prisma/schema.prisma`, `lib/prisma.ts`, `lib/security/crypto.ts`.

## Conventions observed
- IDs: `String @id @default(cuid())` (singletons use fixed id, e.g. `Config` = `"config"`).
- One-to-one to User: FK side holds `userId String @unique` +
  `@relation(fields:[userId], references:[id], onDelete: Cascade)`; User side
  declares `subscription Subscription?`.
- Timestamps: `createdAt DateTime @default(now())`, `updatedAt DateTime @updatedAt`.
- Indexes: `@@index([...])` on hot fields / status booleans / timestamps.
- **Enums are used** (e.g. `WatchlistSyncStatus`, `DiscordCommandStatus`) — prefer a
  Prisma enum for subscription status over a raw String.
- Booleans: `isAdmin Boolean @default(false)` + `@@index([isAdmin])`.

## Config singleton (where Stripe config goes)
Current `Config` (id `"config"`) holds feature flags + timestamps. Accessed via
`prisma.config.findUnique({ where: { id: "config" } })` / `upsert` (see
`actions/admin/admin-config.ts`, `getConfig()`).

**Add fields:**
```prisma
model Config {
  // ...existing...
  stripeSecretKey     String?
  stripeWebhookSecret String?
  stripePriceIds      String?   // JSON array of offered price IDs (or use a relation)
  stripeEnabled       Boolean   @default(false)   // master on/off toggle (R4)
}
```
`stripePriceIds` is a JSON **array of price ID strings only** (e.g.
`["price_abc","price_xyz"]`) — R5 fetches display details (amount/currency/interval/
product name) live from Stripe, so no label/interval is stored. Multiple IDs =
multiple offered options, all granting the same binary access (R7).

**`stripeEnabled` (R4)** is the master toggle. Default `false` → existing installs are
unchanged. The admin UI must **block enabling until** `stripeSecretKey`,
`stripeWebhookSecret`, and ≥1 entry in `stripePriceIds` are all present (confirmed
decision). Auth gate + `authorize` callback both branch on this flag; disabling is
safe/reversible with no side effects.

## Encryption registry (MUST update for secrets)
`lib/prisma.ts` has a hardcoded map; the extension auto-encrypts on write and
decrypts on read (AES-256-GCM, `enc:v1:` prefix, no-op if `ENCRYPTION_KEY` unset,
legacy plaintext tolerated):
```ts
const ENCRYPTED_FIELDS: Record<string, readonly string[]> = {
  User: ['plexAuthToken'],
  PlexServer: ['token'],
  // ...
  LLMProvider: ['apiKey'],
  DiscordConnection: ['accessToken', 'refreshToken'],
}
```
**Add:** `Config: ['stripeSecretKey', 'stripeWebhookSecret']`. (Do NOT encrypt
`stripePriceIds`/`stripeEnabled` — not secret, and we filter/read them plainly.)
Price IDs are not secrets. The publishable key isn't needed (redirect flows only).

## New models & fields

```prisma
enum SubscriptionStatus {
  ACTIVE
  PAST_DUE
  CANCELED
  INCOMPLETE
  UNPAID
}

model Subscription {
  id                   String             @id @default(cuid())
  userId               String             @unique
  user                 User               @relation(fields: [userId], references: [id], onDelete: Cascade)
  stripeCustomerId     String?            @unique
  stripeSubscriptionId String?            @unique
  status               SubscriptionStatus @default(INCOMPLETE)
  priceId              String?
  currentPeriodEnd     DateTime?
  cancelAtPeriodEnd    Boolean            @default(false)
  canceledAt           DateTime?
  createdAt            DateTime           @default(now())
  updatedAt            DateTime           @updatedAt

  @@index([status])
  @@index([stripeCustomerId])
}

// Processed-event log for webhook idempotency (Stripe event.id dedupe)
model StripeEvent {
  id          String   @id            // Stripe event.id (evt_...)
  type        String
  processedAt DateTime @default(now())

  @@index([type])
}
```
User additions:
```prisma
model User {
  // ...
  isExempt     Boolean       @default(false)   // grandfathered OR admin comp
  exemptReason String?                          // 'grandfathered' | 'comp' | null (R2)
  subscription Subscription?
  // ...
  @@index([isExempt])
}
```
`exemptReason` lets the deploy-time backfill tag existing members as `grandfathered`
and admin-granted comps as `comp`, so the admin UI/reporting can distinguish origin.
Gate logic keys only off the `isExempt` boolean.

## Status mapping (Stripe → our enum)
- Stripe `active` / `trialing` → `ACTIVE`
- Stripe `past_due` → `PAST_DUE` (keep access — Q10a)
- Stripe `canceled` → `CANCELED` (triggers removal at deletion event)
- Stripe `incomplete` / `incomplete_expired` → `INCOMPLETE`
- Stripe `unpaid` → `UNPAID` (remove access)

## Migration workflow
- Migrations are committed to git under `prisma/migrations/<timestamp>_<name>/migration.sql`.
- Scripts: `db:migrate` = `SKIP_SEED=true prisma migrate dev`; `db:push` for dev.
- Steps:
  1. Edit schema (Config fields, Subscription, StripeEvent, User.isExempt/relation, enum).
  2. `npm run db:migrate -- --name add_stripe_subscriptions` (generates SQL + committed folder).
  3. `npm run db:generate` (regenerate client at `@/lib/generated/prisma/client`).
  4. Add `Config` secrets to `ENCRYPTED_FIELDS` in `lib/prisma.ts`.

### Grandfathering backfill (Q9 — FINAL: SQL data migration)
The gate is pure-DB (see auth-gating.md §4). Grandfathering is done with a **SQL data
migration** that marks **all existing users** exempt:
```sql
UPDATE "User" SET "isExempt" = true, "exemptReason" = 'grandfathered';
```
(Run in the same migration that adds the `isExempt`/`exemptReason` columns, AFTER the
`ALTER TABLE ... ADD COLUMN`.)

**Why "all existing users" is correct (not too broad):** under current auth, a `User`
row is only created/updated **after** `checkUserServerAccess()` passes — non-members
are rejected with `ACCESS_DENIED` before any record is written. Therefore every
pre-existing `User` row belongs to someone who had server access, so grandfathering all
of them exactly matches "existing members." No Plex token needed at runtime; no admin
button. New users created after deploy default to `isExempt = false`.

Admins can later toggle `isExempt` per user from the user list. Removal logic never
touches exempt users.
