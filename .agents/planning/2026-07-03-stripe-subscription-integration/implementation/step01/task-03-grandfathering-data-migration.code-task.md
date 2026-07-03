# Task: Grandfather existing users via SQL data migration

## Description
Add a data migration that marks every pre-existing user as exempt from the subscription
requirement, so current Plex members are never gated or removed when the feature is
enabled.

## Background
The runtime access gate is pure-DB and treats `isExempt = true` users as always
allowed. Existing members must be grandfathered without a live Plex call. This is
correct as a blanket update because, under the current auth flow, a `User` row is only
created/updated **after** `checkUserServerAccess()` passes — non-members are rejected
with `ACCESS_DENIED` before any record is written. Therefore every existing `User` row
belongs to someone who had server access. New users created after deploy default to
`isExempt = false`. See `research/data-model.md` (Grandfathering) and
`design/detailed-design.md` FR-8 / §8.5.

## Technical Requirements
1. Within the same migration that adds the `isExempt`/`exemptReason` columns (task-01),
   append a data-migration statement that sets `isExempt = true` and
   `exemptReason = 'grandfathered'` for all existing `User` rows.
2. Ensure the UPDATE runs AFTER the `ALTER TABLE ... ADD COLUMN` statements in the SQL.
3. Do not alter the column defaults (new users must still default to
   `isExempt = false`).

## Dependencies
- Task-01 (columns and migration folder must exist).
- PostgreSQL; the committed `migration.sql` produced by task-01.

## Implementation Approach
1. Edit the generated `migration.sql` for `add_stripe_subscriptions`, adding after the
   column additions:
   `UPDATE "User" SET "isExempt" = true, "exemptReason" = 'grandfathered';`
2. Keep the statement idempotent-safe for a fresh DB (an empty `User` table simply
   updates zero rows).

## Acceptance Criteria

1. **Existing users grandfathered**
   - Given a database with pre-existing `User` rows
   - When the migration is applied
   - Then every existing user has `isExempt = true` and `exemptReason = 'grandfathered'`.

2. **New users not exempt**
   - Given the migration has been applied
   - When a new `User` is created without specifying `isExempt`
   - Then the new user has `isExempt = false`.

3. **Ordering correct**
   - Given the `migration.sql`
   - When inspected
   - Then the `UPDATE "User" ...` appears after the `ADD COLUMN "isExempt"`/
     `"exemptReason"` statements.

4. **Empty database safe**
   - Given a fresh database with no users
   - When the migration runs
   - Then it completes successfully, updating zero rows and leaving defaults intact.

## Metadata
- **Complexity**: Low
- **Labels**: database, migration, data-migration, stripe, grandfathering
- **Required Skills**: SQL, Prisma migrations, PostgreSQL
