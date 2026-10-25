# Performance Testing Guide

Where performance is checked, what is measured in production, and the
hotspots that were fixed. The earlier maintenance query profiler went away with
the library-maintenance feature, whose tables were dropped in the
`20251206172926_remove_maintenance_tables` migration.

## Budgets in CI: the `rewind-perf` project

The Playwright project `rewind-perf` (`e2e/perf/*.perf.spec.ts`, chromium,
because it throttles the CPU through CDP) runs against the production build in
CI's blocking "Rewind Performance" job:

- `e2e/perf/rewind.perf.spec.ts` (P5.4, P7.15): each fixture issue autoplays
  for 30 s at 4x CPU throttling, as a capable phone and as a low-end one. No
  long task may exceed 50 ms, and the stage commits at most 3 times per page.
  A last test injects an 80 ms busy loop to prove the gate still measures.
- `e2e/perf/rewind-budget.perf.spec.ts` (P5.4, NFR-5): the scripts only
  `/rewind/<year>` loads gzip to at most 110 KB, and each page chunk a turn
  loads to at most 12 KB. No `/rewind` route loads chart.js.
- `e2e/perf/admin-charts-budget.perf.spec.ts` (P10.9): the scripts each admin
  chart page loads beyond the admin shell, Recharts included, stay under their
  budget.

Run them locally against a production build:

```bash
E2E_SERVER=prod npx playwright test --project=rewind-perf
```

Each spec logs the sizes and timings it measured.

## In production: `/api/metrics`

P11.4 added Prometheus metrics at `/api/metrics`, served only when
`METRICS_TOKEN` is set (`lib/observability/metrics.ts`): queue depth by state
(`plex_manager_queue_jobs`), job failures (`plex_manager_job_failures_total`),
LLM spend (`plex_manager_llm_spend_usd`), and the process's memory and
event-loop delay (`process_resident_memory_bytes`,
`plex_manager_event_loop_delay_p99_seconds`). Every log line of a request
carries its `requestId`, so a slow request can be followed through the jobs it
queued. Scraping and the log searches are in
[operations](operations.md#request-ids-and-metrics).

## Fixed hotspots

### Rewind data collection (BP-24)

The v2 statistics fetcher paged through each member's lifetime Tautulli
`get_history`, 1,000 rows at a time, and filtered by year in memory. P2.4
(Rewind sources) and P2.6 (one server-wide history pass with a metadata cache)
replaced it for Rewind, every Tautulli call goes through `tautulliCommand`
with a timeout, and P11.12 deleted the fetcher: Discord's `/mystats` and
linked-role hours read the stored Rewind's facts, or at most 20 pages of the
member's year (`lib/discord/stats/member-stats.ts`).

### LLM usage totals (BP-28)

The admin users, LLM-usage and cost-analysis pages used to load every
`LLMUsage` row, prompt and response text included, to sum four numbers. P7.8
moved the totals to `aggregate()` and `groupBy()` queries that select only the
numeric columns (`lib/llm/usage-totals.ts`). One conversation's page still sums
its own rows with `aggregateLlmUsage` in `lib/utils.ts`.

## Investigating a slow query

Turn on Prisma's query log for the code path under investigation.
`lib/prisma.ts` builds the client with the `PrismaPg` adapter; add a `log`
option there in a local branch, without committing it:

```typescript
new PrismaClient({ adapter, log: ['query'] })
```

Count the queries per request to spot N+1 patterns, and run the path against a
`_test` database seeded at a realistic size.
