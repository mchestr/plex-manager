/**
 * When the nightly conversation review sweep runs, in the server zone: the
 * one value behind the schedule's cron pattern (`lib/judge/schedule.ts`) and
 * the settings copy that names the time. No imports, so the settings section
 * can load it in the browser.
 *
 * @module lib/judge/sweep-time
 */

/** `HH:MM`, 24-hour, in the server zone. */
export const JUDGE_SWEEP_TIME = "03:17"
