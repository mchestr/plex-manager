import { render, screen, within } from "@testing-library/react"

import { RequestsPage } from "@/components/rewind/pages/requests"
import { fixtureIssue, issueContext, type FixtureIssue } from "@/lib/rewind/__tests__/helpers/fixture-issue"
import type { RequestsData } from "@/lib/rewind/pages/requests.schema"
import { registry } from "@/lib/rewind/registry"

jest.mock("server-only", () => ({}))

const IDS = ["heavy", "median", "no-overseerr"] as const
const issues: Record<string, FixtureIssue> = {}

beforeAll(async () => {
  for (const id of IDS) issues[id] = await fixtureIssue(id)
})

const dataOf = (issue: FixtureIssue) => issue.pages.find((p) => p.type === "requests")?.data as RequestsData | undefined

describe("14 Requests", () => {
  it("is not in the no-overseerr issue", () => {
    expect(dataOf(issues["no-overseerr"])).toBeUndefined()
  })

  it("reads \"You asked for 27. You watched 15 of them.\" on the heavy fixture, over a receipt and its total", () => {
    const issue = issues.heavy
    const data = dataOf(issue)!
    render(<RequestsPage data={data} issue={issueContext(issue)} />)
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("You asked for 27. You watched 15 of them.")
    const ledger = screen.getByTestId("rewind-requests-ledger")
    expect(within(ledger).getAllByRole("term", { hidden: true }).map((dt) => dt.textContent)).toEqual(["Approved", "Arrived on the server", "Watched", "Still waiting", "Declined"])
    expect(within(ledger).getAllByRole("definition", { hidden: true }).map((dd) => dd.textContent)).toEqual(["20", "15", "15", "3", "2"])
    expect(screen.getByTestId("rewind-figure")).toHaveTextContent("Asked for27")
    expect(screen.getByTestId("rewind-figure")).toHaveAttribute("aria-label", registry.requests.srSummary(data, issue.facts))
  })

  it("keeps declined requests off the headline and the deck", () => {
    const issue = issues.median
    render(<RequestsPage data={dataOf(issue)!} issue={issueContext(issue)} />)
    expect(screen.getByRole("heading", { level: 2 }).textContent).not.toMatch(/declin/i)
    expect(screen.getByRole("heading", { level: 2 }).nextElementSibling!.textContent).not.toMatch(/declin/i)
  })

  it("leaves a zero line out", () => {
    const issue = issues.heavy
    render(<RequestsPage data={{ lines: ["requests.approved"] }} issue={issueContext(issue)} />)
    expect(within(screen.getByTestId("rewind-requests-ledger")).getAllByRole("term", { hidden: true })).toHaveLength(1)
  })

  it("summarises the page deterministically", () => {
    expect(["heavy", "median"].map((id) => registry.requests.srSummary(dataOf(issues[id])!, issues[id].facts))).toMatchSnapshot()
  })
})
