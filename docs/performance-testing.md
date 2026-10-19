# Performance Testing Guide

There is no performance tooling in the repository today. The earlier maintenance
query profiler went away with the library-maintenance feature, whose tables were
dropped in the `20251206172926_remove_maintenance_tables` migration. This page
lists the known hotspots and says where performance checks will come from.

## Known hotspots

### Rewind data collection (BP-24)

Each Rewind generation downloads far more than it needs, and most of these calls
have no effective timeout:

- **Plex:** `lib/wrapped/server-statistics.ts` fetches every library section in
  full (`/library/sections/{id}/all`, plus every episode) to sum storage. It does
  this on every user's generation, with no cache.
- **Tautulli:** `lib/wrapped/tautulli-user-statistics.ts` pages through the
  user's lifetime `get_history` 1,000 rows at a time, then filters by year in
  memory.
- **Overseerr:** `lib/wrapped/overseerr-statistics.ts` pages through every
  user's requests and calls `/user` without paging.

P2.4 (Rewind sources) and P2.6 (one server-wide history pass with a metadata
cache) replace this path.

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
