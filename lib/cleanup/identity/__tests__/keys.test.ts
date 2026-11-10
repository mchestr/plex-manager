/** @jest-environment node */
/** Title keys, item keys, test id keys and `cascadeWhere()` (TS 5.4, 7.4). */

import { cascadeWhere, type CascadeWhere, hasExternalId, ID_ORDER, itemKey, seasonItemKey, testIdKey, titleKey } from "@/lib/cleanup/identity/keys"
import type { Level } from "@/lib/validations/cleanup-vocabulary"

describe("titleKey", () => {
  it.each([
    ["movie", { tmdb: 278, imdb: "tt0111161" }, "tmdb:278"],
    ["movie", { imdb: "tt0111161", tvdb: 5 }, "imdb:tt0111161"],
    ["movie", { tvdb: 5 }, "rk:5001"],
    ["show", { tvdb: 121361, tmdb: 1399, imdb: "tt0944947" }, "tvdb:121361"],
    ["show", { tmdb: 1399, imdb: "tt0944947" }, "tmdb:1399"],
    ["show", { imdb: "tt0944947" }, "imdb:tt0944947"],
    ["show", { plex: "plex://show/abc" }, "rk:5001"],
  ] as const)("gives a %s with %j the key %s", (level, ids, expected) => {
    expect(titleKey(level, ids, "5001")).toBe(expected)
  })

  it("keeps the key order of each level", () => {
    expect(ID_ORDER).toEqual({ movie: ["tmdb", "imdb"], show: ["tvdb", "tmdb", "imdb"] })
  })
})

describe("hasExternalId", () => {
  it.each([
    [{ tmdb: 1 }, true],
    [{ tvdb: 1 }, true],
    [{ imdb: "tt1" }, true],
    [{ plex: "plex://movie/a" }, false],
    [{}, false],
  ])("says %j is %s", (ids, expected) => {
    expect(hasExternalId(ids)).toBe(expected)
  })
})

describe("item keys", () => {
  it("builds movie, show and season keys", () => {
    expect(itemKey("movie", "tmdb:1")).toBe("movie:tmdb:1")
    expect(itemKey("show", "tvdb:9")).toBe("show:tvdb:9")
    expect(seasonItemKey("tvdb:9", 4)).toBe("season:tvdb:9:4")
  })

  it("gives the test id form", () => {
    expect(testIdKey("season:tvdb:9:4")).toBe("season-tvdb-9-4")
  })
})

interface Row {
  itemKey: string
  level: Level
  titleKey: string
}

/** The rows a Prisma `where` of `cascadeWhere()` selects, evaluated in memory. */
function select(rows: readonly Row[], where: CascadeWhere): string[] {
  const matches = (row: Row, w: CascadeWhere | { level: "season"; titleKey: string }): boolean => {
    if ("OR" in w) return w.OR.some((branch) => matches(row, branch))
    if ("level" in w) return row.level === w.level && row.titleKey === w.titleKey
    return typeof w.itemKey === "string" ? row.itemKey === w.itemKey : w.itemKey.in.includes(row.itemKey)
  }
  return rows.filter((row) => matches(row, where)).map((row) => row.itemKey)
}

describe("cascadeWhere", () => {
  // A movie and a show that share TMDB id 500: the show has no TVDB id, so both title keys are tmdb:500.
  const rows: Row[] = [
    { itemKey: "movie:tmdb:500", level: "movie", titleKey: "tmdb:500" },
    { itemKey: "show:tmdb:500", level: "show", titleKey: "tmdb:500" },
    { itemKey: "season:tmdb:500:1", level: "season", titleKey: "tmdb:500" },
    { itemKey: "season:tmdb:500:2", level: "season", titleKey: "tmdb:500" },
    { itemKey: "show:tvdb:9", level: "show", titleKey: "tvdb:9" },
    { itemKey: "season:tvdb:9:1", level: "season", titleKey: "tvdb:9" },
  ]

  it("gives the three forms of TS 5.4", () => {
    expect(cascadeWhere({ level: "movie", itemKey: "movie:tmdb:1", titleKey: "tmdb:1" })).toEqual({ itemKey: "movie:tmdb:1" })
    expect(cascadeWhere({ level: "show", itemKey: "show:tvdb:9", titleKey: "tvdb:9" })).toEqual({
      OR: [{ itemKey: "show:tvdb:9" }, { level: "season", titleKey: "tvdb:9" }],
    })
    expect(cascadeWhere({ level: "season", itemKey: "season:tvdb:9:4", titleKey: "tvdb:9" })).toEqual({
      itemKey: { in: ["season:tvdb:9:4", "show:tvdb:9"] },
    })
  })

  it("keeps the show rows out of the cascade of a movie with the same TMDB id", () => {
    expect(select(rows, cascadeWhere({ level: "movie", itemKey: "movie:tmdb:500", titleKey: "tmdb:500" }))).toEqual(["movie:tmdb:500"])
  })

  it("gives a show and every season of it, and never the movie with its TMDB id", () => {
    expect(select(rows, cascadeWhere({ level: "show", itemKey: "show:tmdb:500", titleKey: "tmdb:500" }))).toEqual([
      "show:tmdb:500", "season:tmdb:500:1", "season:tmdb:500:2",
    ])
  })

  it("gives a season and its show", () => {
    expect(select(rows, cascadeWhere({ level: "season", itemKey: "season:tvdb:9:1", titleKey: "tvdb:9" }))).toEqual(["show:tvdb:9", "season:tvdb:9:1"])
  })
})
