# Performance Testing Guide

There is no performance tooling in the repository today. The earlier maintenance
query profiler went away with the library-maintenance feature, whose tables were
dropped in the `20251206172926_remove_maintenance_tables` migration. This page
lists the known hotspots and says where performance checks will come from.

## Known hotspots

### Rewind data collection (BP-24)

Each Rewind generation downloads far more than it needs, and most of these calls
have no effective timeout:

- **Tautulli:** the v2 statistics fetcher paged through the user's lifetime
  `get_history` 1,000 rows at a time, then filtered by year in memory.

P2.4 (Rewind sources) and P2.6 (one server-wide history pass with a metadata
cache) replaced this path for Rewind. P11.12 deleted the fetcher: Discord's
`/mystats` and linked-role hours read the stored Rewind's facts, or at most 20
pages of the member's year (`lib/discord/stats/member-stats.ts`).

### LLM usage totals (BP-28)

The admin users, LLM-usage and cost-analysis pages load every `LLMUsage` row,
including the full prompt and response text, to sum four numbers:

- `actions/user-queries.ts` includes `llmUsage: true` for every user and feeds
  the rows to `aggregateLlmUsage` in `lib/utils.ts`.
- `lib/wrapped/usage.ts` runs `findMany` over the whole table and reduces in
  JavaScript.

P7.8 moves these totals to `groupBy` aggregates that select only the numeric
columns.

## Investigating a slow query

Until dedicated tooling lands, turn on Prisma's query log for the code path
under investigation. `lib/prisma.ts` builds the client with the `PrismaPg`
adapter; add a `log` option there in a local branch, without committing it:

```typescript
new PrismaClient({ adapter, log: ['query'] })
```

Count the queries per request to spot N+1 patterns, and run the path against a
`_test` database seeded at a realistic size.

## Planned tooling

- **P5.4** adds the Playwright `rewind-perf` project (`e2e/perf/*.perf.spec.ts`,
  chromium only). It throttles the CPU through CDP, records long tasks, and
  enforces the first-page JavaScript budget on `/rewind/[year]`.
- **P11.4** (observability) adds request IDs and the operational metrics.
