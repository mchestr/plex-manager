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

function renderList(issue: FixtureIssue, copySource: "template" | "llm" = "template") {
  const data = dataOf(issue)
  render(
    <div data-theme="rewind">
      <PortalContainerProvider popupProps={{ "data-field": "paper" }}>
        <PlayerProvider value={jest.fn()}>
          <ShortListPage data={data} issue={issueContext(issue, { copySource, edition: copySource === "template" ? "pocket" : "full" })} />
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
    const data = renderList(heavy, "llm")
    expect(data.rows).toHaveLength(3)
    const rows = screen.getAllByTestId("rewind-list-row")
    expect(rows).toHaveLength(2)
    rows.forEach((row, i) => expect(row).toHaveTextContent(titleOf(heavy, data, i + 1)))
  })

  it("prints tz.note under the clock time it shows", () => {
    renderList(heavy)
    expect(screen.getByTestId("rewind-short-list-start").textContent).toBe(`You usually pressed play around ${heavy.facts["hours.medianStart"]!.display}.`)
    expect(screen.getByTestId("rewind-short-list-tz")).toHaveTextContent(`Times in ${heavy.facts["tz.label"]!.display}, the server's time zone`)
  })

  it("says the words are templates only when every word is one", () => {
    renderList(light, "template")
    expect(screen.getByTestId("rewind-short-list-note")).toHaveTextContent("every word on them comes from a template")
  })

  it("names a full issue's cut without the template claim", () => {
    renderList(heavy, "llm")
    expect(screen.getByTestId("rewind-short-list-note")).toHaveTextContent("The six pages that sum up your year.")
    expect(within(screen.getByTestId("rewind-page-short-list")).getByTestId("rewind-short-list-deck")).toHaveTextContent("The titles at the top of")
  })

  it("summarises the list deterministically", () => {
    expect([light, heavy].map((issue) => registry["short-list"].srSummary(dataOf(issue), issue.facts))).toMatchSnapshot()
  })
})
