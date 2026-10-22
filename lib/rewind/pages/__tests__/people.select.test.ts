/**
 * 08 People's selection (design 4.3): valid data or null on every golden
 * fixture, omitted under 70% cast coverage, and removable by config.
 */

import { FIXTURE_IDS, fixtureIssue, type FixtureIssue } from "@/lib/rewind/__tests__/helpers/fixture-issue"
import { peoplePage } from "@/lib/rewind/pages/people"
import type { SelectContext } from "@/lib/rewind/registry"
import { selectPages } from "@/lib/rewind/select-pages"
import { lookupFor, meta } from "@/lib/wrapped/stats/__tests__/build-lookups"
import { play, statsContext } from "@/lib/wrapped/stats/__tests__/build-events"
import { computePeople } from "@/lib/wrapped/stats/people"

jest.mock("server-only", () => ({}))

const issues = new Map<string, FixtureIssue>()

beforeAll(async () => {
  for (const id of FIXTURE_IDS) issues.set(id, await fixtureIssue(id))
})

const ctxOf = (issue: FixtureIssue, stats = issue.stats): SelectContext => ({ edition: "full", archetype: null, disabledPages: [], stats })

describe("08 People select", () => {
  it.each(FIXTURE_IDS)("%s: returns schema-valid data or null", (id) => {
    const issue = issues.get(id)!
    const data = peoplePage.select(issue.facts, ctxOf(issue))
    expect(data === null || peoplePage.schema.safeParse(data).success).toBe(true)
    if (data) {
      for (let i = 0; i < data.actors; i++) expect(issue.facts[`people.actor[${(i + 1) as 1}].name`]).toBeDefined()
      for (let i = 0; i < data.directors; i++) expect(issue.facts[`people.director[${(i + 1) as 1}].name`]).toBeDefined()
    }
  })

  it("is null at 69% cast coverage and present at 70%", () => {
    const ctx = statsContext("UTC")
    const covered = play({ at: "2026-03-01T20:00", zone: "UTC", film: "1" })
    const bare = play({ at: "2026-03-02T20:00", zone: "UTC", film: "2" })
    const lookup = lookupFor([covered, bare], { "1": meta({ actors: ["Adam Scott"], directors: ["Ben Stiller"] }) })
    const issue = issues.get("median")!
    const at = (a: number, b: number) =>
      peoplePage.select(issue.facts, ctxOf(issue, { ...issue.stats, people: computePeople([{ ...covered, playSeconds: a * 60 }, { ...bare, playSeconds: b * 60 }], ctx, lookup) }))
    expect(at(69, 31)).toBeNull()
    expect(at(70, 30)).toEqual({ actors: 1, directors: 1 })
  })

  it("leaves the issue, and renumbers every folio, when People is disabled", () => {
    const issue = issues.get("heavy")!
    const ctx = { edition: "full" as const, archetype: issue.archetype?.id ?? null, stats: issue.stats }
    const all = selectPages(issue.facts, { ...ctx, disabledPages: [] })
    const without = selectPages(issue.facts, { ...ctx, disabledPages: ["people"] })
    expect(all.some((p) => p.type === "people")).toBe(true)
    expect(without.map((p) => p.type)).toEqual(all.map((p) => p.type).filter((t) => t !== "people"))
    expect(without.map((p) => p.folio)).toEqual(without.map((_, i) => i + 1))
  })
})
