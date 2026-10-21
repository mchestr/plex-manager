/**
 * 07 Taste's selection (design 4.3): valid data or null on every golden
 * fixture, and omitted under 60% genre coverage.
 */

import { FIXTURE_IDS, fixtureIssue, type FixtureIssue } from "@/lib/rewind/__tests__/helpers/fixture-issue"
import { tastePage } from "@/lib/rewind/pages/taste"
import type { SelectContext } from "@/lib/rewind/registry"
import { lookupFor, meta } from "@/lib/wrapped/stats/__tests__/build-lookups"
import { play, statsContext } from "@/lib/wrapped/stats/__tests__/build-events"
import { computeTaste } from "@/lib/wrapped/stats/taste"

jest.mock("server-only", () => ({}))

const issues = new Map<string, FixtureIssue>()

beforeAll(async () => {
  for (const id of FIXTURE_IDS) issues.set(id, await fixtureIssue(id))
})

const ctxOf = (issue: FixtureIssue, stats = issue.stats): SelectContext => ({ edition: "full", archetype: null, disabledPages: [], stats })

describe("07 Taste select", () => {
  it.each(FIXTURE_IDS)("%s: returns schema-valid data or null", (id) => {
    const issue = issues.get(id)!
    const data = tastePage.select(issue.facts, ctxOf(issue))
    expect(data === null || tastePage.schema.safeParse(data).success).toBe(true)
    expect(data !== null).toBe(issue.stats.taste.eligible)
    if (data) expect(data.genres.length).toBe(Object.keys(issue.facts).filter((k) => /^taste\.genre\[\d\]\.name$/.test(k)).length)
  })

  it("is null at 55% genre coverage and present at 60%", () => {
    const ctx = statsContext("UTC")
    const covered = play({ at: "2026-03-01T20:00", zone: "UTC", film: "1", seconds: 55 * 60 })
    const bare = play({ at: "2026-03-02T20:00", zone: "UTC", film: "2", seconds: 45 * 60 })
    const lookup = lookupFor([covered, bare], { "1": meta({ genres: ["Drama"], year: 2022 }) })
    const issue = issues.get("median")!
    const at = (a: number, b: number) =>
      tastePage.select(issue.facts, ctxOf(issue, { ...issue.stats, taste: computeTaste([{ ...covered, playSeconds: a * 60 }, { ...bare, playSeconds: b * 60 }], ctx, lookup) }))
    expect(at(55, 45)).toBeNull()
    expect(at(60, 40)).toEqual({ genres: [{ minutes: 60 }], decades: [{ decade: 2020, titles: 1 }] })
  })

  it("tabulates the genres with minutes and shares, then the decades", () => {
    const issue = issues.get("heavy")!
    const data = tastePage.select(issue.facts, ctxOf(issue))!
    const table = tastePage.table!(data, issue.facts, { locale: "en-US" })!
    expect(table.columns).toEqual(["Genre or decade", "Watched", "Share"])
    expect(table.rows).toHaveLength(data.genres.length + data.decades.length)
    expect(table.rows[0][0]).toBe(issue.facts["taste.genre[1].name"]!.display)
    expect(table.rows[0][2]).toBe(issue.facts["taste.genre[1].share"]!.display)
    expect(table.rows.at(-1)![0]).toMatch(/^\d{4}s$/)
  })
})
