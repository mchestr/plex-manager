import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { CoverPage } from "@/components/rewind/pages/cover"
import { PlayerProvider } from "@/components/rewind/stage/player-context"
import { fixtureIssue, issueContext, type FixtureIssue } from "@/lib/rewind/__tests__/helpers/fixture-issue"
import type { CoverData } from "@/lib/rewind/pages/cover.schema"
import { registry } from "@/lib/rewind/registry"

jest.mock("server-only", () => ({}))

let heavy: FixtureIssue
let light: FixtureIssue

beforeAll(async () => {
  heavy = await fixtureIssue("heavy", { serial: "K7Q4", nthRewind: 4 })
  light = await fixtureIssue("light")
})

function renderCover(issue: FixtureIssue, send = jest.fn()) {
  const data = issue.pages.find((p) => p.type === "cover")!.data as CoverData
  render(
    <PlayerProvider value={send}>
      <CoverPage data={data} issue={issueContext(issue)} />
    </PlayerProvider>
  )
  return data
}

describe("01 Cover", () => {
  it("sets the masthead, the issue and the data window for the heavy fixture", () => {
    renderCover(heavy)
    expect(screen.getByText("Chester Family Plex")).toBeInTheDocument()
    expect(screen.getByText("Vol. 4, No. K7Q4")).toBeInTheDocument()
    expect(screen.getByText("Rewind")).toBeInTheDocument()
    expect(screen.getByText("The 2026 issue")).toBeInTheDocument()
    expect(screen.getByTestId("rewind-cover-window")).toHaveTextContent("Data through November 30")
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("Mike's year in film and television")
  })

  it("prints four cover lines whose folios point at the selected pages", () => {
    renderCover(heavy)
    const folios = Object.fromEntries(heavy.pages.map((p) => [registry[p.type].name, p.folio]))
    const lines = within(screen.getByTestId("rewind-cover-lines")).getAllByRole("listitem")
    expect(lines).toHaveLength(4)
    expect(lines[0]).toHaveTextContent(`${String(folios["The number"]).padStart(2, "0")}One very large number`)
    expect(lines.map((li) => li.textContent)).toContain(`${String(folios.Centrefold).padStart(2, "0")}Who you turned out to be`)
  })

  it("offers both cuts with the selected list's count and running time, and either starts the story", async () => {
    const send = jest.fn()
    renderCover(heavy, send)
    expect(heavy.pages).toHaveLength(13)
    expect(screen.getByTestId("rewind-cut-full")).toHaveTextContent("Read the full issue13 pages, about 1 min 40 s")
    expect(screen.getByTestId("rewind-cut-pocket")).toHaveTextContent("Pocket edition6 pages, about 40 s")

    await userEvent.setup().click(screen.getByTestId("rewind-cut-full"))
    expect(send).toHaveBeenCalledWith({ type: "CHOOSE_CUT" })
  })

  it("draws the cuts at artboard scale with 44 px hit areas, and lets the soundtrack give way (design 4.7)", () => {
    renderCover(heavy)
    for (const id of ["rewind-cut-full", "rewind-cut-pocket"]) {
      expect(screen.getByTestId(id)).toHaveClass("min-h-[calc(var(--u)*44px)]", "before:min-h-11", "before:min-w-11", "flex-wrap")
      expect(screen.getByTestId(id)).not.toHaveClass("h-11")
    }
    const figure = screen.getByTestId("rewind-figure")
    expect(figure).toHaveClass("min-h-0")
    expect(figure.style.flexBasis).toBe("calc(var(--u) * 168px)")
  })

  it("gives a pocket member the pocket cover and only the pocket cut", () => {
    renderCover(light)
    expect(light.edition).toBe("pocket")
    expect(screen.getByTestId("rewind-pocket-note")).toHaveTextContent("The pocket edition")
    expect(screen.queryByTestId("rewind-cut-full")).not.toBeInTheDocument()
    expect(screen.getByTestId("rewind-cut-pocket")).toBeInTheDocument()
  })

  it("draws the soundtrack as one path inside a described figure", () => {
    const data = renderCover(heavy)
    expect(data.minutes).toHaveLength(334)
    const figure = screen.getByTestId("rewind-figure")
    expect(figure.querySelectorAll("path")).toHaveLength(1)
    expect(figure.querySelector("line")).not.toBeNull()
    expect(figure).toHaveAccessibleName(registry.cover.srSummary(data, heavy.facts))
  })

  it("summarises the soundtrack deterministically", () => {
    const summaries = [heavy, light].map((issue) => registry.cover.srSummary(issue.pages[0].data as CoverData, issue.facts))
    expect(summaries).toMatchSnapshot()
  })
})
