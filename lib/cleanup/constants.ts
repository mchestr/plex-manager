/**
 * The fixed values of media cleanup (TS 3.3): schedules, limits, retention,
 * the Plex collection titles and the recipe ids in gallery order (TS 6.10,
 * deviation D2). They are not options. Client-safe.
 *
 * @module lib/cleanup/constants
 */

import type { GlobalProtectionId } from "@/lib/cleanup/engine/types"
import type { Level } from "@/lib/validations/cleanup-vocabulary"

/** The nightly library read and run: 03:07 in the server zone. */
export const NIGHTLY_PATTERN = "7 3 * * *"
/** The Plex collection sync: hourly, at minute 41. */
export const COLLECTIONS_PATTERN = "41 * * * *"
/** Every cleanup job add (TS 9.2): one attempt, gone when done, a failed job kept 7 days on the Queues page. */
export const CLEANUP_JOB_OPTIONS = { attempts: 1, removeOnComplete: true, removeOnFail: { age: 7 * 24 * 3600 } }

/** Above this many items, a batch approval or an Automatic turn-on needs the typed count. */
export const TYPED_APPROVAL_ABOVE = 50
/** A review page is stale after 15 minutes (`CLEANUP_REVIEW_STALE`). */
export const APPROVAL_TTL_MS = 15 * 60 * 1000
/** Nothing is deleted for 7 days after a turn-on or a resume. */
export const RESUME_HOLD_DAYS = 7
/** Library data older than this stops every live rule (`dataStale`). */
export const STALE_DATA_HOURS = 36
/** Days without a play on the whole server after which Tautulli counts as not recording. */
export { TAUTULLI_STALE_DAYS } from "@/lib/inactivity/blocks"
/** The window that "never played" and play totals need the history to cover. */
export const NEVER_WINDOW_DAYS = 365
/** A rule that matches more than this share of the checked items gets the `wide` warning. */
export const WIDE_RULE_PERCENT = 50
/** A Review first grace period below this many days gets a warning. @internal */
export const REVIEW_GRACE_WARN_DAYS = 14
/** The newest runs that History keeps. */
export const KEPT_RUNS = 30
/** Days that each kind of outcome stays (TS 2.7). */
export const OUTCOME_KEEP_DAYS = { deleted: 365, failed: 365, rescued: 90, released: 90 } as const
/** Days that an ended Keep stays listed on the member's pages. */
export const ENDED_KEEP_VISIBLE_DAYS = 30
/** Claims renew every 5 minutes and go stale after 30 (TS 8.1). */
export const CLAIM_RENEW_MS = 5 * 60_000
export const CLAIM_STALE_MS = 30 * 60_000
/** Rows per page of the Results, the batch tables and the lists. */
export const RESULTS_PAGE_SIZE = 50

/** The Plex collection of each level (TS 8.10). */
export const COLLECTION_TITLES: Record<Level, string> = {
  movie: "Movies leaving soon",
  show: "Shows leaving soon",
  season: "Seasons leaving soon",
}

export const KOMETA_DOC_URL = "https://github.com/mchestr/plex-manager/blob/main/docs/media-cleanup.md#kometa"

/** The global protections, in Settings order (TS 5.3). G1 and G3 are always on (E30). */
export const GLOBAL_PROTECTION_IDS = ["g1", "g2", "g3", "g4", "g5", "g6", "g7", "g8", "g9", "g10", "g11", "g12", "g13"] as const satisfies readonly GlobalProtectionId[]

/** `CleanupItem.state` (TS 8.6). */
export const ITEM_STATES = ["held", "leaving", "approved", "deleting"] as const
export type ItemState = (typeof ITEM_STATES)[number]

/** The statuses that `itemStatus()` gives a Leaving soon row, in the order of its table (TS 8.6, UX 4.12.6). */
export const ITEM_STATUSES = ["paused", "deleting", "failed", "onHold", "deferred", "waitsForYou", "postponed", "deletesOn", "waitsForBudget", "leaving"] as const
export type ItemStatus = (typeof ITEM_STATUSES)[number]

/** The checks of the turn-on page (TS 10.5, UX 7.13), in page order. @internal */
export const TURN_ON_CHECK_IDS = ["featureOn", "notPaused", "libraryData", "tautulliPlays", "historyCovers", "matchedInArr", "dryRuns",
  "firstBatchSize", "grace", "kometa"] as const
export type TurnOnCheckId = (typeof TURN_ON_CHECK_IDS)[number]

/** The refusals of the media cleanup actions and their words (TS 10.1): `fail(code, CLEANUP_ERRORS[code])`. */
export const CLEANUP_ERRORS = {
  CLEANUP_REVIEW_STALE: "The numbers changed. Check them again.",
  CLEANUP_IMPACT_UNCONFIRMED: "This change moves titles in or out of Leaving soon. Review the change first.",
  CLEANUP_OFF: "Media cleanup is off. Turn it on in Settings first.",
  CLEANUP_PAUSED: "Cleanup is paused. Resume it first.",
  CLEANUP_NOT_LEAVING: "This title is no longer leaving soon.",
  CLEANUP_DELETING: "This title, or part of it, is being deleted now. Try again in a few minutes.",
} as const
export type CleanupErrorCode = keyof typeof CLEANUP_ERRORS | "CLEANUP_KEEP_LIMIT"
/** The words of `CLEANUP_KEEP_LIMIT`. */
export const keepLimitWords = (limit: number) => `You keep ${limit} ${limit === 1 ? "title" : "titles"}. End a Keep to keep this one.`
/** The words of `CONFLICT` and `UPSTREAM_UNAVAILABLE`, by case (TS 10.1). */
export const CLEANUP_CONFLICT_WORDS = {
  run: "A run is in progress. Try again in a few minutes.",
  rule: "Someone changed this rule. Reload it and try again.",
  settings: "Someone else saved settings at the same time. Try again.",
  items: "Someone else changed these titles at the same time. Try again.",
} as const
export const CLEANUP_UPSTREAM_WORDS = {
  queue: "The job queue is unavailable. Try again in a minute.",
  plex: "Plex did not answer. Try again in a minute.",
} as const

/** The ten recipes, in gallery order (TS 6.10). `lib/cleanup/recipes.ts` builds them. */
export const RECIPE_IDS = [
  "never-watched-movies",
  "big-shows-nobody-plays",
  "movies-nobody-watches",
  "requested-never-watched",
  "requester-finished",
  "former-members",
  "finished-shows",
  "old-seasons",
  "nobody-asked",
  "big-movies",
] as const
export type RecipeId = (typeof RECIPE_IDS)[number]
