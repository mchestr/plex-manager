/**
 * The words of the media cleanup settings, pause, resume, run and refresh
 * actions and of their buttons: the refusals of TS 9.4 and 9.5, and the
 * toasts of UX 8.9. Client-safe: the dialogs and the Settings sections read
 * the same strings that the actions return.
 *
 * @module lib/cleanup/actions/settings/words
 */

/** The refusals that only these actions return (TS 9.4 item 3, 9.5 item 4). */
export const SETTINGS_WORDS = {
  /** `VALIDATION` without `REDIS_URL`, and the description of every button that needs the job queue. */
  redis: "Redis is not set up. Library reads and runs need the job queue.",
  /** `UPSTREAM_UNAVAILABLE` after a feature save whose schedule did not answer. */
  scheduleFailed: "Settings saved, but the job queue did not answer. The nightly run starts after the next restart.",
} as const

/** The toasts of UX 8.9 for these actions. */
export const SETTINGS_TOASTS = {
  saved: "Settings saved",
  /** A protections or members save that found the run claim busy (`exitsApplied: false`, owner-r2-3). */
  savedBusy: "Settings saved. A run is in progress. At its end, titles that a new protection keeps safe leave Leaving soon.",
  paused: "Cleanup paused",
  resumed: "Cleanup resumed",
  runStarted: "Run started",
  readStarted: "Library read started",
} as const

/** The toast after `updateCleanupSettings`: the busy words while a run held the claim, else "Settings saved". */
export function settingsSavedToast({ exitsApplied }: { exitsApplied: boolean | null }): string {
  return exitsApplied === false ? SETTINGS_TOASTS.savedBusy : SETTINGS_TOASTS.saved
}
