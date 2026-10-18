/**
 * Key-snapshot test for the public share projection (RWP-01, SEC-16).
 *
 * Every fixture is projected and its key paths are checked against the
 * allow-list. Rows stored before October 2026 hold leaderboards, server
 * stats, the internal user ID and sometimes the owner's email as the name;
 * none of that may come out.
 */

import { assembleWrappedData } from "@/lib/wrapped/assemble-wrapped"
import { ShareSafeRewindV2, toShareSafeV2 } from "@/lib/wrapped/data/share-safe-v2"
import {
  buildLeaderboards,
  buildStatistics,
  buildValidOutput,
  LEADERBOARD_MEMBER_EMAIL,
} from "@/lib/wrapped/__tests__/fixtures"

const OWNER_EMAIL = "owner.private@example.com"
const FORBIDDEN_KEY = /leaderboard|email|userId|plexUserId|tautulli|serverStats|totalServerRequests/i

/** Every key path in a value, with array indices written as `[]`. */
function keyPaths(value: unknown, prefix = ""): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => keyPaths(item, `${prefix}[]`))
  }
  if (value !== null && typeof value === "object") {
    return Object.entries(value).flatMap(([key, child]) => {
      const path = prefix ? `${prefix}.${key}` : key
      return [path, ...keyPaths(child, path)]
    })
  }
  return []
}

function stringValues(value: unknown): string[] {
  if (typeof value === "string") return [value]
  if (Array.isArray(value)) return value.flatMap(stringValues)
  if (value !== null && typeof value === "object") return Object.values(value).flatMap(stringValues)
  return []
}

function v2Row() {
  const data = assembleWrappedData({
    output: buildValidOutput(),
    statistics: buildStatistics({
      topMovies: [
        { title: "Dune: Part Three", watchTime: 165, playCount: 1, year: 2026, rating: 8.5, ratingKey: "101" },
        { title: "The Odyssey", watchTime: 150, playCount: 1, year: 2026 },
      ],
      topShows: [
        { title: "Severance", watchTime: 900, playCount: 18, episodesWatched: 18, year: 2022, ratingKey: "202" },
      ],
    }),
    userId: "user-1",
    userName: "Mike",
    year: 2026,
  })
  return {
    year: 2026,
    summary: data.summary ?? null,
    archetype: data.archetype?.name ?? null,
    data: JSON.stringify(data),
  }
}

function v1Row() {
  return {
    year: 2024,
    summary: "A big year of movies.",
    archetype: null,
    data: JSON.stringify({
      year: 2024,
      userId: "user-1",
      userName: "Mike",
      generatedAt: "2024-12-01T00:00:00.000Z",
      statistics: {
        totalWatchTime: { total: 1000, movies: 600, shows: 400 },
        moviesWatched: 10,
        showsWatched: 5,
        episodesWatched: 20,
        topMovies: [{ title: "Test Movie", watchTime: 120, playCount: 1 }],
        topShows: [{ title: "Test Show", watchTime: 200, playCount: 2, episodesWatched: 4 }],
        watchTimeByMonth: [{ month: 3, monthName: "March", watchTime: 300 }],
      },
      sections: [{ id: "hero", type: "hero", title: "Your 2024 Wrapped", content: "Hi", animationDelay: 0 }],
      insights: { personality: "Movie Buff", topGenre: "Action", bingeWatcher: false, discoveryScore: 80, funFacts: [] },
      metadata: { totalSections: 1, generationTime: 5 },
    }),
  }
}

/** A row as generation wrote it before October 2026. */
function legacyRowWithRoster() {
  const statistics = {
    ...buildStatistics(),
    leaderboards: buildLeaderboards(),
    serverStats: {
      serverName: "Mike's Plex",
      totalStorage: 1e12,
      totalStorageFormatted: "1 TB",
      librarySize: { movies: 100, shows: 50, episodes: 500 },
    },
    overseerrStats: {
      totalRequests: 3,
      totalServerRequests: 90,
      approvedRequests: 2,
      pendingRequests: 1,
      topRequestedGenres: [{ genre: "Drama", count: 2 }],
    },
    watchTimeByMonth: [
      {
        month: 1,
        monthName: "January",
        watchTime: 5040,
        topMovie: { title: "The Odyssey", watchTime: 150, playCount: 1 },
      },
    ],
  }
  return {
    year: 2025,
    summary: "42 days watched.",
    archetype: "The Midnight Marathoner",
    data: JSON.stringify({
      version: 2,
      year: 2025,
      userId: "user-1",
      userName: OWNER_EMAIL,
      statistics,
      sections: [{ id: "percentile", type: "percentile", title: "x", content: "y", data: { serverName: "Mike's Plex" } }],
      insights: { personality: "p", topGenre: "g", bingeWatcher: true, discoveryScore: 1, funFacts: [] },
      metadata: { totalSections: 1, generationTime: 1 },
    }),
  }
}

const FIXTURES = [
  ["a v2 row from the shared fixtures", v2Row, { name: "Mike" }],
  ["a v1 row", v1Row, { name: "Mike" }],
  ["a legacy row with leaderboards and an email userName", legacyRowWithRoster, { name: OWNER_EMAIL }],
  ["a legacy row whose owner has no name", legacyRowWithRoster, { name: null }],
] as const

describe("toShareSafeV2", () => {
  it.each(FIXTURES)("projects %s with allow-listed keys only", (_label, row, owner) => {
    const shared = toShareSafeV2(row(), owner)

    const paths = keyPaths(shared)
    expect(paths.filter((path) => FORBIDDEN_KEY.test(path))).toEqual([])

    const strings = stringValues(shared)
    for (const secret of [OWNER_EMAIL, LEADERBOARD_MEMBER_EMAIL, "Jon Snow", "Alice Smith", "asmith", "user-1"]) {
      expect(strings.filter((value) => value.includes(secret))).toEqual([])
    }
    expect(JSON.stringify(shared)).not.toMatch(/leaderboard/i)
  })

  it("matches the key snapshot for a full v2 row", () => {
    const shared = toShareSafeV2(v2Row(), { name: "Mike" })

    expect([...new Set(keyPaths(shared))].sort()).toEqual(
      [
        "year",
        "ownerName",
        "summary",
        "archetypeName",
        "totals",
        "totals.minutes",
        "totals.movies",
        "totals.shows",
        "totals.episodes",
        "months",
        "months[].month",
        "months[].minutes",
        "topMovies",
        "topMovies[].title",
        "topMovies[].year",
        "topMovies[].minutes",
        "topMovies[].plays",
        "topMovies[].ratingKey",
        "topShows",
        "topShows[].title",
        "topShows[].year",
        "topShows[].minutes",
        "topShows[].plays",
        "topShows[].episodes",
        "topShows[].ratingKey",
      ].sort()
    )
  })

  it("maps the owner's own numbers", () => {
    const shared = toShareSafeV2(v2Row(), { name: "  Mike " })

    expect(shared).toEqual({
      year: 2026,
      ownerName: "Mike",
      summary: "42 days watched, 85 films, Top 5% of the server.",
      archetypeName: "The Midnight Marathoner",
      totals: { minutes: 60480, movies: 85, shows: 23, episodes: 412 },
      months: [
        { month: 1, minutes: 5040 },
        { month: 2, minutes: 4200 },
      ],
      topMovies: [
        { title: "Dune: Part Three", year: 2026, minutes: 165, plays: 1, ratingKey: "101" },
        { title: "The Odyssey", year: 2026, minutes: 150, plays: 1 },
      ],
      topShows: [{ title: "Severance", year: 2022, minutes: 900, plays: 18, episodes: 18, ratingKey: "202" }],
    })
  })

  it.each([
    ["a null name", null],
    ["an empty name", "  "],
    ["an email used as the name", OWNER_EMAIL],
  ])("names the owner \"Someone\" for %s", (_label, name) => {
    expect(toShareSafeV2(v1Row(), { name }).ownerName).toBe("Someone")
  })

  it("keeps at most five titles per list", () => {
    const titles = Array.from({ length: 7 }, (_, i) => ({ title: `Title ${i}`, watchTime: 70 - i, playCount: 1, episodesWatched: 1 }))
    const shared = toShareSafeV2(
      { year: 2026, summary: null, archetype: null, data: JSON.stringify({ statistics: { topMovies: titles, topShows: titles } }) },
      { name: "Mike" }
    )

    expect(shared.topMovies.map((movie) => movie.title)).toEqual(["Title 0", "Title 1", "Title 2", "Title 3", "Title 4"])
    expect(shared.topShows).toHaveLength(5)
  })

  it("keeps the first entry per month when a stored list repeats months", () => {
    const months = [
      ...Array.from({ length: 12 }, (_, i) => ({ month: i + 1, monthName: "m", watchTime: 100 + i })),
      { month: 3, monthName: "March", watchTime: 9999 },
      { month: 12, monthName: "December", watchTime: 9999 },
    ]
    const shared = toShareSafeV2(
      { year: 2026, summary: null, archetype: null, data: JSON.stringify({ statistics: { watchTimeByMonth: months } }) },
      { name: "Mike" }
    )

    expect(shared.months).toHaveLength(12)
    expect(shared.months.map((month) => month.month)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
    expect(shared.months.find((month) => month.month === 3)).toEqual({ month: 3, minutes: 102 })
    expect(keyPaths(shared).filter((path) => FORBIDDEN_KEY.test(path))).toEqual([])
  })

  it("reads missing or malformed statistics as zeros and drops bad titles", () => {
    const shared = toShareSafeV2(
      {
        year: 2026,
        summary: null,
        archetype: null,
        data: JSON.stringify({
          statistics: {
            totalWatchTime: "lots",
            topMovies: [{ title: "Good", watchTime: 10, playCount: 1, year: "2001" }, { watchTime: 5 }],
            watchTimeByMonth: [{ month: 13, watchTime: 1 }],
          },
        }),
      },
      { name: "Mike" }
    )

    expect(shared.totals).toEqual({ minutes: 0, movies: 0, shows: 0, episodes: 0 })
    expect(shared.topMovies).toEqual([{ title: "Good", year: 2001, minutes: 10, plays: 1 }])
    expect(shared.months).toEqual([])
  })

  it("matches the JSDoc example", () => {
    const shared = toShareSafeV2(
      { year: 2026, summary: null, archetype: null, data: JSON.stringify({ statistics: { moviesWatched: 3 } }) },
      { name: "mike@example.com" }
    )

    expect(shared.ownerName).toBe("Someone")
    expect(shared.totals.movies).toBe(3)
  })
})

describe("ShareSafeRewindV2", () => {
  const valid = toShareSafeV2(v2Row(), { name: "Mike" })

  it("accepts a projection", () => {
    expect(ShareSafeRewindV2.safeParse(valid).success).toBe(true)
  })

  it("rejects an extra key at the top level", () => {
    expect(ShareSafeRewindV2.safeParse({ ...valid, leaderboards: {} }).success).toBe(false)
  })

  it("rejects an extra key in a nested object", () => {
    expect(ShareSafeRewindV2.safeParse({ ...valid, totals: { ...valid.totals, serverRequests: 1 } }).success).toBe(false)
    expect(
      ShareSafeRewindV2.safeParse({
        ...valid,
        topMovies: [{ ...valid.topMovies[0], leaderboard: [] }],
      }).success
    ).toBe(false)
    expect(
      ShareSafeRewindV2.safeParse({ ...valid, months: [{ month: 1, minutes: 1, topMovie: { title: "x" } }] }).success
    ).toBe(false)
  })
})
