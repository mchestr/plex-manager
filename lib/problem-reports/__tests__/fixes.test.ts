/**
 * The fix gate (the daily search cap, the breaker, which latches, and the
 * hourly cap on Plex changes), and which fixes a report can run.
 */

import { BREAKER_LIMITS, DAILY_SEARCH_CAP, fixesFor, fixTraits, gateFix, PLEX_HOURLY_CAP, suggestedFix } from "@/lib/problem-reports/fixes"

const NONE = { searchesToday: 0, replacementsLastHour: 0, replacementsToday: 0, plexChangesLastHour: 0 }
const REPLACES = { searches: false, replacesFile: true, changesPlex: false }

describe("gateFix", () => {
  it("lets a search run until the day's searches reach the cap", () => {
    const search = fixTraits("LOOK_FOR_MISSING")
    expect(gateFix(search, { ...NONE, searchesToday: DAILY_SEARCH_CAP - 1 }, false)).toEqual({ ok: true })
    expect(gateFix(search, { ...NONE, searchesToday: DAILY_SEARCH_CAP }, false)).toEqual({ ok: false, reason: "SEARCH_CAP", trips: false })
  })

  it("never counts searches against a fix that doesn't search", () => {
    expect(gateFix(fixTraits("REFRESH"), { ...NONE, searchesToday: 999 }, true)).toEqual({ ok: true })
  })

  it("trips the breaker on a file replacement past the hour's or the day's limit, from any trigger", () => {
    expect(gateFix(REPLACES, { ...NONE, replacementsLastHour: BREAKER_LIMITS.hour - 1, replacementsToday: BREAKER_LIMITS.day - 1 }, false)).toEqual({ ok: true })
    expect(gateFix(REPLACES, { ...NONE, replacementsLastHour: BREAKER_LIMITS.hour }, false)).toEqual({ ok: false, reason: "BREAKER", trips: true })
    expect(gateFix(REPLACES, { ...NONE, replacementsToday: BREAKER_LIMITS.day }, false)).toEqual({ ok: false, reason: "BREAKER", trips: true })
  })

  it("keeps a tripped breaker shut until an admin resumes, whatever the counts", () => {
    expect(gateFix(REPLACES, NONE, true)).toEqual({ ok: false, reason: "BREAKER", trips: false })
  })

  it("lets a match or a refresh run until the hour's Plex changes reach the cap, and nothing else count them", () => {
    for (const action of ["FIX_MATCH", "REFRESH"] as const) {
      expect(gateFix(fixTraits(action), { ...NONE, plexChangesLastHour: PLEX_HOURLY_CAP - 1 }, true)).toEqual({ ok: true })
      expect(gateFix(fixTraits(action), { ...NONE, plexChangesLastHour: PLEX_HOURLY_CAP }, false)).toEqual({ ok: false, reason: "PLEX_CAP", trips: false })
    }
    expect(gateFix(fixTraits("LOOK_FOR_MISSING"), { ...NONE, plexChangesLastHour: 999 }, false)).toEqual({ ok: true })
  })
})

describe("the fixes for a report", () => {
  it("points a problem to its fix when it is one that runs", () => {
    expect(suggestedFix("missing_episodes")).toBe("LOOK_FOR_MISSING")
    expect(suggestedFix("wrong_details")).toBe("REFRESH")
    expect(suggestedFix("blurry")).toBe("BETTER_COPY")
    expect(suggestedFix("wont_start")).toBe("SWAP")
    expect(suggestedFix("different_title")).toBe("FIX_MATCH")
    expect(suggestedFix("buffers")).toBeNull()
    expect(suggestedFix("retired_code")).toBeNull()
  })

  it("offers Look for the episodes only for shows and episodes, and the fixes that need a file only for a title with one", () => {
    expect(fixesFor("movie")).toEqual(["SWAP", "BETTER_COPY", "FIX_MATCH", "REFRESH", "REMOVE_AND_SEARCH"])
    expect(fixesFor("show")).toEqual(["LOOK_FOR_MISSING", "FIX_MATCH", "REFRESH"])
    expect(fixesFor("episode")).toEqual(["SWAP", "BETTER_COPY", "LOOK_FOR_MISSING", "FIX_MATCH", "REFRESH", "REMOVE_AND_SEARCH"])
  })

  it("counts Look for a better copy as a search, and a swap or a removal as a search that replaces the file", () => {
    expect(fixTraits("BETTER_COPY")).toEqual({ searches: true, replacesFile: false, changesPlex: false })
    expect(fixTraits("SWAP")).toEqual({ searches: true, replacesFile: true, changesPlex: false })
    expect(fixTraits("REMOVE_AND_SEARCH")).toEqual({ searches: true, replacesFile: true, changesPlex: false })
    expect(fixTraits("FIX_MATCH")).toEqual({ searches: false, replacesFile: false, changesPlex: true })
  })
})
