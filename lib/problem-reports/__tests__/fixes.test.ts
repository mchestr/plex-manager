/**
 * The fix gate (the daily search cap and the breaker, which latches), and
 * which fixes a report can run.
 */

import { BREAKER_LIMITS, DAILY_SEARCH_CAP, fixesFor, fixTraits, gateFix, suggestedFix } from "@/lib/problem-reports/fixes"

const NONE = { searchesToday: 0, replacementsLastHour: 0, replacementsToday: 0 }
const REPLACES = { searches: false, replacesFile: true }

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
})

describe("the fixes for a report", () => {
  it("points a problem to its fix when it is one that runs", () => {
    expect(suggestedFix("missing_episodes")).toBe("LOOK_FOR_MISSING")
    expect(suggestedFix("wrong_details")).toBe("REFRESH")
    expect(suggestedFix("blurry")).toBe("BETTER_COPY")
    expect(suggestedFix("wont_start")).toBeNull()
    expect(suggestedFix("retired_code")).toBeNull()
  })

  it("offers Look for the episodes only for shows and episodes, and Look for a better copy only for a title with a file", () => {
    expect(fixesFor("movie")).toEqual(["BETTER_COPY", "REFRESH"])
    expect(fixesFor("show")).toEqual(["LOOK_FOR_MISSING", "REFRESH"])
    expect(fixesFor("episode")).toEqual(["BETTER_COPY", "LOOK_FOR_MISSING", "REFRESH"])
  })

  it("counts Look for a better copy as a search, not as a file replacement", () => {
    expect(fixTraits("BETTER_COPY")).toEqual({ searches: true, replacesFile: false })
  })
})
