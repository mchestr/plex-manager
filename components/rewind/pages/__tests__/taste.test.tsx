import { render, screen } from "@testing-library/react"

import { TastePage } from "@/components/rewind/pages/taste"
import { issueContext, type FixtureIssue } from "@/lib/rewind/__tests__/helpers/fixture-issue"
import { genreMonths } from "@/lib/rewind/pages/taste"
import type { TasteData } from "@/lib/rewind/pages/taste.schema"
import { registry } from "@/lib/rewind/registry"
import { renderCopyText } from "@/lib/wrapped/copy/render-copy"
import { headline } from "@/lib/wrapped/copy/templates"

import { hasCleanCounts, loadIssues, PAGE_FIXTURES, pageData, plainText } from "./page-copy-rules"

jest.mock("server-only", () => ({}))

let issues: Map<string, FixtureIssue>

beforeAll(async () => {
  issues = await loadIssues()
})

describe("07 Taste", () => {
  it.each(PAGE_FIXTURES)("%s: sets the headline, the column, the strips and a summary of every number", (id) => {
    const issue = issues.get(id)!
    const data = pageData<TasteData>(issue, "taste")
    if (!data) return expect(issue.stats.taste.eligible).toBe(false)
    render(<TastePage data={data} issue={issueContext(issue)} />)
    expect(plainText(screen.getByRole("heading", { level: 2 }).textContent!)).toBe(plainText(renderCopyText(headline("taste", issue.facts), issue.facts)))
    const summary = registry.taste.srSummary(data, issue.facts)
    expect(screen.getByTestId("rewind-figure")).toHaveAttribute("aria-label", summary)
    data.genres.forEach((_g, i) => expect(summary).toContain(issue.facts[`taste.genre[${(i + 1) as 1}].share`]!.display))
    if (issue.facts["taste.medianYear"]) expect(summary).toContain(issue.facts["taste.medianYear"].display)
    expect(screen.queryByTestId("rewind-taste-strip") !== null).toBe(genreMonths(issue.facts).length > 0)
    expect(hasCleanCounts(document.body.textContent!)).toBe(true)
    expect(hasCleanCounts(summary)).toBe(true)
  })

  it("reads 'Mostly' or 'Led by' the top genre, made around the median year", () => {
    const facts = issues.get("heavy")!.facts
    const genre = facts["taste.genre[1].name"]!.display
    expect(renderCopyText(headline("taste", facts), facts)).toMatch(new RegExp(`^(Mostly|Led by) ${genre}, made around ${facts["taste.medianYear"]!.display}$`))
    const noYear = Object.fromEntries(Object.entries(facts).filter(([k]) => k !== "taste.medianYear"))
    expect(renderCopyText(headline("taste", noYear), noYear)).toMatch(new RegExp(`^(Mostly|Led by) ${genre}$`))
  })

  it("lets the column and the decade strip stand alone without a month genre", () => {
    const issue = issues.get("heavy")!
    const facts = Object.fromEntries(Object.entries(issue.facts).filter(([k]) => !k.startsWith("taste.genreByMonth")))
    render(<TastePage data={pageData<TasteData>(issue, "taste")!} issue={issueContext(issue, { facts })} />)
    expect(screen.queryByTestId("rewind-taste-strip")).toBeNull()
    expect(screen.getByTestId("rewind-taste-decades")).toBeInTheDocument()
  })

  it("summarises the page deterministically", () => {
    expect(PAGE_FIXTURES.map((id) => {
      const data = pageData<TasteData>(issues.get(id)!, "taste")
      return data && registry.taste.srSummary(data, issues.get(id)!.facts)
    })).toMatchSnapshot()
  })
})
