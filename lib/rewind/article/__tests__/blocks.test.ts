/**
 * @jest-environment node
 */

import { FIXTURE_IDS, fixtureIssue, articleContext, type FixtureIssue } from "@/lib/rewind/__tests__/helpers/fixture-issue"
import { andList, deckBlock, textOf, type ArticleBlock } from "@/lib/rewind/article/blocks"
import { articleSections, type ArticleSection } from "@/lib/rewind/article/sections"
import { formatRewindDuration } from "@/lib/rewind/format"
import { nameAfterLead } from "@/lib/rewind/pages/centrefold"
import type { BookendsData } from "@/lib/rewind/pages/bookends.schema"
import type { CentrefoldData } from "@/lib/rewind/pages/centrefold.schema"
import type { GuessData } from "@/lib/rewind/pages/guess.schema"
import type { TasteData } from "@/lib/rewind/pages/taste.schema"
import { issuePages, registry, type PageTable, type RegistryEntry } from "@/lib/rewind/registry"
import type { RewindFactsV3 } from "@/lib/wrapped/facts/catalogue"

const issues = new Map<string, FixtureIssue>()

beforeAll(async () => {
  for (const id of FIXTURE_IDS) issues.set(id, await fixtureIssue(id))
})

function article(id: string) {
  const issue = issues.get(id)!
  return { issue, sections: articleSections(issue.pages, issue.facts, articleContext(issue)) }
}

/** The pages whose article table is the story's Table as it is; The number's keeps only the months with plays. */
const REUSED_TABLES: readonly string[] = ["number", "top-films", "setup"]
const playedOnly = (type: string, table: PageTable) => (type === "number" ? { ...table, rows: table.rows.filter((row) => row[1] !== formatRewindDuration(0, { locale: "en-US" })) } : table)

const META_LINES = /comes from a template|written by|Nobody is named|Every reason here|from your own history|Every square is a day|from January 1 to/

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

/** Every string the sections print. */
const allText = (sections: readonly ArticleSection[]) =>
  sections
    .flatMap((s) => s.blocks)
    .map((block) => {
      switch (block.kind) {
        case "figure":
          return block.summary
        case "table":
          return [block.table.caption, ...block.table.columns, ...block.table.rows.flat()].join(" ")
        case "rankedList":
          return [block.label, ...block.items.map((item) => `${item.title} ${item.detail ?? ""}`)].join(" ")
        case "factRow":
          return block.items.map((item) => `${item.value} ${item.label}`).join(" ")
        case "definitionList":
          return [block.label ?? "", ...block.entries.map((entry) => `${entry.term} ${textOf(entry.detail)}`)].join(" ")
        default:
          return texts(block).map(textOf).join(" ")
      }
    })
    .join(" ")

describe("deckBlock", () => {
  const facts: RewindFactsV3 = {
    "time.daysHours": { value: 78420, display: "54\u00A0days, 11\u00A0hours", unit: "days-hours" },
    "time.totalHours": { value: 1307, display: "1,307", unit: "hours" },
  }

  it("drops a deck whose facts the page already prints", () => {
    expect(deckBlock("That's {{fact:time.totalHours}} hours.", facts, ["time.totalHours"])).toEqual([])
  })

  it("keeps a token-free deck, and a deck with one new fact", () => {
    expect(deckBlock("Here's to more of it.", facts, ["time.totalHours"])).toHaveLength(1)
    const [block] = deckBlock("{{fact:time.totalHours}} hours, or {{fact:time.daysHours}}.", facts, ["time.totalHours"])
    expect(block.kind === "paragraph" && textOf(block.text)).toBe("1,307 hours, or 54\u00A0days, 11\u00A0hours.")
  })
})

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

  it.each(FIXTURE_IDS)("%s: one small table a page at most, captioned without the window; only three pages reuse the story's Table", (id) => {
    const { issue, sections } = article(id)
    const window = [issue.facts["window.from"]?.display, issue.facts["window.through"]?.display].filter(Boolean) as string[]
    for (const section of sections) {
      const page = issue.pages.find((p) => p.type === section.type)!
      const tables = section.blocks.flatMap((b) => (b.kind === "table" ? [b.table] : []))
      expect(tables.length).toBeLessThanOrEqual(1)
      for (const table of tables) {
        expect(table.caption).toBeTruthy()
        for (const date of window) expect(table.caption).not.toContain(date)
        expect(table.rows.length).toBeLessThanOrEqual(12)
      }
      const entry: RegistryEntry = registry[page.type]
      const story = entry.table?.(page.data, issue.facts, { locale: "en-US" }) ?? null
      if (REUSED_TABLES.includes(page.type)) expect(tables).toEqual(story ? [playedOnly(page.type, story)] : [])
      else if (tables.length > 0) expect(tables[0]).not.toEqual(story)
    }
  })

  it.each(FIXTURE_IDS)("%s: no method or meta lines, and no disclosure of who wrote the words", (id) => {
    const { sections } = article(id)
    expect(allText(sections)).not.toMatch(META_LINES)
  })

  it.each(FIXTURE_IDS)("%s: prints no figure: every summary would repeat a table or a list", (id) => {
    const { sections } = article(id)
    expect(sections.flatMap((s) => s.blocks).filter((b) => b.kind === "figure")).toEqual([])
  })

  it("puts a meter's server median after the reason that cites the meter, once", () => {
    const issue = issues.get("credits-roller")!
    const pages = issue.pages.map((p) => {
      if (p.type !== "centrefold") return p
      const data = p.data as CentrefoldData
      return data.graphic?.kind === "meter" ? { ...p, data: { ...data, graphic: { ...data.graphic, median: 0.71 } } } : p
    })
    expect((pages.find((p) => p.type === "centrefold")!.data as CentrefoldData).graphic).toMatchObject({ kind: "meter", median: 0.71 })
    const facts: RewindFactsV3 = { ...issue.facts, "records.completionShare.median": { value: 0.71, display: "71%", unit: "share" } }
    const centrefold = articleSections(pages, facts, articleContext({ ...issue, pages, facts })).find((s) => s.type === "centrefold")!
    const text = allText([centrefold])
    const reason = `You finished ${facts["records.completionShare"]?.display} of what you started.`
    expect(text).toContain(`${reason} The server's median was 71%.`)
    expect(text.split(reason).length - 1).toBe(1)
    expect(text.split("median").length - 1).toBe(1)
    expect(centrefold.blocks.some((b) => b.kind === "figure")).toBe(false)
  })

  it.each(FIXTURE_IDS)("%s: the centrefold leaves the hours to The clock", (id) => {
    const { sections } = article(id)
    const centrefold = sections.find((s) => s.type === "centrefold")!
    expect(centrefold.blocks.some((b) => b.kind === "table")).toBe(false)
    expect(allText([centrefold])).not.toMatch(/Plays by the hour|your quietest/)
  })

  it.each(FIXTURE_IDS)("%s: the calendar's days played add up to days.active, and the clock's after dark is its share", (id) => {
    const { issue, sections } = article(id)
    const tableOf = (type: string) => sections.find((s) => s.type === type)?.blocks.find((b) => b.kind === "table")
    const calendar = tableOf("calendar")
    if (calendar?.kind === "table") {
      const played = calendar.table.rows.map((row) => Number(row[1].split(" of ")[0].replace(/\D/g, "")))
      expect(played.reduce((sum, n) => sum + n, 0)).toBe(Number(issue.facts["days.active"]?.value ?? 0))
      // A month with no plays is left out
      expect(played).not.toContain(0)
    }
    const clock = tableOf("clock")
    if (clock?.kind === "table") {
      // A part of the day with no plays is left out.
      const afterDark = clock.table.rows.find((row) => row[0].startsWith("After dark"))
      const share = issue.facts["hours.afterDarkShare"]
      expect(afterDark?.[1]).toBe(share?.value ? share.display : undefined)
    }
  })

  it.each(FIXTURE_IDS)("%s: Taste names a busiest decade only when it leads the others with two titles or more", (id) => {
    const { issue, sections } = article(id)
    const page = issue.pages.find((p) => p.type === "taste")
    if (!page) return
    const [first, second] = [...(page.data as TasteData).decades].sort((a, b) => b.titles - a.titles)
    const named = allText(sections.filter((s) => s.type === "taste")).match(/Your busiest decade was the (\d+)s/)
    const leads = Boolean(first && first.titles >= 2 && (!second || second.titles < first.titles))
    expect(named?.[1]).toBe(leads ? String(first.decade) : undefined)
  })

  it.each(FIXTURE_IDS)("%s: Bookends names the first title once, in its headline", (id) => {
    const { issue, sections } = article(id)
    const section = sections.find((s) => s.type === "bookends")
    if (!section) return
    const { first, last } = issue.pages.find((p) => p.type === "bookends")!.data as BookendsData
    const title = String(issue.facts["bookends.first.title"]?.display)
    const named = allText([section]).split(title).length - 1
    // A masked bookend names no title; the latest play can be the same title
    const sameLast = !last.masked && issue.facts["bookends.last.title"]?.display === title
    expect(named).toBe((first.masked ? 0 : 1) + (sameLast ? 1 : 0))
  })

  it.each(FIXTURE_IDS)("%s: Guess asks its question and lists every option", (id) => {
    const { issue, sections } = article(id)
    const page = issue.pages.find((p) => p.type === "guess")
    if (!page) return
    const blocks = sections.find((s) => s.type === "guess")!.blocks
    expect(blocks[0].kind).toBe("heading")
    const options = (page.data as GuessData).options.map((option) => option.title)
    expect(allText([{ ...sections[0], blocks: blocks.slice(1) }])).toBe(`${andList(options, "or")}?`)
  })

  it.each(FIXTURE_IDS)("%s: a fact row prints fact displays only", (id) => {
    const { issue, sections } = article(id)
    const displays = new Set(Object.values(issue.facts).map((fact) => fact?.display))
    for (const block of sections.flatMap((s) => s.blocks)) {
      if (block.kind !== "factRow") continue
      for (const item of block.items) expect(item.value.split(" of ").every((part) => displays.has(part))).toBe(true)
    }
  })

  it.each(FIXTURE_IDS)("%s: never names a time zone: the times are the member's own", (id) => {
    const { issue, sections } = article(id)
    const all = JSON.stringify(sections)
    expect(all).not.toContain(String(issue.facts["tz.label"]?.display))
    expect(all).not.toMatch(/time zone/i)
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
    expect(all).toContain(`a show you will meet on page ${folio}`)
    expect(all).not.toContain(String(issue.facts["bookends.first.title"]?.display))
  })
})
