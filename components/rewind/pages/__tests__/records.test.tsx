import { render, screen, within } from "@testing-library/react"

import { RecordsPage } from "@/components/rewind/pages/records"
import { issueContext, type FixtureIssue } from "@/lib/rewind/__tests__/helpers/fixture-issue"
import { recordCell } from "@/lib/rewind/pages/records"
import type { RecordsData } from "@/lib/rewind/pages/records.schema"
import { registry } from "@/lib/rewind/registry"

import { hasCleanCounts, loadIssues, PAGE_FIXTURES, pageData, plainText } from "./page-copy-rules"

jest.mock("server-only", () => ({}))

let issues: Map<string, FixtureIssue>

beforeAll(async () => {
  issues = await loadIssues()
})

describe("12 Records", () => {
  it.each(PAGE_FIXTURES)("%s: sets a box score of fitted numerals and labels, in catalogue order", (id) => {
    const issue = issues.get(id)!
    const data = pageData<RecordsData>(issue, "records")
    if (!data) return
    render(<RecordsPage data={data} issue={issueContext(issue)} />)
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("Personal bests")
    const cells = screen.getAllByTestId("rewind-record-cell")
    expect(cells.map((c) => c.dataset.cell)).toEqual(data.cells)
    cells.forEach((cell, i) => {
      const { numeral, label } = recordCell(data.cells[i], data, issue.facts)
      expect(plainText(within(cell).getByRole("definition").textContent!).replace(/\s+/g, " ")).toContain(plainText(numeral))
      expect(plainText(within(cell).getByRole("term").textContent!)).toBe(plainText(label.map((p) => p.text).join("")))
    })
    const summary = registry.records.srSummary(data, issue.facts)
    for (const cell of data.cells) expect(summary).toContain(recordCell(cell, data, issue.facts).numeral)
    expect(hasCleanCounts(document.body.textContent!)).toBe(true)
    expect(hasCleanCounts(summary)).toBe(true)
  })

  it("stamps the record cell, and says so to screen readers", () => {
    const issue = issues.get("heavy")!
    const data = { ...pageData<RecordsData>(issue, "records")!, stamp: "day" as const }
    render(<RecordsPage data={data} issue={issueContext(issue)} />)
    const stamped = screen.getAllByTestId("rewind-record-cell").find((c) => c.dataset.cell === "day")!
    expect(within(stamped).getByTestId("rewind-record-stamp")).toHaveTextContent("record")
    expect(stamped).toHaveTextContent("a record against the server's median")
    expect(screen.getAllByTestId("rewind-record-stamp")).toHaveLength(1)
  })

  it("prints '1 episode' in the singular", () => {
    const issue = issues.get("heavy")!
    const facts = { ...issue.facts, "records.mostEpisodesDay": { value: 1, display: "1", unit: "count" as const } }
    const { label } = recordCell("day", pageData<RecordsData>(issue, "records")!, facts)
    expect(label[0].text).toBe("episode in one day")
  })

  it("summarises the page deterministically", () => {
    expect(PAGE_FIXTURES.map((id) => {
      const data = pageData<RecordsData>(issues.get(id)!, "records")
      return data && registry.records.srSummary(data, issues.get(id)!.facts)
    })).toMatchSnapshot()
  })
})
