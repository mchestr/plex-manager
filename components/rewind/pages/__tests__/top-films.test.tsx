import { render, screen, within } from "@testing-library/react"

import { TopFilmsPage } from "@/components/rewind/pages/top-films"
import { fixtureIssue, issueContext, type FixtureIssue } from "@/lib/rewind/__tests__/helpers/fixture-issue"
import type { TopFilmsData } from "@/lib/rewind/pages/top-lists.schema"
import { registry } from "@/lib/rewind/registry"
import type { RewindFactsV3 } from "@/lib/wrapped/facts/catalogue"

jest.mock("server-only", () => ({}))

const IDS = ["heavy", "median", "single-title", "zero-films", "long-and-non-latin-titles", "solo-server", "rewatcher"] as const
const issues = {} as Record<(typeof IDS)[number], FixtureIssue>

beforeAll(async () => {
  for (const id of IDS) issues[id] = await fixtureIssue(id)
})

const dataOf = (issue: FixtureIssue) => issue.pages.find((p) => p.type === "top-films")?.data as TopFilmsData | undefined
const title = (issue: FixtureIssue, n: number) => issue.facts[`films[${n}].title` as keyof RewindFactsV3]!.display
const ctx = (issue: FixtureIssue) => ({ edition: issue.edition, archetype: null, disabledPages: [], stats: issue.stats })

function renderFilms(issue: FixtureIssue) {
  render(<TopFilmsPage data={dataOf(issue)!} issue={issueContext(issue)} />)
}

describe("06 Top films", () => {
  it.each(["heavy", "median", "long-and-non-latin-titles"] as const)("%s: the No. 1 stub and rows 2 to 5", (id) => {
    const issue = issues[id]
    renderFilms(issue)
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("Your double features")
    expect(within(screen.getByTestId("rewind-top-films-stub")).getByRole("heading", { level: 3 })).toHaveTextContent(title(issue, 1))
    const rows = within(screen.getByRole("list")).getAllByRole("listitem")
    expect(rows).toHaveLength(dataOf(issue)!.rows.length - 1)
    rows.forEach((row, i) => expect(row).toHaveTextContent(title(issue, i + 2)))
    expect(document.body).not.toHaveTextContent(/\b0 movies?\b/)
  })

  it("is a single feature with fewer than 3 films, and omitted with none", () => {
    renderFilms(issues["solo-server"])
    expect(dataOf(issues["solo-server"])!.rows).toHaveLength(2)
    expect(screen.getByTestId("rewind-top-films-stub")).toBeInTheDocument()
    expect(screen.queryByRole("list")).not.toBeInTheDocument()
    for (const id of ["zero-films", "single-title"] as const) expect(registry["top-films"].select(issues[id].facts, ctx(issues[id]))).toBeNull()
  })

  it("prints rewatches as x2 and reads them out in words", () => {
    const issue = issues.rewatcher
    renderFilms(issue)
    const marks = screen.getAllByTestId("rewind-film-rewatch")
    expect(marks.length).toBeGreaterThan(0)
    expect(marks[0]).toHaveTextContent(/^x\d+, watched \d+ times$/)
  })

  it("sets safe-mode titles with dir=auto", () => {
    const issue = issues["long-and-non-latin-titles"]
    const facts: RewindFactsV3 = { ...issue.facts, "films[3].title": { value: "千と千尋の神隠し", display: "千と千尋の神隠し", unit: "title" } }
    render(<TopFilmsPage data={dataOf(issue)!} issue={issueContext(issue, { facts })} />)
    expect(within(screen.getByRole("list")).getByText("千と千尋の神隠し")).toHaveAttribute("dir", "auto")
  })

  it("tabulates the films and summarises deterministically", () => {
    const issue = issues.heavy
    const table = registry["top-films"].table!(dataOf(issue)!, issue.facts, { locale: "en-US" })!
    expect(table.columns).toEqual(["Movie", "Plays", "Watched"])
    expect(table.rows.map((r) => r[0])).toEqual([1, 2, 3, 4, 5].map((n) => title(issue, n)))
    expect(registry["top-films"].srSummary(dataOf(issue)!, issue.facts)).toMatchSnapshot()
  })
})
