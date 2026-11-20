/** The Results list (TS 10.6 steps 4 and 5): each sort with its ties and unknowns, the chip, the search and the page bounds. */

import { buildMovieItem, daysAgo } from "@/lib/cleanup/__tests__/helpers/builders"
import type { Classification } from "@/lib/cleanup/engine/types"
import { type Evaluated, largestMatches, pageOf, tabEntries } from "@/lib/cleanup/preview/results"
import { GiB } from "@/lib/validations/cleanup-vocabulary"

function entry(key: number, title: string, overrides: { size?: number | null; played?: number | null | "unknown"; classification?: Classification; gap?: number | null } = {}): Evaluated {
  const played = overrides.played === undefined ? 10 : overrides.played
  const plays = played === "unknown" ? null : { lastCountedAt: played === null ? null : daysAgo(played), countedAt: [], viewers: [] }
  const item = buildMovieItem({ key: `movie:tmdb:${key}`, title, sizeBytes: overrides.size === undefined ? key * GiB : overrides.size, plays })
  const result = { item, clauses: [], members: {}, protections: [], match: item.match }
  const e: Evaluated = { result, classification: overrides.classification ?? { class: "match" } }
  if (overrides.gap !== undefined) e.gap = overrides.gap
  return e
}

const keys = (list: Evaluated[]) => list.map((e) => e.result.item.key.replace("movie:tmdb:", ""))

describe("pageOf", () => {
  it("sorts the largest first with an unknown size last, and ties by title then key", () => {
    const list = [entry(1, "B"), entry(2, "A", { size: 5 * GiB }), entry(3, "A", { size: 5 * GiB }), entry(4, "C", { size: null }), entry(9, "Z")]
    expect(keys(pageOf(list, { sort: "largest", page: 1 }).rows)).toEqual(["9", "2", "3", "1", "4"])
  })

  it("sorts the closest first with no gap last", () => {
    const list = [entry(1, "A", { gap: 30 }), entry(2, "B"), entry(3, "C", { gap: 2 }), entry(4, "D", { gap: null })]
    expect(keys(pageOf(list, { sort: "closest", page: 1 }).rows)).toEqual(["3", "1", "2", "4"])
  })

  it("sorts never played first, then the oldest play, and an unknown history last", () => {
    const list = [entry(1, "A", { played: 5 }), entry(2, "B", { played: "unknown" }), entry(3, "C", { played: null }), entry(4, "D", { played: 500 }), entry(5, "E", { played: null })]
    expect(keys(pageOf(list, { sort: "oldestPlay", page: 1 }).rows)).toEqual(["3", "5", "4", "1", "2"])
  })

  it("keeps the page inside 1 and the page count", () => {
    const list = Array.from({ length: 120 }, (_, i) => entry(i + 1, `T${i}`))
    expect(pageOf([...list], { sort: "title", page: 3 })).toMatchObject({ page: 3, pageCount: 3, total: 120 })
    expect(pageOf([...list], { sort: "title", page: 3 }).rows).toHaveLength(20)
    expect(pageOf([...list], { sort: "title", page: 0 }).page).toBe(1)
    expect(pageOf([], { sort: "title", page: 5 })).toMatchObject({ page: 1, pageCount: 1, total: 0, rows: [] })
  })
})

describe("tabEntries and largestMatches", () => {
  const list = [
    entry(1, "Big Match"),
    entry(2, "Near one", { classification: { class: "nearMiss", failing: "c1" } }),
    entry(3, "Near two", { classification: { class: "nearMiss", failing: "c2" } }),
    entry(4, "Kept", { classification: { class: "protected" } }),
  ]

  it("filters by tab, then by the chip on the Near misses tab only, then by a title search", () => {
    expect(keys(tabEntries(list, { tab: "nearMisses" }))).toEqual(["2", "3"])
    expect(keys(tabEntries(list, { tab: "nearMisses", nearMissCondition: "c2" }))).toEqual(["3"])
    expect(keys(tabEntries(list, { tab: "matches", nearMissCondition: "c2" }))).toEqual(["1"])
    expect(keys(tabEntries(list, { tab: "nearMisses", search: "  ONE " }))).toEqual(["2"])
    expect(keys(tabEntries(list, { tab: "protected", search: "" }))).toEqual(["4"])
  })

  it("takes the largest matches only", () => {
    expect(keys(largestMatches(list, 4))).toEqual(["1"])
  })
})
