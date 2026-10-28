-- Neutralise a staging copy of production before its first boot, for the
-- season-open rehearsal (P8.1; docs/rewind.md, "Season open, hour by hour").
--
-- Usage, against the restored staging database only:
--   psql -v budget=<$0.03 per member plus 50%> \
--     -d postgresql://user:password@host:5432/plex_manager_staging \
--     -f scripts/rewind-staging-neutralise.sql
--
-- It refuses any database but plex_manager_staging, then turns off every
-- outbound side effect the rehearsal could reach:
--   - Discord: a second gateway login with the production token would
--     disturb the production bot, so the integration is off and the token gone;
--   - watchlist sync: staging must file no Overseerr requests;
--   - notifications: REWIND_NOTIFY runs with the banner only, so no DM is sent;
--   - Stripe: the keys are nulled, stripeEnabled stays as it is, so the
--     entitlement skips match production;
--   - the LLM budget: the model calls are real and billed to the production
--     key, so the cap is the season's $0.03 per member plus 50% (:budget, in USD).
-- It prints the neutralised values; copy them into ship-check.md.

\set ON_ERROR_STOP on

\if :{?budget}
\else
  DO $$ BEGIN RAISE EXCEPTION 'Pass the staging budget: -v budget=<USD>, the dry run estimate plus 50%%'; END $$;
\endif

SELECT current_database() = 'plex_manager_staging' AS is_staging \gset
\if :is_staging
\else
  DO $$ BEGIN RAISE EXCEPTION 'Refusing: this is not plex_manager_staging'; END $$;
\endif

BEGIN;

UPDATE "DiscordIntegration" SET "isEnabled" = false, "botEnabled" = false, "botToken" = NULL;

UPDATE "Config"
SET "watchlistSyncEnabled" = false,
    "rewindNotifyChannels" = '["banner"]'::jsonb,
    "stripeSecretKey" = NULL,
    "stripeWebhookSecret" = NULL,
    "rewindLlmBudgetUsd" = :'budget'::numeric;

COMMIT;

SELECT "isEnabled", "botEnabled", "botToken" IS NULL AS "botTokenCleared" FROM "DiscordIntegration";
SELECT "watchlistSyncEnabled", "rewindNotifyChannels", "stripeEnabled",
       "stripeSecretKey" IS NULL AS "stripeSecretKeyCleared",
       "stripeWebhookSecret" IS NULL AS "stripeWebhookSecretCleared",
       "rewindLlmBudgetUsd"
FROM "Config";
