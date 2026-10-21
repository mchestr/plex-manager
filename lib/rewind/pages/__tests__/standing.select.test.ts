/**
 * 15 Standing's selection (design 4.3, FR-37): 5 members who pressed play,
 * community facts only with 3 or more contributors, and nothing that names
 * another member.
 */

import { FIXTURE_IDS, fixtureIssue, type FixtureIssue } from "@/lib/rewind/__tests__/helpers/fixture-issue"
import { standingPage } from "@/lib/rewind/pages/standing"
import { StandingDataSchema } from "@/lib/rewind/pages/standing.schema"
import type { CommunityFacts } from "@/lib/wrapped/aggregate/schema"
import { play, statsContext } from "@/lib/wrapped/stats/__tests__/build-events"
import { computeCommunity } from "@/lib/wrapped/stats/community"

import { factsFor, FORBIDDEN_KEY, keysOf, selectContext } from "./helpers/server-act"

jest.mock("server-only", () => ({}))

const issues: Record<string, FixtureIssue> = {}

beforeAll(async () => {
  for (const id of FIXTURE_IDS) issues[id] = await fixtureIssue(id)
})

const EMPTY: CommunityFacts = { hours: null, topSeries: null, busiestNight: null, peakConcurrent: null, requestsFulfilled: null, titlesAdded: { total: 0, films: 0, series: 0 } }

/** The median member on a server of `others` other members (minutes 100, 200, ...) with these community facts. */
function selectWith(others: number, community: Partial<CommunityFacts> = {}) {
  const base = issues.median
  const events = [play({ at: "2026-03-02T20:00", zone: "UTC", film: "1", seconds: 250 * 60 })]
  const members = [{ userId: "me", minutes: 250 }, ...Array.from({ length: others }, (_, i) => ({ userId: `other-${i}`, minutes: (i + 1) * 100 }))]
  const view = { userId: "me", aggregate: { members, titles: {}, community: { ...EMPTY, ...community } } }
  const stats = { ...base.stats, community: computeCommunity(events, statsContext("UTC"), view) }
  const facts = factsFor(stats)
  return { facts, data: standingPage.select(facts, selectContext(base, { stats })) }
}

describe("15 Standing select", () => {
  it.each(FIXTURE_IDS)("%s: returns valid data or null, naming nobody", (id) => {
    const issue = issues[id]
    const data = standingPage.select(issue.facts, selectContext(issue))
    expect(data !== null).toBe(issue.stats.community.eligible && issue.stats.community.standing !== null)
    if (data) {
      expect(StandingDataSchema.safeParse(data).success).toBe(true)
      expect(keysOf(data).filter((key) => FORBIDDEN_KEY.test(key))).toEqual([])
      expect(JSON.stringify(data)).not.toMatch(/other-|userId/)
    }
  })

  it("is null on solo-server and below 5 members who pressed play", () => {
    const solo = issues["solo-server"]
    expect(standingPage.select(solo.facts, selectContext(solo))).toBeNull()
    expect(selectWith(3).data).toBeNull()
    expect(selectWith(4).data).toEqual({ rank: 3, community: [] })
  })

  it("prints community facts only with 3 or more contributors, and titles added above 0", () => {
    const { data } = selectWith(5, {
      hours: { value: 21_400, contributors: 2 },
      peakConcurrent: { value: 7, at: 0, contributors: 3 },
      busiestNight: { day: "2026-12-24", minutes: 900, contributors: 4 },
      titlesAdded: { total: 0, films: 0, series: 0 },
    })
    expect(data!.community).toEqual(["community.busiestNight", "community.peakConcurrent"])
    expect(selectWith(5, { titlesAdded: { total: 640, films: 400, series: 240 } }).data!.community).toEqual(["community.titlesAdded"])
  })

  it("shares only the percentile", () => {
    expect(standingPage.share.facts).toEqual(["standing.percentile"])
  })
})
