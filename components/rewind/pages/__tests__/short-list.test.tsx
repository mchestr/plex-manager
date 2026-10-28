import { render, screen, within } from "@testing-library/react"

import { ShortListPage } from "@/components/rewind/pages/short-list"
import { PlayerProvider } from "@/components/rewind/stage/player-context"
import { PortalContainerProvider } from "@/components/ui/portal-container"
import { fixtureIssue, issueContext, type FixtureIssue } from "@/lib/rewind/__tests__/helpers/fixture-issue"
import { shortListFact } from "@/lib/rewind/pages/short-list"
import type { ShortListData } from "@/lib/rewind/pages/short-list.schema"
import { registry } from "@/lib/rewind/registry"

jest.mock("server-only", () => ({}))

let light: FixtureIssue
let heavy: FixtureIssue

beforeAll(async () => {
  light = await fixtureIssue("light")
  heavy = await fixtureIssue("heavy")
})

const dataOf = (issue: FixtureIssue) => registry["short-list"].select(issue.facts, { edition: "pocket", archetype: null, disabledPages: [], stats: issue.stats })!

function renderList(issue: FixtureIssue, edition: "pocket" | "full" = "pocket") {
  const data = dataOf(issue)
  render(
    <div data-theme="rewind">
      <PortalContainerProvider popupProps={{ "data-field": "paper" }}>
        <PlayerProvider value={jest.fn()}>
          <ShortListPage data={data} issue={issueContext(issue, { edition })} />
        </PlayerProvider>
      </PortalContainerProvider>
    </div>
  )
  return data
}

const titleOf = (issue: FixtureIssue, data: ShortListData, i: number) => issue.facts[shortListFact(data.rows[i], "title")]!.display

describe("Short list (pocket edition)", () => {
  it("sets the light member's long accented French No. 1 whole, as a nameplate, with minute-level numbers", () => {
    const data = renderList(light)
    const no1 = titleOf(light, data, 0)
    expect(no1).toMatch(/Amélie/)
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(/things you made time for$/)
    expect(screen.getByRole("heading", { level: 3 })).toHaveTextContent(no1)
    const page = screen.getByTestId("rewind-page-short-list")
    expect(page.textContent).toContain(light.facts[shortListFact(data.rows[0], "minutes")]!.display)
    expect(page.textContent).not.toMatch(/(^|\D)0 (minutes|episodes|plays)/)
  })

  it("lists Nos. 2 and 3 as rows that open their sheets", () => {
    const data = renderList(heavy, "full")
    expect(data.rows).toHaveLength(3)
    const rows = screen.getAllByTestId("rewind-list-row")
    expect(rows).toHaveLength(2)
    rows.forEach((row, i) => expect(row).toHaveTextContent(titleOf(heavy, data, i + 1)))
  })

  it("prints the usual start time with no zone note", () => {
    renderList(heavy)
    expect(screen.getByTestId("rewind-short-list-start").textContent).toBe(`You usually pressed play around ${heavy.facts["hours.medianStart"]!.display}.`)
    expect(document.body).not.toHaveTextContent(heavy.facts["tz.label"]!.display)
    expect(document.body).not.toHaveTextContent(/time zone/i)
  })

  it("notes a pocket member's six pages, with a deck that leaves the total to The number", () => {
    renderList(light)
    expect(screen.getByTestId("rewind-short-list-note")).toHaveTextContent("The six pages that sum up your year.")
    expect(screen.getByTestId("rewind-short-list-deck")).toHaveTextContent(/^A small year, well chosen\.$/)
  })

  it("names a full issue's cut the same way", () => {
    renderList(heavy, "full")
    expect(screen.getByTestId("rewind-short-list-note")).toHaveTextContent("The six pages that sum up your year.")
    expect(within(screen.getByTestId("rewind-page-short-list")).getByTestId("rewind-short-list-deck")).toHaveTextContent(/^The titles at the top of your year\.$/)
  })

  it("summarises the list deterministically", () => {
    expect([light, heavy].map((issue) => registry["short-list"].srSummary(dataOf(issue), issue.facts))).toMatchSnapshot()
  })
})
