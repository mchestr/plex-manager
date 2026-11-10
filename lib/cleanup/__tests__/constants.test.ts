/** The fixed values of media cleanup (TS 3.3, 6.10, 8.6, 10.5). */

import * as constants from "@/lib/cleanup/constants"
import { TAUTULLI_STALE_DAYS } from "@/lib/inactivity/blocks"

describe("cleanup constants", () => {
  it("hold the values of TS 3.3", () => {
    expect(constants).toMatchObject({
      NIGHTLY_PATTERN: "7 3 * * *",
      COLLECTIONS_PATTERN: "41 * * * *",
      TYPED_APPROVAL_ABOVE: 50,
      APPROVAL_TTL_MS: 900_000,
      RESUME_HOLD_DAYS: 7,
      STALE_DATA_HOURS: 36,
      TAUTULLI_STALE_DAYS: 14,
      NEVER_WINDOW_DAYS: 365,
      WIDE_RULE_PERCENT: 50,
      REVIEW_GRACE_WARN_DAYS: 14,
      KEPT_RUNS: 30,
      OUTCOME_KEEP_DAYS: { deleted: 365, failed: 365, rescued: 90, released: 90 },
      ENDED_KEEP_VISIBLE_DAYS: 30,
      CLAIM_RENEW_MS: 300_000,
      CLAIM_STALE_MS: 1_800_000,
      RESULTS_PAGE_SIZE: 50,
      COLLECTION_TITLES: { movie: "Movies leaving soon", show: "Shows leaving soon", season: "Seasons leaving soon" },
      KOMETA_DOC_URL: "https://github.com/mchestr/plex-manager/blob/main/docs/media-cleanup.md#kometa",
    })
  })

  it("shares the Tautulli silence limit with the inactivity sweep", () => {
    expect(constants.TAUTULLI_STALE_DAYS).toBe(TAUTULLI_STALE_DAYS)
  })

  it("lists the ten recipes in gallery order (TS 6.10)", () => {
    expect(constants.RECIPE_IDS).toEqual([
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
    ])
  })

  it("lists the global protections, item states, statuses and turn-on checks", () => {
    expect(constants.GLOBAL_PROTECTION_IDS).toHaveLength(13)
    expect(constants.ITEM_STATES).toEqual(["held", "leaving", "approved", "deleting"])
    expect(constants.ITEM_STATUSES).toEqual(["paused", "deleting", "failed", "onHold", "deferred", "waitsForYou", "postponed", "deletesOn", "waitsForBudget", "leaving"])
    expect(constants.TURN_ON_CHECK_IDS).toEqual(["featureOn", "notPaused", "libraryData", "tautulliPlays", "historyCovers", "matchedInArr", "dryRuns",
      "firstBatchSize", "grace", "kometa"])
  })

  it("hold the words of every cleanup refusal (TS 10.1)", () => {
    expect(constants.CLEANUP_ERRORS).toEqual({
      CLEANUP_REVIEW_STALE: "The numbers changed. Check them again.",
      CLEANUP_IMPACT_UNCONFIRMED: "This change moves titles in or out of Leaving soon. Review the change first.",
      CLEANUP_OFF: "Media cleanup is off. Turn it on in Settings first.",
      CLEANUP_PAUSED: "Cleanup is paused. Resume it first.",
      CLEANUP_NOT_LEAVING: "This title is no longer leaving soon.",
      CLEANUP_DELETING: "This title, or part of it, is being deleted now. Try again in a few minutes.",
    })
    expect(constants.keepLimitWords(20)).toBe("You keep 20 titles. End a Keep to keep this one.")
    expect(constants.keepLimitWords(1)).toBe("You keep 1 title. End a Keep to keep this one.")
    expect(constants.CLEANUP_CONFLICT_WORDS.rule).toBe("Someone changed this rule. Reload it and try again.")
    expect(constants.CLEANUP_CONFLICT_WORDS.items).toBe("Someone else changed these titles at the same time. Try again.")
    expect(constants.CLEANUP_UPSTREAM_WORDS).toEqual({
      queue: "The job queue is unavailable. Try again in a minute.",
      plex: "Plex did not answer. Try again in a minute.",
    })
  })
})
