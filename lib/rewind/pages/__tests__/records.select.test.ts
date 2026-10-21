/**
 * 12 Records' selection (design 4.3): valid data or null on every golden
 * fixture, the cells' minimums, the page rule and the record stamp.
 */

import { FIXTURE_IDS, fixtureIssue, type FixtureIssue } from "@/lib/rewind/__tests__/helpers/fixture-issue"
import { recordsPage } from "@/lib/rewind/pages/records"
import type { SelectContext } from "@/lib/rewind/registry"
import type { RewindFactsV3 } from "@/lib/wrapped/facts/catalogue"
import { play, statsContext } from "@/lib/wrapped/stats/__tests__/build-events"
import { computeSessions } from "@/lib/wrapped/stats/sessions"

jest.mock("server-only", () => ({}))

const issues = new Map<string, FixtureIssue>()

beforeAll(async () => {
  for (const id of FIXTURE_IDS) issues.set(id, await fixtureIssue(id))
})

const ctxOf = (issue: FixtureIssue, stats = issue.stats): SelectContext => ({ edition: "full", archetype: null, disabledPages: [], stats })
const count = (value: number) => ({ value, display: String(value), unit: "count" as const })

/** The heavy fixture's facts with no record cells, plus `extra`. */
function facts(extra: RewindFactsV3): RewindFactsV3 {
  const base = { ...issues.get("heavy")!.facts }
  for (const key of Object.keys(base)) if (key.startsWith("records.") || key.startsWith("days.biggestWeek") || key.startsWith("hours.latestStart")) delete base[key as keyof RewindFactsV3]
  return { ...base, ...extra }
}

const noPause = (issue: FixtureIssue) => ({ ...issue.stats, sessions: { ...issue.stats.sessions, mostPaused: null } })

describe("12 Records select", () => {
  it.each(FIXTURE_IDS)("%s: returns schema-valid data or null", (id) => {
    const issue = issues.get(id)!
    const data = recordsPage.select(issue.facts, ctxOf(issue))
    expect(data === null || recordsPage.schema.safeParse(data).success).toBe(true)
  })

  it("is null with 1 qualifying cell, and kept with 2", () => {
    const issue = issues.get("heavy")!
    const completion = { "records.completionShare": { value: 0.91, display: "91%", unit: "share" as const } }
    expect(recordsPage.select(facts(completion), ctxOf(issue, noPause(issue)))).toBeNull()
    expect(recordsPage.select(facts({ ...completion, "records.mostEpisodesDay": count(4) }), ctxOf(issue, noPause(issue)))).toMatchObject({ cells: ["day", "completion"] })
  })

  it("does not count a two-episode binge", () => {
    const ctx = statsContext("UTC")
    const two = [play({ at: "2026-03-01T20:00", zone: "UTC", series: "1", episode: 1 }), play({ at: "2026-03-01T20:40", zone: "UTC", series: "1", episode: 2 })]
    expect(computeSessions(two, ctx).longestBinge).toBeNull()

    const issue = issues.get("heavy")!
    const twoBinge = { "records.longestBinge.episodes": count(2), "records.longestBinge.title": { value: "Severance", display: "Severance", unit: "title" as const } }
    expect(recordsPage.select(facts({ ...twoBinge, "records.mostEpisodesDay": count(4) }), ctxOf(issue, noPause(issue)))).toBeNull()
  })

  it("fills the box in catalogue order, at most four cells", () => {
    const issue = issues.get("heavy")!
    const data = recordsPage.select(issue.facts, ctxOf(issue))!
    expect(data.cells).toEqual(["binge", "day", "week", "completion"])
    expect(data.bingeKey).toBe(issue.stats.sessions.longestBinge!.key)
  })

  it("stamps the cell furthest above its server median, and nothing without medians", () => {
    const issue = issues.get("heavy")!
    expect(recordsPage.select(issue.facts, ctxOf(issue))!.stamp).toBeNull()
    const withMedians: RewindFactsV3 = {
      ...issue.facts,
      "records.longestBinge.median": count(3),
      "records.mostEpisodesDay.median": count(2),
      "records.completionShare.median": { value: 0.8, display: "80%", unit: "share" },
    }
    // binge 4/3 = 1.33, day 8/2 = 4, completion 1/0.8 = 1.25
    expect(recordsPage.select(withMedians, ctxOf(issue))!.stamp).toBe("day")
  })
})
