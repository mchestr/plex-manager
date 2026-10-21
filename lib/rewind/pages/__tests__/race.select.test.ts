/**
 * 11 The race's selection (design 4.3): valid data or null on every golden
 * fixture, and omitted without 3 series of 60 minutes across 3 months.
 */

import { FIXTURE_IDS, fixtureIssue, type FixtureIssue } from "@/lib/rewind/__tests__/helpers/fixture-issue"
import { racePage } from "@/lib/rewind/pages/race"
import type { SelectContext } from "@/lib/rewind/registry"
import { play, statsContext } from "@/lib/wrapped/stats/__tests__/build-events"
import { computeRace } from "@/lib/wrapped/stats/race"

jest.mock("server-only", () => ({}))

const issues = new Map<string, FixtureIssue>()

beforeAll(async () => {
  for (const id of FIXTURE_IDS) issues.set(id, await fixtureIssue(id))
})

const ctxOf = (issue: FixtureIssue, stats = issue.stats): SelectContext => ({ edition: "full", archetype: null, disabledPages: [], stats })

const ep = (month: number, series: string, minutes: number) =>
  play({ at: `2026-${String(month).padStart(2, "0")}-10T20:00`, zone: "UTC", series, seconds: minutes * 60 })

describe("11 The race select", () => {
  it.each(FIXTURE_IDS)("%s: returns schema-valid data or null", (id) => {
    const issue = issues.get(id)!
    const data = racePage.select(issue.facts, ctxOf(issue))
    expect(data === null || racePage.schema.safeParse(data).success).toBe(true)
    expect(data !== null).toBe(issue.stats.race.eligible)
  })

  it("is null on the single-title fixture", () => {
    const issue = issues.get("single-title")!
    expect(racePage.select(issue.facts, ctxOf(issue))).toBeNull()
  })

  it("is null with two series, and kept with a third of 60 minutes", () => {
    const issue = issues.get("median")!
    const two = [1, 2, 3].flatMap((m) => [ep(m, "1", 100), ep(m, "2", 80)])
    const race = (events: ReturnType<typeof play>[]) => racePage.select(issue.facts, ctxOf(issue, { ...issue.stats, race: computeRace(events, statsContext("UTC")) }))
    expect(race(two)).toBeNull()
    const three = race([...two, ep(4, "3", 60)])!
    expect(three.series.map((s) => s.key)).toEqual(["series:1", "series:2", "series:3"])
    expect(three.frames.map((f) => f.leader)).toEqual(Array(11).fill(0))
  })

  it("tabulates cumulative minutes by month, never as a zero", () => {
    const issue = issues.get("heavy")!
    const data = racePage.select(issue.facts, ctxOf(issue))!
    const table = racePage.table!(data, issue.facts, { locale: "en-US" })!
    expect(table.columns).toEqual(["Month", ...data.series.map((s) => s.title)])
    expect(table.rows).toHaveLength(data.frames.length)
    expect(table.rows[0][0]).toBe("January")
    expect(table.rows.flat().some((cell) => /^0\b/.test(cell))).toBe(false)
  })
})
