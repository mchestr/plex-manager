/**
 * The words of each "Ready to turn on" check (UX 7.13, X7, X9) in every
 * state, the fix links, and the failed texts that must equal the
 * `VALIDATION` words of `turnOnCleanupRule`.
 */

import { check, F } from "@/components/admin/cleanup/turn-on/__tests__/fixtures"
import { type CheckContext, checkWords, LISTED } from "@/components/admin/cleanup/turn-on/check-words"
import { checkFailureText } from "@/lib/cleanup/actions/rules/check-words"
import type { TurnOnCheck } from "@/lib/cleanup/types/rule-parts"

const NOW = Date.parse("2026-11-08T12:00:00.000Z")
const ctx: CheckContext = { ruleId: "rule-1", level: "movie", f: F, now: NOW }
const words = (c: TurnOnCheck, over: Partial<CheckContext> = {}) => checkWords(c, { ...ctx, ...over })

describe("checkWords", () => {
  it("words the passing checks", () => {
    expect(words(check("featureOn", "ok", "all")).text).toBe("Media cleanup is on.")
    expect(words(check("libraryData", "ok", "all", { sources: 4, readAt: "2026-11-08T03:07:00.000Z" })).text).toBe("All 4 sources answered at 3:07 AM today.")
    expect(words(check("libraryData", "ok", "all", { sources: 1, readAt: "2026-11-06T03:07:00.000Z" })).text).toBe("1 source answered at Nov 6, 2026, 3:07 AM.")
    expect(words(check("libraryData", "ok", "all", { sources: 3 })).text).toBe("All 3 sources answered.")
    expect(words(check("historyCovers", "ok", "all", { days: 365, startAt: "2022-06-14T00:00:00.000Z" })).text).toBe(
      "Tautulli history starts Jun 14, 2022. That covers the 365-day window."
    )
    expect(words(check("historyCovers", "ok", "all", { days: 365 })).text).toBe("Tautulli history covers the 365-day window.")
    expect(words(check("matchedInArr", "ok", "none", { service: "radarr", count: 197 })).text).toBe("Radarr manages all 197 movies.")
    expect(words(check("matchedInArr", "ok", "none", { service: "radarr", count: 197, matchedBy: "TMDB id", root: "/data/movies" })).text).toBe(
      "Radarr manages all 197 movies, matched by TMDB id. Every file is inside /data/movies."
    )
    expect(words(check("matchedInArr", "ok", "none", { service: "sonarr", count: 1 }), { level: "show" }).text).toBe("Sonarr manages the show.")
    expect(words(check("dryRuns", "ok", "none", { count: 12, min: 191, max: 199 })).text).toBe("12 dry runs, with steady matches.")
    expect(words(check("dryRuns", "ok", "none", { count: 1, min: 9, max: 9 })).text).toBe("1 dry run, with steady matches.")
    expect(words(check("grace", "ok", "automatic", { graceDays: 30, min: 7 })).fix).toBeNull()
  })

  it("words the warnings and the info line", () => {
    expect(words(check("matchedInArr", "warning", "none", { service: "radarr", cannotDelete: 3 })).text).toBe(
      "3 movies cannot be deleted. They stay out of Leaving soon."
    )
    expect(words(check("matchedInArr", "warning", "none", { service: "other", cannotDelete: 1 })).text).toBe(
      "1 movie cannot be deleted. It stays out of Leaving soon."
    )
    expect(words(check("dryRuns", "warning", "none", { count: 5, min: 120, max: 199 })).text).toBe("5 dry runs. Matches moved between 120 and 199.")
    expect(words(check("dryRuns", "info", "automatic", { count: 0 })).text).toBe("No finished dry run yet. Automatic needs one.")
    const kometa = words(check("kometa", "warning", "none", { collection: "Movies leaving soon" }))
    expect(kometa.text).toBe("Kometa can delete collections that it does not manage. plex-manager checks every hour and makes the collection again.")
    expect(kometa.fix).toMatchObject({ label: "Read the Kometa note", external: true })
  })

  it("gives each failed check a fix link, and the feature-off fix returns to this page", () => {
    expect(words(check("featureOn", "failed", "all")).fix).toEqual({
      label: "Open settings",
      href: "/admin/cleanup?tab=settings&section=cleanup-feature&returnTo=%2Fadmin%2Fcleanup%2Frules%2Frule-1%2Fturn-on",
    })
    expect(words(check("notPaused", "failed", "all")).fix).toEqual({ label: "Open Media cleanup", href: "/admin/cleanup" })
    expect(words(check("libraryData", "failed", "all", { code: "dataStale", hours: 41 })).fix?.href).toBe("/admin/cleanup")
    expect(words(check("tautulliPlays", "failed", "all")).fix?.label).toBe("Open Tautulli settings")
    expect(words(check("historyCovers", "failed", "all", { days: 365 })).fix).toEqual({ label: "Edit the rule", href: "/admin/cleanup/rules/rule-1" })
  })

  it.each([
    check("featureOn", "failed", "all"),
    check("notPaused", "failed", "all"),
    check("libraryData", "failed", "all", { code: "noData" }),
    check("libraryData", "failed", "all", { code: "dataStale", hours: 41 }),
    check("libraryData", "failed", "all", { code: "sourceFailed", service: "tautulli", readAt: "2026-11-08T03:07:00.000Z" }),
    check("libraryData", "failed", "all", { code: "sourceShrank", service: "overseerr", rows: 10, previousRows: 200, counter: "overseerrRequests" }),
    check("libraryData", "failed", "all", { code: 7 }),
    check("tautulliPlays", "failed", "all"),
    check("historyCovers", "failed", "all", { days: 365, startAt: "2026-10-01T00:00:00.000Z" }),
    check("historyCovers", "failed", "all", { days: 730 }),
    check("dryRuns", "info", "automatic", { count: 0 }),
    check("firstBatchSize", "failed", "automatic", { count: 197, checked: 777 }),
    check("grace", "failed", "automatic", { graceDays: 3, min: 7 }),
  ])("says what turnOnCleanupRule says for a failed $id", (c) => {
    expect(words(c).text).toBe(checkFailureText(c, "movie", F))
  })

  it("leaves the two Automatic-only checks out of the list", () => {
    expect(LISTED(check("firstBatchSize", "failed", "automatic"))).toBe(false)
    expect(LISTED(check("grace", "ok", "automatic"))).toBe(false)
    expect(LISTED(check("dryRuns", "ok", "none"))).toBe(true)
  })

  it("falls back to the stale words for a check id it does not know", () => {
    expect(words({ id: "other" as TurnOnCheck["id"], state: "failed", blocks: "all", values: {} }).text).toBe("The numbers changed. Check them again.")
  })
})
