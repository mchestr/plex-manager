/**
 * 04 Guess's selection (design 4.3, D7): the options, their order and when
 * the page omits itself.
 */

import { fixtureIssue, type FixtureIssue } from "@/lib/rewind/__tests__/helpers/fixture-issue"
import { guessPage, seededShuffle } from "@/lib/rewind/pages/guess"
import type { SelectContext } from "@/lib/rewind/registry"
import type { RewindFactsV3 } from "@/lib/wrapped/facts/catalogue"
import { play, statsContext } from "@/lib/wrapped/stats/__tests__/build-events"
import { computeTitles } from "@/lib/wrapped/stats/titles"

jest.mock("server-only", () => ({}))

let base: FixtureIssue

beforeAll(async () => {
  base = await fixtureIssue("median")
})

const ctx = statsContext("UTC")
const ep = (day: number, series: string, minutes: number) =>
  play({ at: `2026-03-${String(day).padStart(2, "0")}T20:00`, zone: "UTC", series, season: 1, episode: day, seconds: minutes * 60 })
const film = (day: number, key: string, minutes: number) => play({ at: `2026-04-${String(day).padStart(2, "0")}T20:00`, zone: "UTC", film: key, seconds: minutes * 60 })

/** The median fixture's context with its titles rebuilt from `events`, and a gap fact when the stats have a quiz. */
function select(events: ReturnType<typeof play>[], userId = "member-1") {
  const titles = computeTitles(events, ctx, () => undefined)
  const facts: RewindFactsV3 = { ...base.facts }
  delete facts["quiz.gapMinutes"]
  if (titles.quiz) facts["quiz.gapMinutes"] = { value: titles.quiz.gapMinutes, display: `${titles.quiz.gapMinutes} minutes`, unit: "duration" }
  const selectCtx: SelectContext = { edition: "full", archetype: null, disabledPages: [], stats: { ...base.stats, titles }, userId }
  return guessPage.select(facts, selectCtx)
}

describe("04 Guess select", () => {
  it("is null with only 2 candidates", () => {
    expect(select([ep(1, "1", 300), ep(2, "2", 100)])).toBeNull()
  })

  it("is null when No. 1 leads No. 2 by 2% or less, and kept above it", () => {
    const race = (gap: number) => [ep(1, "1", 1000), ep(2, "2", 1000 - gap), ep(3, "3", 100)]
    expect(select(race(20))).toBeNull()
    expect(select(race(21))).not.toBeNull()
  })

  it("offers 3 options for exactly 3 series, ranked by minutes", () => {
    const data = select([ep(1, "1", 300), ep(2, "2", 200), ep(3, "3", 100)])!
    expect(data.kind).toBe("series")
    expect(data.options).toHaveLength(3)
    expect([...data.options].sort((a, b) => a.rank - b.rank).map((o) => [o.key, o.title, o.minutes])).toEqual([
      ["series:1", "Series 1", "series[1].minutes"],
      ["series:2", "Series 2", "series[2].minutes"],
      ["series:3", "Series 3", "series[3].minutes"],
    ])
  })

  it("asks about films and series together with fewer than 3 series", () => {
    const data = select([ep(1, "1", 300), film(1, "77", 400), ep(2, "2", 100)])!
    expect(data.kind).toBe("mixed")
    expect(data.options.find((o) => o.rank === 1)).toMatchObject({ key: "film:77", title: "Film 77", minutes: "films[1].minutes" })
  })

  it("offers the top 4 of more series", () => {
    const data = select([1, 2, 3, 4, 5].map((n) => ep(n, String(n), 600 - n * 100)))!
    expect(data.options.map((o) => o.rank).sort()).toEqual([1, 2, 3, 4])
  })

  it("keeps one order per member and year, and passes the schema", () => {
    const events = [1, 2, 3, 4].map((n) => ep(n, String(n), 600 - n * 100))
    const first = select(events)!
    expect(select(events)!.options).toEqual(first.options)
    expect(guessPage.schema.safeParse(first).success).toBe(true)
    const orders = new Set(["a", "b", "c", "d", "e", "f"].map((id) => select(events, id)!.options.map((o) => o.rank).join("")))
    expect(orders.size).toBeGreaterThan(1)
  })
})

describe("seededShuffle", () => {
  it("is a stable permutation for a seed", () => {
    const items = [1, 2, 3, 4]
    expect(seededShuffle(items, "u:2026")).toEqual(seededShuffle(items, "u:2026"))
    expect([...seededShuffle(items, "u:2026")].sort()).toEqual(items)
  })
})
