import { render, screen, within } from "@testing-library/react"

import { ArticleDocument } from "@/components/rewind/article/article-document"
import { fixtureIssue, articleContext, type FixtureIssue } from "@/lib/rewind/__tests__/helpers/fixture-issue"
import { plain, type ArticleBlock, type ArticleBlockKind } from "@/lib/rewind/article/blocks"
import { articleSections, type ArticleSection } from "@/lib/rewind/article/sections"

jest.mock("server-only", () => ({}))

let heavy: FixtureIssue

beforeAll(async () => {
  heavy = await fixtureIssue("heavy", { serial: "K7Q4", nthRewind: 4 })
})

function renderIssue(issue: FixtureIssue) {
  const sections = articleSections(issue.pages, issue.facts, articleContext(issue))
  render(<ArticleDocument title="The 2026 issue" masthead={[plain("Chester Family Plex, Vol. 4, No. K7Q4"), plain("Data through 30 November")]} sections={sections} />)
  return sections
}

/** Every block kind P7.13's legacy adapter will emit, built by hand as the adapter would from a v2 section. */
const LEGACY_BLOCKS: Record<ArticleBlockKind, ArticleBlock> = {
  heading: { kind: "heading", text: plain("Your year in review") },
  paragraph: { kind: "paragraph", text: [{ kind: "text", text: "You watched " }, { kind: "title", id: "legacy.title", text: "שוגון" }, { kind: "text", text: " most." }] },
  factRow: { kind: "factRow", items: [{ value: "412", label: "hours" }] },
  rankedList: { kind: "rankedList", label: "Top shows", items: [{ rank: 1, title: "Severance", detail: "40 hours" }, { rank: 2, title: "Shogun" }] },
  table: { kind: "table", table: { caption: "Hours by month.", columns: ["Month", "Hours"], rows: [["January", "30"]] } },
  definitionList: { kind: "definitionList", label: "Highlights", entries: [{ term: "Longest binge", detail: plain("9 episodes") }] },
  figure: { kind: "figure", summary: "A chart of hours by month." },
  note: { kind: "note", text: plain("Times in America/Chicago.") },
}

describe("ArticleDocument", () => {
  it("runs the headings h1 then h2s, with no skipped level", () => {
    const sections = renderIssue(heavy)
    const levels = screen.getAllByRole("heading").map((h) => Number(h.tagName.slice(1)))
    expect(levels[0]).toBe(1)
    expect(levels.filter((l) => l === 1)).toHaveLength(1)
    expect(levels.filter((l) => l === 2)).toHaveLength(sections.length)
    levels.forEach((level, i) => i > 0 && expect(level - levels[i - 1]).toBeLessThanOrEqual(1))
    expect(screen.getByRole("heading", { level: 2, name: /^05 / })).toBeInTheDocument()
  })

  it("labels each page's section by its heading", () => {
    const sections = renderIssue(heavy)
    const regions = screen.getAllByRole("region")
    expect(regions).toHaveLength(sections.length)
    expect(regions[0]).toHaveAccessibleName("01 Cover")
  })

  it("gives every table a caption, column headers and row headers", () => {
    renderIssue(heavy)
    const tables = screen.getAllByRole("table")
    expect(tables.length).toBeGreaterThan(0)
    for (const table of tables) {
      expect(table.querySelector("caption")?.textContent).toBeTruthy()
      expect(table.querySelectorAll('thead th[scope="col"]').length).toBeGreaterThan(0)
      for (const row of table.querySelectorAll("tbody tr")) expect(row.firstElementChild).toHaveAttribute("scope", "row")
    }
  })

  it("sets the billing block as a definition list", () => {
    renderIssue(heavy)
    const back = screen.getAllByRole("region").at(-1)!
    expect(back).toHaveAccessibleName(/Back cover$/)
    const dl = within(back).getByTestId("rewind-article-dl")
    expect(dl.tagName).toBe("DL")
    expect(within(dl).getByText("Presented by")).toBeInTheDocument()
  })

  it("is one article in English on paper", () => {
    renderIssue(heavy)
    const article = screen.getByTestId("rewind-article-mode")
    expect(article.tagName).toBe("ARTICLE")
    expect(article).toHaveAttribute("lang", "en")
    expect(article).toHaveAttribute("data-field", "paper")
  })

  it("renders a legacy block list with every kind", () => {
    const section: ArticleSection = { id: "legacy", folio: null, name: "Your 2024", type: null, blocks: Object.values(LEGACY_BLOCKS) }
    render(<ArticleDocument title="The 2024 issue" masthead={[]} sections={[section]} />)
    expect(screen.getByRole("heading", { level: 2, name: "Your 2024" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { level: 3, name: "Your year in review" })).toBeInTheDocument()
    expect(screen.getByText("שוגון")).toHaveAttribute("dir", "auto")
    expect(screen.getByTestId("rewind-article-facts")).toHaveTextContent("412 hours")
    expect(screen.getAllByRole("listitem").map((li) => li.getAttribute("value"))).toContain("2")
    expect(screen.getByRole("table", { name: "Hours by month." })).toBeInTheDocument()
    expect(screen.getByRole("rowheader", { name: "January" })).toBeInTheDocument()
    expect(screen.getByTestId("rewind-article-dl")).toHaveTextContent("Longest binge9 episodes")
    expect(screen.getByTestId("rewind-article-figure")).toHaveTextContent("A chart of hours by month.")
    expect(screen.getByText("Times in America/Chicago.")).toBeInTheDocument()
  })
})
