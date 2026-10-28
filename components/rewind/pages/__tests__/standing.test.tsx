import { render, screen } from "@testing-library/react"

import { StandingPage } from "@/components/rewind/pages/standing"
import { fixtureIssue, issueContext, type FixtureIssue } from "@/lib/rewind/__tests__/helpers/fixture-issue"
import type { StandingData } from "@/lib/rewind/pages/standing.schema"
import { registry } from "@/lib/rewind/registry"
import { toShareSafe } from "@/lib/wrapped/data/share-safe"
import { fixtureRewind, shareContext, shareOptions } from "@/lib/wrapped/data/__tests__/share-fixture"
import type { RewindFactsV3 } from "@/lib/wrapped/facts/catalogue"

jest.mock("server-only", () => ({}))

const IDS = ["heavy", "median", "no-overseerr"] as const
const issues: Record<string, FixtureIssue> = {}

beforeAll(async () => {
  for (const id of IDS) issues[id] = await fixtureIssue(id)
})

const dataOf = (issue: FixtureIssue) => issue.pages.find((p) => p.type === "standing")?.data as StandingData | undefined
const text = (s: string) => s.replace(/[  ]/g, " ")

/** The issue with its standing set to `percentile` of 34 members. */
function at(issue: FixtureIssue, percentile: number): FixtureIssue {
  const facts: RewindFactsV3 = {
    ...issue.facts,
    "standing.percentile": { value: percentile, display: `Top ${percentile}%`, unit: "percentile" },
    "standing.members": { value: 34, display: "34", unit: "count" },
  }
  return { ...issue, facts }
}

describe("15 Standing", () => {
  it.each(IDS)("%s: draws one mark per member with the member's solid", (id) => {
    const issue = issues[id]
    const data = dataOf(issue)!
    render(<StandingPage data={data} issue={issueContext(issue)} />)
    const marks = screen.getByTestId("rewind-standing-strip").querySelectorAll("rect")
    expect(marks).toHaveLength(Number(issue.facts["standing.members"]!.value))
    expect([...marks].findIndex((mark) => mark.hasAttribute("data-own"))).toBe(data.rank - 1)
    expect(screen.getByTestId("rewind-figure")).toHaveAttribute("aria-label", registry.standing.srSummary(data, issue.facts))
  })

  it("names the percentile in the top 50% as a nameplate", () => {
    const issue = issues.heavy
    render(<StandingPage data={dataOf(issue)!} issue={issueContext(issue)} />)
    expect(text(screen.getByRole("heading", { level: 2 }).textContent!)).toBe("Top 4% by hours watched")
  })

  it("says \"one of 34\" outside the top 50%, in-app only", () => {
    const issue = at(issues.median, 51)
    render(<StandingPage data={dataOf(issues.median)!} issue={issueContext(issue)} />)
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("You were one of 34 members who pressed play this year")
    expect(screen.getByRole("heading", { level: 2 }).textContent).not.toMatch(/Top/)
  })

  it("names the percentile at exactly top 50%", () => {
    const issue = at(issues.median, 50)
    render(<StandingPage data={dataOf(issues.median)!} issue={issueContext(issue)} />)
    expect(text(screen.getByRole("heading", { level: 2 }).textContent!)).toBe("Top 50% by hours watched")
  })

  it("leaves the member count and the strip out of the share projection", async () => {
    const rewind = await fixtureRewind("heavy")
    for (const publicCounts of [false, true]) {
      const [page] = toShareSafe(rewind, shareOptions({ pages: ["standing"] }), shareContext({ publicCounts })).pages
      expect(page.type).toBe("standing")
      expect(Object.keys(page.facts)).toEqual(["standing.percentile"])
      expect(JSON.stringify(page)).not.toMatch(/members|"rank"|strip|\b31\b/)
    }
  })

  it("tabulates the percentile and the member count", () => {
    const issue = issues.heavy
    const table = registry.standing.table!(dataOf(issue)!, issue.facts, { locale: "en-US" })!
    expect(table.rows).toEqual([
      ["Your standing", "Top 4%"],
      ["Members who pressed play", "31"],
    ])
    const lower = at(issues.median, 51)
    expect(registry.standing.table!(dataOf(issues.median)!, lower.facts, { locale: "en-US" })!.rows.map(([measure]) => measure)).not.toContain("Your standing")
  })

  it("summarises the page deterministically", () => {
    expect(IDS.map((id) => registry.standing.srSummary(dataOf(issues[id])!, issues[id].facts))).toMatchSnapshot()
  })
})
