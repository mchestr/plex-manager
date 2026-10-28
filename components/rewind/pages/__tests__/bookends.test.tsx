import { render, screen } from "@testing-library/react"

import { BookendsPage } from "@/components/rewind/pages/bookends"
import { fixtureIssue, issueContext, type FixtureIssue } from "@/lib/rewind/__tests__/helpers/fixture-issue"
import type { BookendsData } from "@/lib/rewind/pages/bookends.schema"
import { registry } from "@/lib/rewind/registry"

jest.mock("server-only", () => ({}))

const issues: Record<string, FixtureIssue> = {}

beforeAll(async () => {
  for (const id of ["heavy", "median", "light", "postcard"]) issues[id] = await fixtureIssue(id, { nthRewind: 4 })
})

const dataOf = (issue: FixtureIssue) => issue.pages.find((p) => p.type === "bookends")?.data as BookendsData | undefined

describe("03 Bookends", () => {
  it.each(["heavy", "light"])("%s: opens with the first play and closes with the latest, each with its date and time", (id) => {
    const issue = issues[id]
    render(<BookendsPage data={dataOf(issue)!} issue={issueContext(issue)} />)
    const first = issue.facts["bookends.first.title"]!.display
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(`You opened 2026 with ${first}`.replace(/\s+/g, " "))
    expect(document.body).toHaveTextContent(issue.facts["bookends.first.date"]!.display.replace(/\u00A0/g, " "))
    expect(document.body).toHaveTextContent(issue.facts["bookends.last.time"]!.display.replace(/[\u00A0\u202F]/g, " "))
    expect(document.body).not.toHaveTextContent(/time zone|America\/Chicago/)
  })

  it("prints the lifetime line from the member's facts", () => {
    render(<BookendsPage data={dataOf(issues.heavy)!} issue={issueContext(issues.heavy)} />)
    expect(screen.getByTestId("rewind-bookends-lifetime")).toHaveTextContent(/^Member since 2023, [\d,]+ hours in all, your fourth Rewind$/)
  })

  it("omits itself when the first and last plays are the same title on the same day", () => {
    expect(issues.postcard.stats.bookends.sameTitleSameDay).toBe(true)
    expect(registry.bookends.select(issues.postcard.facts, { edition: "full", archetype: null, disabledPages: [], stats: issues.postcard.stats })).toBeNull()
  })

  it("keeps the light fixture's bookends", () => {
    expect(dataOf(issues.light)).toBeDefined()
  })

  it("masks the median member's first play, which is their No. 1 series", () => {
    const issue = issues.median
    expect(dataOf(issue)!.first.masked).toBe(true)
    render(<BookendsPage data={dataOf(issue)!} issue={issueContext(issue)} />)
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("You opened 2026 with a show you will meet on page 05")
    expect(screen.getByRole("heading", { level: 2 })).not.toHaveTextContent(issue.facts["bookends.first.title"]!.display)
  })

  it("masks a bookend that is the No. 1 series with the Top shows folio", () => {
    const issue = issues.heavy
    const data: BookendsData = { ...dataOf(issue)!, first: { ...dataOf(issue)!.first, masked: true } }
    render(<BookendsPage data={data} issue={issueContext(issue)} />)
    const folio = issue.pages.find((p) => p.type === "top-shows")!.folio
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(`You opened 2026 with a show you will meet on page 0${folio}`)
    expect(screen.queryByText(issue.facts["bookends.first.title"]!.display)).not.toBeInTheDocument()
  })

  it("masks the No. 1 series in select", () => {
    const { facts, stats } = issues.heavy
    const top = stats.titles.series[0].key
    const forged = { ...stats, bookends: { ...stats.bookends, first: { ...stats.bookends.first!, key: top } } }
    expect(registry.bookends.select(facts, { edition: "full", archetype: null, disabledPages: [], stats: forged })?.first.masked).toBe(true)
  })

  it("summarises the page deterministically", () => {
    expect(["heavy", "median", "light"].map((id) => registry.bookends.srSummary(dataOf(issues[id])!, issues[id].facts))).toMatchSnapshot()
  })
})
