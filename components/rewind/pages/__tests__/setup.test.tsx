import { render, screen } from "@testing-library/react"

import { SetupPage } from "@/components/rewind/pages/setup"
import { fixtureIssue, issueContext, type FixtureIssue } from "@/lib/rewind/__tests__/helpers/fixture-issue"
import type { SetupData } from "@/lib/rewind/pages/setup.schema"
import { registry } from "@/lib/rewind/registry"

jest.mock("server-only", () => ({}))

const IDS = ["heavy", "median", "no-overseerr"] as const
const issues: Record<string, FixtureIssue> = {}

beforeAll(async () => {
  for (const id of IDS) issues[id] = await fixtureIssue(id)
})

const dataOf = (issue: FixtureIssue) => issue.pages.find((p) => p.type === "setup")?.data as SetupData | undefined
const text = (s: string) => s.replace(/[  ]/g, " ")

describe("13 Setup", () => {
  it.each(IDS)("%s: sets the template headline, the platform nameplate and one meter per share", (id) => {
    const issue = issues[id]
    const data = dataOf(issue)!
    render(<SetupPage data={data} issue={issueContext(issue)} />)
    const share = issue.facts["setup.directPlayShare"]!.display
    expect(text(screen.getByRole("heading", { level: 2 }).textContent!)).toBe(text(`${share} direct play`))
    expect(screen.getByTestId("rewind-setup-platform")).toHaveTextContent(`Mostly watched on${issue.facts["setup.topPlatform"]!.display}`)
    expect(screen.getByTestId("rewind-setup-platform")).toHaveTextContent(`in ${issue.facts["setup.topProduct"]!.display}`)
    expect(screen.getByTestId("rewind-figure")).toHaveAttribute("aria-label", registry.setup.srSummary(data, issue.facts))
    expect(document.querySelectorAll("svg")).toHaveLength(data.meters.length)
  })

  it("never prints a 0% meter or a deck", () => {
    const issue = issues.heavy
    render(<SetupPage data={dataOf(issue)!} issue={issueContext(issue)} />)
    expect(screen.queryByText("in 4K")).not.toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/(^|\D)0%/)
  })

  it("tabulates the shares, platform and app", () => {
    const issue = issues.heavy
    const table = registry.setup.table!(dataOf(issue)!, issue.facts, { locale: "en-US" })!
    expect(table.columns).toEqual(["Measure", "Value"])
    expect(table.rows).toEqual([
      ["Direct play", "91%"],
      ["Watched at home", "89%"],
      ["Top platform", "Apple TV"],
      ["Top app", "Plex for Apple TV"],
    ])
  })

  it("summarises the page deterministically", () => {
    expect(IDS.map((id) => registry.setup.srSummary(dataOf(issues[id])!, issues[id].facts))).toMatchSnapshot()
  })
})
