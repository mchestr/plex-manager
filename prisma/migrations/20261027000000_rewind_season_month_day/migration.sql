-- Season dates become month-day values in the server zone (GAP-40, P2.2).
--
-- The legacy columns are timestamp(3) without time zone holding the UTC
-- instant of the admin's browser-local midnight. Adding 12 hours and taking
-- the day recovers the intended day for any browser zone from UTC-12 to
-- UTC+12. Never cast with AT TIME ZONE: that yields a timestamptz, which
-- to_char renders in the session's TimeZone. Re-running gives the same values.
-- The legacy columns are no longer written; P11.18 drops them.
SET LOCAL TIME ZONE 'UTC';

UPDATE "Config"
SET "rewindSeasonOpens" = to_char("wrappedGenerationStartDate" + interval '12 hours', 'MM-DD'),
    "rewindSeasonCloses" = to_char("wrappedGenerationEndDate" + interval '12 hours', 'MM-DD')
WHERE "wrappedGenerationStartDate" IS NOT NULL
  AND "wrappedGenerationEndDate" IS NOT NULL;
