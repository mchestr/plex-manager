import { issueDurationMs, issuePages, LATER_PAGES, POCKET_ESTIMATE, registry } from "@/lib/rewind/registry"
import { FACTS } from "@/lib/wrapped/facts/catalogue"
import { PageTypeSchema } from "@/lib/wrapped/data/page-types"

/** Design 4.2's slide catalogue: number, page name, field. */
const CATALOGUE = [
  ["01", "Cover", "archetype"],
  ["02", "The number", "coral"],
  ["03", "Bookends", "paper"],
  ["04", "Guess", "rose"],
  ["05", "Top shows", "paper"],
  ["06", "Top films", "marigold"],
  ["07", "Taste", "petrol"],
  ["08", "People", "paper"],
  ["09", "The clock", "forest"],
  ["10", "The calendar", "paper"],
  ["11", "The race", "mint"],
  ["12", "Records", "peach"],
  ["13", "Setup", "paper"],
  ["14", "Requests", "lilac"],
  ["15", "Standing", "sky"],
  ["16", "Centrefold", "archetype"],
  ["17", "Next year", "paper"],
  ["18", "Back cover", "paper"],
] as const

const CHART_PAGES = ["02", "05", "06", "07", "09", "10", "11", "13", "15", "16"]
const CORE = ["01", "02", "03", "04", "05", "06", "09", "10", "16", "18"]

describe("lib/rewind/registry", () => {
  it("lists the 18 pages of design 4.2 in issue order, with unique names", () => {
    expect(issuePages.map((p) => [p.name, p.field])).toEqual(CATALOGUE.map(([, name, field]) => [name, field]))
    expect(new Set(issuePages.map((p) => p.name)).size).toBe(18)
    expect(issuePages.map((p) => p.type)).toEqual(PageTypeSchema.options.filter((t) => t !== "short-list" && t !== "postcard"))
    for (const [type, page] of Object.entries(registry)) expect(page.type).toBe(type)
  })

  it("applies the spot rule: arch on 01 and 16, arch-deep on paper, ink elsewhere", () => {
    for (const page of issuePages) {
      const expected = page.field === "archetype" ? "arch" : page.field === "paper" ? "arch-deep" : "ink"
      expect([page.name, page.spot]).toEqual([page.name, expected])
    }
    expect(registry.cover.spot).toBe("arch")
    expect(registry.centrefold.spot).toBe("arch")
    expect(registry["top-shows"].spot).toBe("arch-deep")
    expect(registry["top-films"].spot).toBe("ink")
  })

  it("gives every colour page a different alternate field, and none to paper or archetype pages", () => {
    for (const page of issuePages) {
      if (page.field === "paper" || page.field === "archetype") expect(page.altField).toBeNull()
      else expect(page.altField).not.toBeNull()
      expect(page.altField).not.toBe(page.field)
    }
  })

  it("has a table builder on exactly the ten chart pages", () => {
    const withTable = CATALOGUE.filter((_, i) => issuePages[i].table).map(([n]) => n)
    expect(withTable).toEqual(CHART_PAGES)
  })

  it("marks the ten core pages", () => {
    expect(CATALOGUE.filter((_, i) => issuePages[i].core).map(([n]) => n)).toEqual(CORE)
  })

  it("gives every page a select, a strict schema, a summary and share facts from the catalogue", () => {
    for (const page of issuePages) {
      expect(typeof page.select).toBe("function")
      expect(typeof page.srSummary).toBe("function")
      expect(page.schema.safeParse({ unknownKey: 1 }).success).toBe(false)
      for (const id of [...page.share.facts, ...(page.share.titles ?? [])]) expect(FACTS).toHaveProperty([id])
      for (const id of page.share.titles ?? []) expect(page.share.facts).toContain(id)
    }
  })

  it("leaves only the non-core pages for P7.1 and P7.2", () => {
    expect(LATER_PAGES).toEqual(issuePages.filter((p) => !p.core).map((p) => p.type))
  })

  it("runs about 2 min 20 s for the full issue and about 40 s for the pocket edition", () => {
    const full = issueDurationMs(issuePages.map((p) => p.type))
    expect(full).toBe(140_140)
    expect(Math.abs(full - 140_000)).toBeLessThan(5_000)

    // Short list (P7.3) holds for 9 s, as Top shows does.
    expect(Math.abs(issueDurationMs(POCKET_ESTIMATE) - 40_000)).toBeLessThan(2_000)
    expect(issueDurationMs([])).toBe(0)
  })
})
