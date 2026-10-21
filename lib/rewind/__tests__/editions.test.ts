import { fixtureIssue, type FixtureIssue } from "@/lib/rewind/__tests__/helpers/fixture-issue"
import { habitPage, pagesForCut } from "@/lib/rewind/editions"
import { registry } from "@/lib/rewind/registry"
import { validatePagesOnRead } from "@/lib/rewind/select-pages"
import type { RewindFactsV3 } from "@/lib/wrapped/facts/catalogue"
import { selectIssuePages, type Edition } from "@/lib/wrapped/pipeline/edition"

jest.mock("server-only", () => ({}))

let heavy: FixtureIssue
let light: FixtureIssue

beforeAll(async () => {
  heavy = await fixtureIssue("heavy")
  light = await fixtureIssue("light")
})

/** The issue as P5.9 stores it in `RewindDataV3.pages`. */
function stored(issue: FixtureIssue, edition: Edition) {
  const pages = selectIssuePages(edition, issue.facts, { userId: "u1", stats: issue.stats, archetype: issue.archetype?.id ?? null, disabledPages: [] })
  return { edition, pages, facts: issue.facts }
}

const numbering = (issue: FixtureIssue) => ({ archetype: issue.archetype?.id ?? null, disabledPages: [] })

describe("pagesForCut", () => {
  it("gives the light fixture's pocket edition six pages in order, numbered 1 to 6", () => {
    expect(light.edition).toBe("pocket")
    const rewind = stored(light, "pocket")
    const pages = validatePagesOnRead(pagesForCut(rewind, "pocket"), numbering(light))
    expect(pages.map((p) => p.type)).toEqual(["cover", "number", "short-list", "calendar", "centrefold", "back-cover"])
    expect(pages.map((p) => p.folio)).toEqual([1, 2, 3, 4, 5, 6])
    // A pocket member's stored issue is already the pocket cut
    expect(pagesForCut(rewind, "full").map((p) => p.type)).toEqual(pages.map((p) => p.type))
  })

  it("cuts a full issue to six pages that keep its pages' data", () => {
    const rewind = stored(heavy, "full")
    const pocket = validatePagesOnRead(pagesForCut(rewind, "pocket"), numbering(heavy))
    expect(pocket.map((p) => p.type)).toEqual(["cover", "number", "short-list", "calendar", "centrefold", "back-cover"])
    expect(pocket.map((p) => p.folio)).toEqual([1, 2, 3, 4, 5, 6])
    for (const page of pocket.filter((p) => p.type !== "short-list")) {
      expect(page.data).toEqual(rewind.pages.find((p) => p.type === page.type)!.data)
    }
    // Short list is derived from the stored lists exactly as the pipeline would store it
    expect(pocket[2].data).toEqual(stored(heavy, "pocket").pages.find((p) => p.type === "short-list")!.data)
  })

  it("returns the stored selection for the full cut and the postcard for either cut", () => {
    const full = stored(heavy, "full")
    expect(pagesForCut(full, "full")).toEqual(full.pages)
    const postcard = stored(light, "postcard")
    expect(postcard.pages.map((p) => p.type)).toEqual(["postcard"])
    expect(pagesForCut(postcard, "pocket")).toEqual(postcard.pages)
  })

  it("merges films and series into the top 3 of any type by minutes", () => {
    const rewind = stored(heavy, "full")
    const shortList = pagesForCut(rewind, "pocket").find((p) => p.type === "short-list")!.data
    const parsed = registry["short-list"].schema.parse(shortList)
    expect(parsed.rows).toHaveLength(3)
    const minutes = parsed.rows.map((row) => Number(heavy.facts[`${row.key.startsWith("film:") ? "films" : "series"}[${row.rank}].minutes` as keyof RewindFactsV3]?.value))
    expect(minutes).toEqual([...minutes].sort((a, b) => b - a))
  })
})

describe("habitPage", () => {
  const facts = (days: number): RewindFactsV3 => ({ "streak.longest.days": { value: days, display: `${days} days`, unit: "days" } })
  const both = () => true

  it("takes the calendar with a streak of 3 days or more", () => {
    expect(habitPage(facts(3), both)).toBe("calendar")
  })

  it("takes the clock under a 3-day streak when the clock is eligible", () => {
    expect(habitPage(facts(2), both)).toBe("clock")
  })

  it("falls back to the calendar's active-dates row without the clock", () => {
    expect(habitPage(facts(1), (type) => type === "calendar")).toBe("calendar")
    expect(habitPage(facts(5), (type) => type === "clock")).toBe("clock")
  })
})
