/**
 * @jest-environment node
 */

import { FIXTURE_IDS, fixtureIssue, articleContext, type FixtureIssue } from "@/lib/rewind/__tests__/helpers/fixture-issue"
import { textOf, type ArticleBlock } from "@/lib/rewind/article/blocks"
import { articleSections } from "@/lib/rewind/article/sections"
import { monthTables } from "@/lib/rewind/pages/calendar"
import type { CalendarData } from "@/lib/rewind/pages/calendar.schema"
import { nameAfterLead } from "@/lib/rewind/pages/centrefold"
import { issuePages, registry, type RegistryEntry } from "@/lib/rewind/registry"

const issues = new Map<string, FixtureIssue>()

beforeAll(async () => {
  for (const id of FIXTURE_IDS) issues.set(id, await fixtureIssue(id))
})

function article(id: string) {
  const issue = issues.get(id)!
  return { issue, sections: articleSections(issue.pages, issue.facts, articleContext(issue)) }
}

const texts = (block: ArticleBlock) => {
  switch (block.kind) {
    case "heading":
    case "paragraph":
    case "note":
      return [block.text]
    case "definitionList":
      return block.entries.map((entry) => entry.detail)
    default:
      return []
  }
}

describe("article blocks over the 20 golden fixtures", () => {
  it.each(FIXTURE_IDS)("%s: every selected page is a section with blocks, in folio order, and omitted pages are absent", (id) => {
    const { issue, sections } = article(id)
    expect(sections.map((s) => [s.folio, s.type])).toEqual(issue.pages.map((p) => [p.folio, p.type]))
    for (const section of sections) expect(section.blocks.length).toBeGreaterThan(0)
    const selected = new Set(issue.pages.map((p) => p.type))
    for (const entry of issuePages.filter((p) => !selected.has(p.type))) expect(sections.some((s) => s.type === entry.type)).toBe(false)
  })

  it.each(FIXTURE_IDS)("%s: every token prints its fact's story display", (id) => {
    const { issue, sections } = article(id)
    const tokens = sections.flatMap((s) => s.blocks.flatMap(texts)).flat().filter((segment) => segment.kind !== "text")
    expect(tokens.length).toBeGreaterThan(0)
    for (const token of tokens) {
      if (token.id.startsWith("copy.")) continue
      const display = issue.facts[token.id as keyof typeof issue.facts]?.display
      expect([display, display && nameAfterLead(display)]).toContain(token.text)
    }
  })

  it.each(FIXTURE_IDS)("%s: tables are the story's Tables, and the calendar's months hold its Table's rows", (id) => {
    const { issue, sections } = article(id)
    for (const section of sections) {
      const page = issue.pages.find((p) => p.type === section.type)!
      const entry: RegistryEntry = registry[page.type]
      const tables = section.blocks.flatMap((b) => (b.kind === "table" ? [b.table] : []))
      const story = entry.table?.(page.data, issue.facts, { locale: "en-US" }) ?? null
      if (page.type === "calendar") {
        expect(tables).toEqual(monthTables(page.data as CalendarData, issue.facts, { locale: "en-US" }))
        expect(tables.flatMap((t) => t.rows)).toEqual(story?.rows ?? [])
      } else {
        expect(tables).toEqual(story ? [story] : [])
      }
    }
  })

  it.each(FIXTURE_IDS)("%s: a fact row prints fact displays only", (id) => {
    const { issue, sections } = article(id)
    const displays = new Set(Object.values(issue.facts).map((fact) => fact?.display))
    for (const block of sections.flatMap((s) => s.blocks)) {
      if (block.kind !== "factRow") continue
      for (const item of block.items) expect(item.value.split(" of ").every((part) => displays.has(part))).toBe(true)
    }
  })

  it("names the member's archetype on the centrefold, without the article", () => {
    const { issue, sections } = article("heavy")
    const heading = sections.find((s) => s.type === "centrefold")!.blocks[0]
    expect(heading.kind).toBe("heading")
    expect(textOf(heading.kind === "heading" ? heading.text : [])).toBe(`You are the ${nameAfterLead(String(issue.facts["archetype.name"]?.display))}`)
  })

  it("masks a bookend that is the No. 1 series with the Top shows folio", () => {
    const issue = issues.get("heavy")!
    const pages = issue.pages.map((p) => (p.type === "bookends" ? { ...p, data: { first: { key: "1", masked: true }, last: { key: "2", masked: true } } } : p))
    const section = articleSections(pages, issue.facts, articleContext({ ...issue, pages })).find((s) => s.type === "bookends")!
    const all = section.blocks.flatMap(texts).map(textOf).join(" ")
    const folio = String(pages.find((p) => p.type === "top-shows")!.folio).padStart(2, "0")
    expect(all).toContain(`a series you will meet on page ${folio}`)
    expect(all).not.toContain(String(issue.facts["bookends.first.title"]?.display))
  })
})
