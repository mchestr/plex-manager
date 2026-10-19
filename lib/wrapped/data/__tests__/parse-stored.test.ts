/**
 * The versioned stored-data parser (RWP-21): every stored shape returns a
 * typed result and none throws.
 */

import { legacyWrappedData, parseStoredRewind } from "@/lib/wrapped/data/parse-stored"
import { buildLeaderboards } from "@/lib/wrapped/__tests__/fixtures"

import storedV1 from "./fixtures/stored-v1.json"
import storedV2 from "./fixtures/stored-v2.json"
import { minimalV3 } from "./v3-row"

describe("parseStoredRewind", () => {
  it("reads a stored v1 row as version 1", () => {
    const stored = parseStoredRewind(JSON.stringify(storedV1))

    if (stored.version !== 1) throw new Error(`expected v1, got ${JSON.stringify(stored)}`)
    expect(stored.legacy.year).toBe(2024)
    expect(stored.legacy.sections.map((section) => section.type)).toEqual(["hero", "top-movies", "fun-facts", "insights"])
    expect(stored.legacy.sections[0]).toMatchObject({ animationDelay: 0, data: { prominentStat: { value: 1008 } } })
    expect(stored.legacy.statistics.longestBinge).toEqual({ title: "Severance", duration: 300, date: "2024-03-02" })
  })

  it("reads a stored v2 row as version 2, keeping everything the viewer reads", () => {
    const stored = parseStoredRewind(JSON.stringify(storedV2))

    if (stored.version !== 2) throw new Error(`expected v2, got ${JSON.stringify(stored)}`)
    // Nothing the v2 viewer reads is lost or changed
    expect(stored.legacy).toEqual(storedV2)
  })

  it("drops leaderboards from a row the privacy clean-up has not reached", () => {
    const withRoster = { ...storedV2, statistics: { ...storedV2.statistics, leaderboards: buildLeaderboards() } }

    const stored = parseStoredRewind(JSON.stringify(withRoster))

    if (stored.version !== 2) throw new Error("expected v2")
    expect(stored.legacy.statistics).not.toHaveProperty("leaderboards")
  })

  it("reads a minimal v3 row as version 3", () => {
    const stored = parseStoredRewind(JSON.stringify(minimalV3()))

    expect(stored).toEqual({ version: 3, data: minimalV3() })
  })

  it.each([
    ["malformed JSON", '{"version": 2, "statistics": ', "not JSON"],
    ["an unknown version", JSON.stringify({ version: 9, statistics: {} }), "unknown version 9"],
    ["a non-numeric version", JSON.stringify({ version: "2", statistics: {} }), "unknown version string"],
    ["a JSON array", "[]", "not an object"],
    ["a JSON string", '"hello"', "not an object"],
    ["an empty column", null, "no data"],
  ])("returns invalid for %s", (_label, data, reason) => {
    expect(parseStoredRewind(data)).toEqual({ version: "invalid", reason })
  })

  it("reads the '{}' placeholder written while generating as an empty v1 Rewind", () => {
    const stored = parseStoredRewind("{}")

    if (stored.version !== 1) throw new Error("expected v1")
    expect(stored.legacy).toMatchObject({ year: 0, sections: [], statistics: { moviesWatched: 0, topMovies: [], topShows: [] } })
  })

  it("reads a non-object statistics value as zeros", () => {
    const stored = parseStoredRewind(JSON.stringify({ version: 2, statistics: "lots" }))

    if (stored.version !== 2) throw new Error("expected v2")
    expect(stored.legacy.statistics.totalWatchTime).toEqual({ total: 0, movies: 0, shows: 0 })
  })

  it("returns invalid for a v3 row that fails its schema, naming paths only", () => {
    const stored = parseStoredRewind(JSON.stringify({ ...minimalV3(), edition: "secret-value" }))

    if (stored.version !== "invalid") throw new Error("expected invalid")
    expect(stored.reason).toMatch(/^v3: edition: /)
    expect(stored.reason).not.toContain("secret-value")
  })

  it("reads malformed legacy fields as zeros or absent instead of failing", () => {
    const stored = parseStoredRewind(
      JSON.stringify({
        version: 2,
        statistics: {
          totalWatchTime: "lots",
          moviesWatched: -4,
          topMovies: [{ title: "Good", watchTime: 10, playCount: 1, year: "2001", ratingKey: 77 }, { watchTime: 5 }],
          watchTimeByMonth: [{ month: 13, watchTime: 1 }, { month: 2, watchTime: 30 }],
          derived: { longestStreak: "long" },
        },
        sections: [{ id: "x", type: "not-a-section" }, { id: "hero", type: "hero", content: "Hi" }],
        insights: null,
      })
    )

    if (stored.version !== 2) throw new Error("expected v2")
    const { statistics, sections, insights } = stored.legacy
    expect(statistics.totalWatchTime).toEqual({ total: 0, movies: 0, shows: 0 })
    expect(statistics.moviesWatched).toBe(0)
    expect(statistics.topMovies).toEqual([{ title: "Good", watchTime: 10, playCount: 1, year: 2001, ratingKey: "77" }])
    expect(statistics.watchTimeByMonth).toEqual([{ month: 2, monthName: "", watchTime: 30 }])
    expect(statistics.derived).toBeUndefined()
    expect(sections).toEqual([{ id: "hero", type: "hero", title: "", content: "Hi" }])
    expect(insights).toEqual({ personality: "", topGenre: "", bingeWatcher: false, discoveryScore: 0, funFacts: [] })
  })

  it("matches the JSDoc examples", () => {
    const v2 = parseStoredRewind('{"version":2,"statistics":{"moviesWatched":3}}')
    if (v2.version !== 2) throw new Error("expected v2")
    expect(v2.legacy.statistics).toMatchObject({ moviesWatched: 3, topMovies: [] })

    expect(parseStoredRewind('{"version":9}')).toEqual({ version: "invalid", reason: "unknown version 9" })
  })
})

describe("legacyWrappedData", () => {
  it("returns the legacy data for v1 and v2 rows", () => {
    expect(legacyWrappedData({ id: "w1", data: JSON.stringify(storedV2) })).toEqual(storedV2)
    expect(legacyWrappedData({ id: "w1", data: JSON.stringify(storedV1) })?.year).toBe(2024)
  })

  it("returns null for a v3 row and for a row that does not parse", () => {
    expect(legacyWrappedData({ id: "w1", data: JSON.stringify(minimalV3()) })).toBeNull()
    expect(legacyWrappedData({ id: "w1", data: "not json" })).toBeNull()
    expect(legacyWrappedData({ id: "w1", data: null })).toBeNull()
  })
})
