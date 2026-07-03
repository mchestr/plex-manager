# Task: Extend admin user data with batched subscription/exempt info

## Description
Add subscription and exemption fields to the admin user DTO and populate them via a
batched query in `getAllUsersWithWrapped`, avoiding N+1.

## Background
The admin user list uses `AdminUserWithWrappedStats` (`types/admin.ts`) built by
`getAllUsersWithWrapped` (`actions/user-queries.ts`), which composes helper maps
(`buildPlexAccessMap`, `fetchShareStatsMap`). Subscription info should be attached the
same batched way. See `research/ui-and-testing.md` §B and `design/detailed-design.md`
§4.5/§5.

## Technical Requirements
1. Extend `AdminUserWithWrappedStats` with `subscriptionStatus`, `currentPeriodEnd`,
   `cancelAtPeriodEnd`, `isExempt`, `exemptReason`, and `stripeCustomerId`.
2. Add a `fetchSubscriptionMap(userIds)` helper that batch-loads subscriptions
   (`prisma.subscription.findMany({ where: { userId: { in } } })`).
3. Include `isExempt`/`exemptReason` from the user select and attach subscription fields
   in the `.map` of `getAllUsersWithWrapped`.
4. Preserve existing behavior/fields; no N+1 queries.

## Dependencies
- Step01 (`Subscription`, `isExempt`), `types/admin.ts`, `actions/user-queries.ts`.

## Implementation Approach
1. Mirror the existing helper-map pattern; merge subscription data by user id.
2. Ensure `isExempt`/`exemptReason` are part of the user query select.

## Acceptance Criteria

1. **DTO extended**
   - Given `AdminUserWithWrappedStats`
   - When used
   - Then it includes the subscription/exempt fields with correct types.

2. **Batched attach (no N+1)**
   - Given N users
   - When `getAllUsersWithWrapped` runs
   - Then subscriptions are loaded in a single batched query and attached per user.

3. **Correct values**
   - Given users with/without subscriptions and with/without exemption
   - When mapped
   - Then each user's `subscriptionStatus`/`isExempt`/`exemptReason`/`stripeCustomerId`
     reflect the DB.

4. **Existing fields intact**
   - Given the mapping
   - When it runs
   - Then previously returned fields (wrapped stats, plex access, llm usage) are unchanged.

5. **Unit tests**
   - Given `getAllUsersWithWrapped` tests
   - When run
   - Then batched subscription attachment and correct per-user values are asserted
     (mock Prisma).

## Metadata
- **Complexity**: Medium
- **Labels**: admin, server-actions, prisma, subscriptions, types
- **Required Skills**: Prisma, TypeScript, query batching
