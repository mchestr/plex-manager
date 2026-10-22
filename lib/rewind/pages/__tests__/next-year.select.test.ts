/**
 * 17 Next year's selection (design 4.3, 13.3): omitted with three empty
 * lists, and the picks and returning parts cut on their own.
 */

import { FIXTURE_IDS, fixtureIssue, type FixtureIssue } from "@/lib/rewind/__tests__/helpers/fixture-issue"
import { NEXT_YEAR_PARTS, nextYearPage, pickReason } from "@/lib/rewind/pages/next-year"
import { NextYearDataSchema } from "@/lib/rewind/pages/next-year.schema"
import { renderCopyText } from "@/lib/wrapped/copy/render-copy"
import type { NextYearStats } from "@/lib/wrapped/stats/next-year"

import { factsFor, FORBIDDEN_KEY, keysOf, selectContext } from "./helpers/server-act"

jest.mock("server-only", () => ({}))

const issues: Record<string, FixtureIssue> = {}

beforeAll(async () => {
  for (const id of FIXTURE_IDS) issues[id] = await fixtureIssue(id)
})

const FULL: NextYearStats = {
  eligible: true,
  leftForLater: [{ key: "series:77", title: "Severance", season: 2, episode: 6, lastWatched: "2026-09-02" }],
  returning: [{ key: "series:88", title: "Slow Horses", season: 5, date: "2027-01-16", tmdbId: 95480 }],
  picks: [
    { ratingKey: "5114", kind: "film", title: "Arrival", year: 2016, genre: "Drama", person: null },
    { ratingKey: "5115", kind: "series", title: "Dark", year: null, genre: "Drama", person: "Amy Adams" },
  ],
}

function selectWith(nextYear: NextYearStats, disabledPages: string[] = []) {
  const base = issues.heavy
  const people = { eligible: true as const, coverage: 1, actors: [{ name: "Amy Adams", minutes: 300 }], directors: [] }
  const stats = { ...base.stats, nextYear, people }
  const facts = factsFor(stats)
  return { facts, data: nextYearPage.select(facts, selectContext(base, { stats, disabledPages })) }
}

describe("17 Next year select", () => {
  it.each(FIXTURE_IDS)("%s: returns valid data or null", (id) => {
    const issue = issues[id]
    const data = nextYearPage.select(issue.facts, selectContext(issue))
    expect(data !== null).toBe(issue.stats.nextYear.leftForLater.length + issue.stats.nextYear.picks.length > 0)
    if (data) {
      expect(NextYearDataSchema.safeParse(data).success).toBe(true)
      expect(keysOf(data).filter((key) => FORBIDDEN_KEY.test(key))).toEqual([])
    }
  })

  it("is null with three empty lists", () => {
    expect(selectWith({ eligible: false, leftForLater: [], returning: null, picks: [] }).data).toBeNull()
    expect(selectWith({ eligible: false, leftForLater: [], returning: [], picks: [] }).data).toBeNull()
  })

  it("keeps all three parts, with a template reason for each pick", () => {
    const { facts, data } = selectWith(FULL)
    expect(data).toEqual({
      leftForLater: [{ key: "series:77", season: 2, episode: 6, lastWatched: "2026-09-02" }],
      returning: [{ key: "series:88", season: 5, tmdbId: 95480 }],
      picks: [
        { ratingKey: "5114", kind: "film", year: 2016, because: "taste.genre[1].name" },
        { ratingKey: "5115", kind: "series", year: null, because: "people.actor[1].name" },
      ],
    })
    expect(facts["next.returning[1].date"]?.display).toBe("January\u00A016")
    expect(renderCopyText(pickReason(data!.picks[1].because), facts)).toBe("Because you watched Amy Adams")
  })

  it("drops only the picks with next-year.picks, and only the returning seasons with next-year.returning", () => {
    const picksCut = selectWith(FULL, [NEXT_YEAR_PARTS.picks]).data!
    expect(picksCut.picks).toEqual([])
    expect(picksCut.leftForLater).toHaveLength(1)
    expect(picksCut.returning).toHaveLength(1)

    const returningCut = selectWith(FULL, [NEXT_YEAR_PARTS.returning]).data!
    expect(returningCut.returning).toEqual([])
    expect(returningCut.picks).toHaveLength(2)
  })

  it("is null when the cut parts were all it had", () => {
    const heavy = issues.heavy
    expect(nextYearPage.select(heavy.facts, selectContext(heavy))!.picks).toHaveLength(1)
    expect(nextYearPage.select(heavy.facts, selectContext(heavy, { disabledPages: [NEXT_YEAR_PARTS.picks] }))).toBeNull()
  })

  it("prints no share card", () => {
    expect(nextYearPage.share.facts).toEqual([])
  })
})
