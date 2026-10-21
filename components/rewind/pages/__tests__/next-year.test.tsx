import { render, screen, within } from "@testing-library/react"

import { NextYearPage } from "@/components/rewind/pages/next-year"
import { fixtureIssue, issueContext, type FixtureIssue } from "@/lib/rewind/__tests__/helpers/fixture-issue"
import type { NextYearData } from "@/lib/rewind/pages/next-year.schema"
import { registry } from "@/lib/rewind/registry"
import type { ItemLinks } from "@/lib/ui/plex-links"
import type { RewindFactsV3 } from "@/lib/wrapped/facts/catalogue"

jest.mock("server-only", () => ({}))

const IDS = ["heavy", "median", "no-overseerr"] as const
const issues: Record<string, FixtureIssue> = {}

beforeAll(async () => {
  for (const id of IDS) issues[id] = await fixtureIssue(id)
})

const dataOf = (issue: FixtureIssue) => issue.pages.find((p) => p.type === "next-year")?.data as NextYearData | undefined

const FULL: NextYearData = {
  leftForLater: [{ key: "series:77", season: 2, episode: 6, lastWatched: "2026-09-02" }],
  returning: [{ key: "series:88", season: 5, tmdbId: 95480 }],
  picks: [{ ratingKey: "5114", kind: "film", year: 2016, because: "taste.genre[1].name" }],
}
const FACTS: RewindFactsV3 = {
  "next.leftForLater[1].title": { value: "Severance", display: "Severance", unit: "title" },
  "next.returning[1].title": { value: "Slow Horses", display: "Slow Horses", unit: "title" },
  "next.returning[1].date": { value: "2027-01-16", display: "January 16", unit: "date" },
  "next.picks[1].title": { value: "Arrival", display: "Arrival", unit: "title" },
  "taste.genre[1].name": { value: "Drama", display: "Drama", unit: "text" },
}

function renderFull(links: ItemLinks = { plexServerId: "abc123", overseerrUrl: "https://requests.example.com" }) {
  const issue = issues.heavy
  render(<NextYearPage data={FULL} issue={issueContext(issue, { facts: { ...issue.facts, ...FACTS }, links })} />)
}

describe("17 Next year", () => {
  it("is in the heavy issue only, with its one pick", () => {
    expect(dataOf(issues.median)).toBeUndefined()
    expect(dataOf(issues["no-overseerr"])).toBeUndefined()
    const issue = issues.heavy
    render(<NextYearPage data={dataOf(issue)!} issue={issueContext(issue)} />)
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("Unfinished business")
    expect(within(screen.getByTestId("rewind-next-year-picks")).getByText("Killers of the Flower Moon")).toBeInTheDocument()
  })

  it("lists the three parts with tabular dates and template reasons", () => {
    renderFull()
    expect(screen.getByTestId("rewind-next-year-leftForLater")).toHaveTextContent("S2 E6Severance (opens in a new tab)Left off on September 2")
    expect(screen.getByTestId("rewind-next-year-returning")).toHaveTextContent("ReturningJanuary 16Slow Horses (opens in a new tab)Season 5 premieres")
    expect(screen.getByTestId("rewind-next-year-picks")).toHaveTextContent("Picks for the new year2016Arrival (opens in a new tab)Because you watched Drama")
  })

  it("links library titles into Plex and a returning season to Overseerr, as interactive links", () => {
    renderFull()
    const links = screen.getAllByTestId("rewind-next-year-link")
    expect(links.map((a) => a.getAttribute("href"))).toEqual([
      "https://app.plex.tv/desktop/#!/server/abc123/details?key=%2Flibrary%2Fmetadata%2F77",
      "https://requests.example.com/tv/95480",
      "https://app.plex.tv/desktop/#!/server/abc123/details?key=%2Flibrary%2Fmetadata%2F5114",
    ])
    for (const a of links) expect(a).toHaveAttribute("data-rw-interactive")
  })

  it("links a returning season into Plex without Overseerr, and prints plain titles without a server id", () => {
    renderFull({ plexServerId: "abc123", overseerrUrl: null })
    expect(screen.getAllByTestId("rewind-next-year-link")[1]).toHaveAttribute("href", "https://app.plex.tv/desktop/#!/server/abc123/details?key=%2Flibrary%2Fmetadata%2F88")
  })

  it("prints titles without links when the server id is unknown", () => {
    renderFull({ plexServerId: null, overseerrUrl: null })
    expect(screen.queryAllByTestId("rewind-next-year-link")).toHaveLength(0)
    expect(screen.getByText("Arrival")).toBeInTheDocument()
  })

  it("summarises the page deterministically", () => {
    const issue = issues.heavy
    expect([registry["next-year"].srSummary(dataOf(issue)!, issue.facts), registry["next-year"].srSummary(FULL, { ...issue.facts, ...FACTS })]).toMatchSnapshot()
  })
})
