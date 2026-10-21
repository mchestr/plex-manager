/**
 * P7.13: stored v1 and v2 Rewinds map onto archive-article blocks, with
 * their stored numbers, and nothing from the leaderboards a row once held.
 */

import { textOf, type ArticleBlock, type ArticleBlockKind } from "@/lib/rewind/article/blocks"
import { buildStoredV1Json, buildStoredV2Json, LEADERBOARD_MEMBER_EMAIL } from "@/lib/wrapped/__tests__/fixtures"
import { legacyToArticle } from "@/lib/wrapped/data/legacy-article"
import { parseStoredRewind } from "@/lib/wrapped/data/parse-stored"
import type { StoredWrappedData } from "@/lib/wrapped/data/schema-legacy"

const mockWarn = jest.fn()
jest.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ warn: (...args: unknown[]) => mockWarn(...args), info: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}))

const OPTIONS = { year: 2025, brand: "Chester Family Plex", locale: "en-US" }
const ALL_KINDS: ArticleBlockKind[] = ["heading", "paragraph", "factRow", "rankedList", "table", "definitionList", "figure", "note"]

function legacy(json: string): StoredWrappedData {
  const stored = parseStoredRewind(json)
  if (stored.version !== 1 && stored.version !== 2) throw new Error("not a legacy row")
  return stored.legacy
}

const blocksOf = (article: ReturnType<typeof legacyToArticle>): ArticleBlock[] => article.sections.flatMap((section) => section.blocks)

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
      return block.entries.map((entry) => `${entry.term} ${textOf(entry.detail)}`).join(" ")
    case "figure":
      return block.summary
    case "calendar":
      return block.caption
  }
}

beforeEach(() => mockWarn.mockClear())

describe("legacyToArticle on a stored v2 row", () => {
  const article = legacyToArticle(legacy(buildStoredV2Json()), OPTIONS)
  const blocks = blocksOf(article)

  it("is titled with the brand and year, from the archive", () => {
    expect(article.title).toBe("Chester Family Plex Rewind 2025")
    expect(article.masthead.map(textOf)).toEqual(["From the archive"])
  })

  it("uses every block kind", () => {
    expect(new Set(blocks.map((block) => block.kind))).toEqual(new Set(ALL_KINDS))
    expect(article.sections.every((section) => section.folio === null && section.type === null)).toBe(true)
  })

  it("prints the stored totals", () => {
    const facts = blocks.find((block) => block.kind === "factRow")
    expect(facts).toEqual({
      kind: "factRow",
      items: [
        { value: "60,480", label: "minutes watched" },
        { value: "85", label: "films" },
        { value: "23", label: "series" },
        { value: "412", label: "episodes" },
      ],
    })
  })

  it("lists the top films and shows, the archetype, the habits and the months", () => {
    const lists = blocks.filter((block) => block.kind === "rankedList")
    expect(lists.map((list) => list.items.map((item) => item.title))).toEqual([
      ["Dune: Part Three (2026)", "The Odyssey (2026)"],
      ["Severance (2022)"],
    ])
    expect(blocks.find((block) => block.kind === "heading")).toBeDefined()
    expect(blockText(blocks.find((block) => block.kind === "definitionList")!)).toContain("Longest streak 12 days")
    expect(blocks.find((block) => block.kind === "table")).toMatchObject({
      table: { columns: ["Month", "Minutes"], rows: [["January", "5,040"], ["February", "4,200"]] },
    })
    expect(blocks.find((block) => block.kind === "figure")).toMatchObject({ summary: expect.stringContaining("January") })
  })

  it("keeps the stored text as plain text, without highlight tags or the old name", () => {
    const text = blocks.map(blockText).join("\n")
    expect(text).toContain("Welcome to your 2026 premiere.")
    expect(text).toContain("Your busiest night was a Tuesday.")
    expect(text).not.toMatch(/<\/?highlight>|\bWrapped\b/)
    // The fun facts sit in a section and in insights; each prints once.
    expect(text.match(/Your busiest night was a Tuesday\./g)).toHaveLength(1)
  })

  it("holds no leaderboard, email or other member's name", () => {
    const serialized = JSON.stringify(article)
    expect(serialized).not.toMatch(/leaderboard/i)
    expect(serialized).not.toContain(LEADERBOARD_MEMBER_EMAIL)
    expect(serialized).not.toMatch(/@/)
    for (const name of ["Jon Snow", "Alice Smith", "asmith"]) expect(serialized).not.toContain(name)
    expect(mockWarn).not.toHaveBeenCalled()
  })
})

describe("legacyToArticle on a stored v1 row", () => {
  it("prints the totals, the lists and the stored text, without the v2 sections", () => {
    const article = legacyToArticle(legacy(buildStoredV1Json()), { ...OPTIONS, year: 2024 })
    const blocks = blocksOf(article)
    const text = blocks.map(blockText).join("\n")

    expect(article.title).toBe("Chester Family Plex Rewind 2024")
    expect(blocks.find((block) => block.kind === "factRow")).toMatchObject({
      items: [{ value: "30,240" }, { value: "41" }, { value: "12" }, { value: "233" }],
    })
    expect(text).toContain("Arrival (2016)")
    expect(text).toContain("Your 2024 Rewind is here.")
    expect(text).toContain("You watched Heat twice in one week.")
    expect(text).toContain("Made December 3, 2024.")
    expect(article.sections.map((section) => section.name)).toEqual(["The year in numbers", "Top films", "Top shows", "More from the year"])
    expect(JSON.stringify(article)).not.toMatch(/leaderboard|Jon Snow|Alice Smith|@/i)
  })

  it("keeps one item per ratingKey, or per title and year", () => {
    const row = legacy(buildStoredV1Json())
    const twice = { ...row, statistics: { ...row.statistics, topMovies: [...row.statistics.topMovies, ...row.statistics.topMovies] } }
    const list = blocksOf(legacyToArticle(twice, OPTIONS)).find((block) => block.kind === "rankedList")

    expect(list).toMatchObject({ items: [{ rank: 1, title: "Arrival (2016)" }, { rank: 2, title: "Heat (1995)" }] })
  })

  it("drops a malformed section with one warning", () => {
    const row = legacy(buildStoredV1Json())
    const broken = { ...row, sections: [...row.sections, { id: "x", type: "fun-facts" as const, title: "", content: "", data: { facts: "not a list" } }] }

    const article = legacyToArticle(broken, OPTIONS)

    expect(mockWarn).toHaveBeenCalledTimes(1)
    expect(mockWarn).toHaveBeenCalledWith("Archive section dropped", { type: "fun-facts" })
    expect(JSON.stringify(article)).not.toContain("not a list")
  })
})
