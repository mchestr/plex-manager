import { textOf, type ArticleBlock } from "@/lib/rewind/article/blocks"
import { fixtureIssue, type FixtureIssue } from "@/lib/rewind/__tests__/helpers/fixture-issue"
import { answeredNotes, pageNotes, type CoreNotesContext } from "@/lib/rewind/notes"
import type { GuessData } from "@/lib/rewind/pages/guess.schema"
import { registry, type IssuePageType, type RewindPageType } from "@/lib/rewind/registry"

jest.mock("server-only", () => ({}))

const CORE: RewindPageType[] = ["cover", "number", "bookends", "guess", "top-films", "clock", "back-cover"]
const issues: Record<string, FixtureIssue> = {}

beforeAll(async () => {
  for (const id of ["heavy", "median", "light", "night-owl"]) issues[id] = await fixtureIssue(id)
})

const contextOf = (issue: FixtureIssue, extra: Partial<CoreNotesContext> = {}): CoreNotesContext => ({
  locale: "en-US",
  zone: "server",
  coreNotes: true,
  pages: issue.pages.map((page) => ({ folio: page.folio, name: registry[page.type].name, type: page.type })),
  earlierYears: [2025, 2024],
  serverName: "Chester Family Plex",
  copySource: "template",
  cards: ["Cover", "The number"],
  ...extra,
})

/** Every string a block prints. */
function blockText(block: ArticleBlock): string {
  switch (block.kind) {
    case "heading":
    case "paragraph":
    case "note":
      return textOf(block.text)
    case "factRow":
      return block.items.map((item) => `${item.value} ${item.label}`).join(" ")
    case "rankedList":
      return [block.label, ...block.items.map((item) => `${item.title} ${item.detail ?? ""}`)].join(" ")
    case "table":
      return [block.table.caption, ...block.table.columns, ...block.table.rows.flat()].join(" ")
    case "definitionList":
      return [block.label ?? "", ...block.entries.map((entry) => `${entry.term} ${textOf(entry.detail)}`)].join(" ")
    case "figure":
      return block.summary
    case "calendar":
      return [block.caption, ...block.tables.flatMap((table) => [table.caption, ...table.rows.flat()])].join(" ")
  }
}
const textOfNotes = (blocks: readonly ArticleBlock[]) => blocks.map(blockText).join("\n")

describe.each(["heavy", "median", "light"])("the core pages' Notes on %s (P8.4)", (id) => {
  const pagesOf = () => issues[id].pages.filter((page) => CORE.includes(page.type))

  it("builds more than the summary for every core page the issue prints, deterministically", () => {
    const issue = issues[id]
    expect(pagesOf().length).toBeGreaterThan(0)
    for (const page of pagesOf()) {
      const notes = pageNotes(page, issue.facts, contextOf(issue))
      expect(notes.length).toBeGreaterThan(1)
      expect(notes).toEqual(pageNotes(page, issue.facts, contextOf(issue)))
    }
  })

  it("keeps the summary with notes.core off", () => {
    const issue = issues[id]
    for (const page of pagesOf()) {
      const summary = registry[page.type].srSummary(page.data as never, issue.facts)
      expect(pageNotes(page, issue.facts, contextOf(issue, { coreNotes: false }))).toEqual(summary ? [{ kind: "paragraph", text: [{ kind: "text", text: summary }] }] : [])
      expect(answeredNotes(page, issue.facts, contextOf(issue, { coreNotes: false }))).toBeNull()
    }
  })

  it("names the zone wherever a Note prints a clock time", () => {
    const issue = issues[id]
    for (const page of pagesOf().filter((p) => ["cover", "bookends", "clock"].includes(p.type))) {
      expect(textOfNotes(pageNotes(page, issue.facts, contextOf(issue)))).toContain(`Times in ${issue.facts["tz.label"]!.display}, the server's time zone`)
    }
  })
})

describe("the Guess Notes never spoil the quiz", () => {
  it("shows only the rules until answered, then the ranked options with minutes", () => {
    // Heavy's No. 1 leads too clearly for a quiz; the night owl has one.
    const issue = issues["night-owl"]
    const page = issue.pages.find((p) => p.type === "guess")!
    const data = page.data as GuessData
    const answer = data.options.find((o) => o.rank === 1)!
    const before = textOfNotes(pageNotes(page, issue.facts, contextOf(issue)))
    expect(before).toContain("How the quiz works")
    for (const option of data.options) expect(before).not.toContain(`${option.title} `)

    const after = answeredNotes(page, issue.facts, contextOf(issue))!
    expect(after).not.toBeNull()
    const list = after.find((block) => block.kind === "rankedList")
    expect(list?.kind === "rankedList" && list.items[0]).toMatchObject({ rank: 1, title: answer.title })
    expect(list?.kind === "rankedList" && list.items).toHaveLength(data.options.length)
  })

  it("leaves pages without a quiz answer alone", () => {
    const issue = issues.heavy
    const page = issue.pages.find((p) => p.type === "clock")!
    expect(answeredNotes(page, issue.facts, contextOf(issue))).toBeNull()
  })
})

describe("page by page on heavy", () => {
  const notesOf = (type: IssuePageType, extra: Partial<CoreNotesContext> = {}) => {
    const issue = issues.heavy
    return pageNotes(issue.pages.find((p) => p.type === type)!, issue.facts, contextOf(issue, extra))
  }

  it("cover: the contents with folios and the serial line", () => {
    const issue = issues.heavy
    const list = notesOf("cover").find((block) => block.kind === "rankedList")
    expect(list?.kind === "rankedList" && list.items).toHaveLength(issue.pages.length)
    const text = textOfNotes(notesOf("cover"))
    expect(text).toMatch(/Data from .+ to .+\./)
    if (issue.facts["member.serial"]) expect(text).toContain(`No. ${issue.facts["member.serial"].display} links your cards without naming you.`)
  })

  it("number: the counting rule and both years by month", () => {
    const table = notesOf("number").find((block) => block.kind === "table")
    expect(table?.kind === "table" && table.table.columns).toEqual(["Month", "2026", "2025"])
    expect(textOfNotes(notesOf("number"))).toContain("2025 is recounted from your play history")
  })

  it("bookends: links to the earlier years", () => {
    const years = notesOf("bookends").find((block) => block.kind === "definitionList" && block.label === "Your earlier Rewinds")
    expect(years?.kind === "definitionList" && years.entries.map((e) => e.href)).toEqual(["/rewind/2025", "/rewind/2024"])
  })

  it("clock: the 24 hours, the 7 weekdays and the after-dark rule", () => {
    const tables = notesOf("clock").filter((block) => block.kind === "table")
    expect(tables.map((t) => t.kind === "table" && t.table.rows.length)).toEqual([24, 7])
    expect(textOfNotes(notesOf("clock"))).toContain("started 10 PM to 4 AM")
  })

  it("top films: every listed film, and a hidden one leaves", () => {
    const table = notesOf("top-films").find((block) => block.kind === "table")
    const rows = table?.kind === "table" ? table.table.rows.length : 0
    expect(rows).toBeGreaterThan(0)
    const key = issues.heavy.stats.titles.films[0].key
    const hidden = notesOf("top-films", { hiddenKeys: new Set([key.slice(key.indexOf(":") + 1)]) }).find((block) => block.kind === "table")
    expect(hidden?.kind === "table" && hidden.table.rows.length).toBe(rows - 1)
  })

  it("back cover: the billing block, the cards and the privacy lines", () => {
    const text = textOfNotes(notesOf("back-cover"))
    expect(text).toContain("Presented by Chester Family Plex")
    expect(text).toContain("The 2 cards you can share")
    expect(text).toContain("Server admins can view your Rewind.")
    expect(text).toContain("Every word here comes from a template.")
  })
})
