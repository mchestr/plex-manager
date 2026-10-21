/**
 * @jest-environment node
 */

import { issuePages, LATER_PAGES, registry } from "@/lib/rewind/registry"
import { eligiblePages, selectPages, validatePagesOnRead, type StoredPage } from "@/lib/rewind/select-pages"

import { FIXTURE_IDS, fixtureIssue, type FixtureIssue } from "./helpers/fixture-issue"

const mockWarn = jest.fn()
jest.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: (...args: unknown[]) => mockWarn(...args), error: jest.fn() }),
}))

const issues = new Map<string, FixtureIssue>()

beforeAll(async () => {
  for (const id of FIXTURE_IDS) issues.set(id, await fixtureIssue(id))
})

beforeEach(() => mockWarn.mockReset())

describe("selectPages over the 20 golden fixtures", () => {
  it.each(FIXTURE_IDS)("%s: every select returns data its schema accepts, or null", (id) => {
    const { facts, stats, archetype } = issues.get(id)!
    for (const entry of issuePages) {
      const data = entry.select(facts, { edition: "full", archetype: archetype?.id ?? null, disabledPages: [], stats })
      if (data !== null) expect(entry.schema.parse(JSON.parse(JSON.stringify(data)))).toEqual(data)
    }
  })

  it.each(FIXTURE_IDS)("%s: numbers the folios 1 to n, without the later pages", (id) => {
    const { pages } = issues.get(id)!
    expect(pages.map((p) => p.folio)).toEqual(pages.map((_, i) => i + 1))
    expect(pages.some((p) => LATER_PAGES.includes(p.type))).toBe(false)
    expect(pages[0].type).toBe("cover")
    expect(pages.at(-1)!.type).toBe("back-cover")
  })

  it("records each fixture's selection (snapshot)", () => {
    const selections = Object.fromEntries(FIXTURE_IDS.map((id) => [id, issues.get(id)!.pages.map((p) => `${p.folio} ${p.type} ${p.field}`)]))
    expect(selections).toMatchSnapshot()
  })

  it("has the ten core pages in the heavy fixture's full issue, less Guess (D7)", () => {
    const types = issues.get("heavy")!.pages.map((p) => p.type)
    expect(types.filter((type) => registry[type].core)).toEqual(issuePages.filter((p) => p.core && p.type !== "guess").map((p) => p.type))
  })

  it("renumbers every folio when Bookends is disabled", () => {
    const { facts, stats, archetype } = issues.get("median")!
    const ctx = { edition: "full" as const, archetype: archetype?.id ?? null, stats }
    const all = selectPages(facts, { ...ctx, disabledPages: [] })
    const without = selectPages(facts, { ...ctx, disabledPages: ["bookends"] })
    expect(without.map((p) => p.type)).toEqual(all.map((p) => p.type).filter((t) => t !== "bookends"))
    expect(without.map((p) => p.folio)).toEqual(without.map((_, i) => i + 1))
  })

  it("prints a page in its altField when its field is the archetype's", () => {
    const { facts, stats } = issues.get("heavy")!
    // The Golden Hour Viewer's field is marigold, Top films' own field
    const pages = selectPages(facts, { edition: "full", archetype: "golden-hour-viewer", disabledPages: [], stats })
    expect(pages.find((p) => p.type === "top-films")!.field).toBe(registry["top-films"].altField)
    const other = selectPages(facts, { edition: "full", archetype: "midnight-marathoner", disabledPages: [], stats })
    expect(other.find((p) => p.type === "top-films")!.field).toBe("marigold")
  })

  it("keeps the later pages eligible for the goldens", () => {
    const { facts, stats, archetype } = issues.get("heavy")!
    const types = eligiblePages(facts, { edition: "full", archetype: archetype?.id ?? null, disabledPages: [], stats }).map((p) => p.type)
    expect(types).toContain("race")
  })
})

describe("validatePagesOnRead", () => {
  it("drops stored pages that fail their schema with one warning, and renumbers", () => {
    const { pages } = issues.get("heavy")!
    const stored: StoredPage[] = pages.map(({ type, data }) => ({ type, data }))
    stored[1] = { type: "number", data: { hero: "time.totalHours", minutes: "not a list" } }
    stored.push({ type: "short-list", data: {} })

    const read = validatePagesOnRead(stored, { archetype: "midnight-marathoner", disabledPages: [] })

    expect(read.map((p) => p.type)).toEqual(pages.map((p) => p.type).filter((t) => t !== "number"))
    expect(read.map((p) => p.folio)).toEqual(read.map((_, i) => i + 1))
    expect(mockWarn).toHaveBeenCalledTimes(1)
    expect(mockWarn.mock.calls[0][1]).toEqual({ pages: ["number", "short-list"] })
  })

  it("applies Config.rewindDisabledPages on read", () => {
    const { pages } = issues.get("heavy")!
    const read = validatePagesOnRead(pages, { archetype: null, disabledPages: ["bookends"] })
    expect(read.some((p) => p.type === "bookends")).toBe(false)
    expect(mockWarn).not.toHaveBeenCalled()
  })
})
