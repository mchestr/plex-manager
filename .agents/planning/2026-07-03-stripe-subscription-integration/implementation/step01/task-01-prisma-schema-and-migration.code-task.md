# Task: Add Subscription/StripeEvent schema, enum, and User/Config fields with migration

## Description
Extend the Prisma schema with the data structures the Stripe subscription feature
needs, and generate the accompanying committed migration. This establishes the
persistence layer every later task builds on.

## Background
The app uses Prisma v7 + PostgreSQL with migrations committed to git under
`prisma/migrations/`. Models use `cuid()` ids, `@@index` on hot fields, and
`createdAt`/`updatedAt` timestamps. Prisma enums are already used elsewhere
(e.g. `WatchlistSyncStatus`, `DiscordCommandStatus`), so subscription status should be
an enum, not a raw string. The `Config` model is a singleton (`id = "config"`). See
`design/detailed-design.md` §5 and `research/data-model.md` for the exact shapes and
conventions.

## Technical Requirements
1. Add a `SubscriptionStatus` enum with values `ACTIVE`, `PAST_DUE`, `CANCELED`,
   `INCOMPLETE`, `UNPAID`.
2. Add a `Subscription` model with a one-to-one relation to `User`
   (`userId @unique`, `onDelete: Cascade`), fields `stripeCustomerId?` (`@unique`),
   `stripeSubscriptionId?` (`@unique`), `status` (default `INCOMPLETE`), `priceId?`,
   `currentPeriodEnd?`, `cancelAtPeriodEnd` (default `false`), `canceledAt?`,
   `plexInviteStatus?`, plus `createdAt`/`updatedAt`, indexed on `status` and
   `stripeCustomerId`.
3. Add a `StripeEvent` model keyed by the Stripe event id (`id String @id`) with
   `type` and `processedAt` fields, indexed on `type`, for webhook idempotency.
4. Add `isExempt` (`Boolean @default(false)`), `exemptReason` (`String?`), and a
   `subscription Subscription?` relation to the `User` model, indexed on `isExempt`.
5. Add `stripeEnabled` (`Boolean @default(false)`), `stripeSecretKey?`,
   `stripeWebhookSecret?`, and `stripePriceIds?` (JSON array of price-id strings) to
   the `Config` model.
6. Generate the migration and the regenerated Prisma client so downstream code
   type-checks against the new models.

## Dependencies
- Prisma v7 + PostgreSQL; scripts `db:migrate` (`SKIP_SEED=true prisma migrate dev`) and
  `db:generate` in `package.json`.
- Generated client import path `@/lib/generated/prisma/client`.
- Grandfathering UPDATE (all existing users → exempt) is added to the same migration in
  a separate task (task-03); this task produces the structural DDL.

## Implementation Approach
1. Edit `prisma/schema.prisma` to add the enum, the two new models, the `User`
   additions (fields + relation + index), and the `Config` additions, matching existing
   model conventions (cuid ids, indexes, timestamps, cascade).
2. Run `npm run db:migrate -- --name add_stripe_subscriptions` to create the committed
   migration folder, then `npm run db:generate`.
3. Keep the generated `migration.sql` for task-03 to append the data migration to.

## Acceptance Criteria

1. **Schema models present and valid**
   - Given the updated `prisma/schema.prisma`
   - When `prisma validate`/`db:generate` runs
   - Then the `Subscription`, `StripeEvent` models, `SubscriptionStatus` enum, and the
     new `User`/`Config` fields exist and the schema is valid with no errors.

2. **Relations and constraints correct**
   - Given the `Subscription` model
   - When inspecting the schema/migration
   - Then `userId` is unique with `onDelete: Cascade`, `stripeCustomerId` and
     `stripeSubscriptionId` are unique, and `User` declares `subscription Subscription?`.

3. **Migration committed**
   - Given the generated migration
   - When listing `prisma/migrations/`
   - Then a new timestamped folder with `migration.sql` exists containing the
     `CREATE TABLE`/`ALTER TABLE`/`CreateEnum` statements for the additions.

4. **Client types regenerated**
   - Given the regenerated Prisma client
   - When importing from `@/lib/generated/prisma/client`
   - Then `Subscription`, `StripeEvent`, `SubscriptionStatus`, and the new `User`/`Config`
     fields are available as types with no TypeScript errors.

5. **Defaults applied**
   - Given a newly created `User` and `Config` row (via a Prisma unit/integration check)
   - When created without the new fields
   - Then `isExempt` defaults to `false`, `Config.stripeEnabled` defaults to `false`,
     and `Subscription.status` defaults to `INCOMPLETE`.

## Metadata
- **Complexity**: Medium
- **Labels**: prisma, database, schema, migration, stripe
- **Required Skills**: Prisma schema design, PostgreSQL migrations, TypeScript
