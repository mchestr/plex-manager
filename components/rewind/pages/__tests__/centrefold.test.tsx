import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { archetypeNameFit, CentrefoldPage } from "@/components/rewind/pages/centrefold"
import { nameAfterLead } from "@/lib/rewind/pages/centrefold"
import { PlayerProvider } from "@/components/rewind/stage/player-context"
import { fixtureIssue, issueContext, type FixtureIssue } from "@/lib/rewind/__tests__/helpers/fixture-issue"
import type { CentrefoldData } from "@/lib/rewind/pages/centrefold.schema"
import { registry } from "@/lib/rewind/registry"
import { ARCHETYPE_IDS, ARCHETYPE_STYLE, getArchetype, type ArchetypeId } from "@/lib/wrapped/archetypes/catalogue"
import type { RewindFactsV3 } from "@/lib/wrapped/facts/catalogue"

jest.mock("server-only", () => ({}))

let heavy: FixtureIssue
let light: FixtureIssue

beforeAll(async () => {
  heavy = await fixtureIssue("heavy", { serial: "K7Q4" })
  light = await fixtureIssue("light")
})

/** The fixture issue as if code had picked `id`. */
function as(issue: FixtureIssue, id: ArchetypeId, extra: RewindFactsV3 = {}) {
  const facts: RewindFactsV3 = {
    ...issue.facts,
    "archetype.id": { value: id, display: id, unit: "id" },
    "archetype.name": { value: getArchetype(id).name, display: getArchetype(id).name, unit: "name" },
    ...extra,
  }
  const data = registry.centrefold.select(facts, { edition: "full", archetype: id, disabledPages: [], stats: issue.stats })!
  return { facts, data, issue: issueContext(issue, { facts }) }
}

function renderPage(data: CentrefoldData, issue: ReturnType<typeof issueContext>, send = jest.fn(), sheet: string | null = null) {
  return render(
    <PlayerProvider value={send} sheet={sheet}>
      <CentrefoldPage data={data} issue={issue} />
    </PlayerProvider>
  )
}

const count = (n: number) => ({ value: n, display: String(n), unit: "count" as const })

describe("16 Centrefold", () => {
  it.each(ARCHETYPE_IDS)("%s: sets the name in whole words, one size, each line within one width step", (id) => {
    const { data, issue } = as(heavy, id)
    renderPage(data, issue)
    const name = nameAfterLead(getArchetype(id).name)
    const lines = Array.from(screen.getByTestId("rewind-archetype-name").querySelectorAll(":scope > span > span")).map((el) => el.textContent!.trim())
    expect(lines.join(" ")).toBe(name)
    const words = name.split(" ")
    for (const line of lines) expect(name.includes(line) && line.split(" ").every((w) => words.includes(w))).toBe(true)
    const fit = archetypeNameFit(getArchetype(id).name)
    const steps = [62, 75, 87.5, 100, 112.5, 125]
    const used = fit.lines.map((l) => steps.indexOf(l.wdth))
    expect(Math.max(...used) - Math.min(...used)).toBeLessThanOrEqual(1)
    expect(fit.ellipsized).toBe(false)
  })

  it("sets Midnight / Marathoner at about 87 px, as in the mockup", () => {
    const fit = archetypeNameFit("The Midnight Marathoner")
    expect(fit.lines.map((l) => l.text)).toEqual(["Midnight", "Marathoner"])
    expect(fit.size).toBeCloseTo(87.1, 0)
  })

  it.each(ARCHETYPE_IDS)("%s: draws the evidence graphic of design 5.3's table", (id) => {
    const { data } = as(heavy, id)
    expect(data.graphic === null || data.graphic.kind === ARCHETYPE_STYLE[id].graphic).toBe(true)
    if (["midnight-marathoner", "golden-hour-viewer", "weekend-double-feature", "casual-critic", "curator", "festival-juror"].includes(id)) {
      expect(data.graphic?.kind).toBe(ARCHETYPE_STYLE[id].graphic)
    }
    expect(data.shortlist[0].id).toBe(id)
  })

  it("draws the Midnight Marathoner's ring with the after-dark arc and the key row", () => {
    const { data, issue, facts } = as(heavy, "midnight-marathoner")
    expect(data.graphic).toEqual({ kind: "hour-ring", arc: { from: 22, to: 3 }, share: "hours.afterDarkShare" })
    renderPage(data, issue)
    expect(screen.getByText(facts["hours.afterDarkShare"]!.display)).toBeInTheDocument()
    expect(document.body).toHaveTextContent("after dark")
    expect(document.body).toHaveTextContent(`Times in ${facts["tz.label"]!.display}`)
    expect(screen.getByText("No. K7Q4")).toBeInTheDocument()
  })

  it("lets the ring give way and scales Why this?, so the column fits a small artboard (design 4.7)", () => {
    const { data, issue } = as(heavy, "midnight-marathoner")
    renderPage(data, issue)
    const figure = screen.getByTestId("rewind-figure")
    expect(figure).toHaveClass("min-h-0")
    expect(figure.style.flexBasis).toBe("calc(var(--u) * 282px)")
    const why = screen.getByTestId("rewind-archetype-why")
    expect(why).toHaveClass("h-[calc(var(--u)*44px)]", "before:min-h-11")
    expect(why).not.toHaveClass("h-11")
  })

  it("hides the rarity stamp below 10 scored members", () => {
    const low = as(heavy, "midnight-marathoner", { "archetype.rarityCount": count(2), "archetype.scoredMembers": count(9) })
    const { unmount } = renderPage(low.data, low.issue)
    expect(screen.queryByTestId("rewind-archetype-rarity")).not.toBeInTheDocument()
    unmount()
    const high = as(heavy, "midnight-marathoner", { "archetype.rarityCount": count(6), "archetype.scoredMembers": count(31) })
    renderPage(high.data, high.issue)
    expect(screen.getByTestId("rewind-archetype-rarity")).toHaveTextContent("6 of 31Rewinds here")
  })

  it("opens Why this? through the player's sheet mode", async () => {
    const send = jest.fn()
    const { data, issue } = as(heavy, "midnight-marathoner")
    renderPage(data, issue, send)
    await userEvent.setup().click(screen.getByTestId("rewind-archetype-why"))
    expect(send).toHaveBeenCalledWith({ type: "OPEN_SHEET", sheet: "why" })
  })

  it("keeps a light member's archetype from the low-volume shortlist, with a graphic", () => {
    const id = light.archetype!.id
    const data = light.pages.find((p) => p.type === "centrefold")!.data as CentrefoldData
    expect(data.shortlist[0].id).toBe(id)
    expect(data.graphic?.kind).toBe(ARCHETYPE_STYLE[id].graphic)
  })

  it("tabulates the 24 hours", () => {
    const { data, facts } = as(heavy, "explorer")
    expect(registry.centrefold.table!(data, facts, { locale: "en-US" })!.rows).toHaveLength(24)
  })

  it("summarises the page deterministically", () => {
    expect(ARCHETYPE_IDS.map((id) => registry.centrefold.srSummary(as(heavy, id).data, as(heavy, id).facts))).toMatchSnapshot()
  })
})
