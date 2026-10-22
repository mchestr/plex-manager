> Part of the [implementation plan](plan.md). The procedure is `docs/rewind.md`, "The final cut", "Staging rehearsal".

# Final-cut dry runs

One section per rehearsal on a staging copy of production: P8.10 on
2026-12-11 (`--through=2026-12-10`, warning above 20%) and P9.2 on 2026-12-28
(`--through=2026-12-27`, warning above 25%). The pass mark for the re-call rate
is under 30%, and the validator must report zero failures. Paste the scripts'
output as printed; it carries counts and codes, never a title or a name.

## Neutralising statements

`scripts/rewind-staging-neutralise.sql`, run before staging's first boot with
`psql -v budget=<USD> -d …/plex_manager_staging -f scripts/rewind-staging-neutralise.sql`.
It refuses any other database. What it does:

```sql
UPDATE "DiscordIntegration" SET "isEnabled" = false, "botEnabled" = false, "botToken" = NULL;

UPDATE "Config"
SET "watchlistSyncEnabled" = false,
    "rewindNotifyChannels" = '["banner"]'::jsonb,
    "stripeSecretKey" = NULL,
    "stripeWebhookSecret" = NULL,
    "rewindLlmBudgetUsd" = :'budget'::numeric;
```

Staging's environment adds `ENABLE_DISCORD_BOT=false`,
`ENABLE_WATCHLIST_SYNC=false`, `REWIND_STAGING=1`, `LOG_LEVEL=debug`, its own
`NEXTAUTH_SECRET`, both app URLs on `http://127.0.0.1:3100`, a throwaway
`redis:7`, and never `E2E_TEST_MODE`.

## 2026-12-11: first dry run (P8.10)

Not run yet (owner).

- **Staging:** dump file and time; image digest; `prisma migrate status` result; restore duration.
- **Neutralised:** the script's printed values; budget set (plan estimate plus 50%).
- **Plan estimate:** `npm run rewind:final-cut -- --year=2026 --through=2026-12-10` output.
- **Run:** start time; `--apply` output (job id).
- **Report:** `npm run rewind:final-cut-report -- --year=2026 --since=<start> --log=staging-worker.log --warn=20` output (re-call rate overall and for full editions, reasons, cost per member, timings, Tautulli 429s, failures and skips).
- **Validator:** `npm run rewind:validate -- --year=2026 --final-cut` output (must be zero failures).
- **Outcome:** pass or fail; any fix PR and the repeat run.
- **Teardown:** time the app, Redis and `plex_manager_staging` were removed.

## 2026-12-28: second dry run (P9.2)

Not run yet. P9.2 adds the notification recipient count, the card prewarm count and `REWIND_CACHE_DIR` growth, the spot checks, the roll-back rehearsal and the go or no-go.
