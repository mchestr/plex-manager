import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { BackCoverPage } from "@/components/rewind/pages/back-cover"
import { ShareProvider } from "@/components/rewind/share/share-context"
import { PlayerProvider } from "@/components/rewind/stage/player-context"
import { fixtureIssue, issueContext, type FixtureIssue } from "@/lib/rewind/__tests__/helpers/fixture-issue"
import { billingBlock } from "@/lib/rewind/billing-block"
import type { BackCoverData } from "@/lib/rewind/pages/back-cover.schema"
import { registry } from "@/lib/rewind/registry"
import type { ShareSetup } from "@/lib/rewind/share-sheet"
import { pageMetrics } from "@/lib/rewind/typeset/metrics"
import type { RewindFactsV3 } from "@/lib/wrapped/facts/catalogue"

jest.mock("server-only", () => ({}))

const IDS = ["heavy", "median", "light", "zero-films", "long-and-non-latin-titles"] as const
const issues: Record<string, FixtureIssue> = {}

beforeAll(async () => {
  for (const id of IDS) issues[id] = await fixtureIssue(id, { serial: "K7Q4", nthRewind: 4 })
})

const dataOf = (issue: FixtureIssue) => issue.pages.find((p) => p.type === "back-cover")!.data as BackCoverData
const block = (facts: RewindFactsV3, opts: { named?: boolean; showtime?: boolean } = {}) =>
  billingBlock(facts, { serverName: "Chester Family Plex", named: opts.named ?? true, showtime: opts.showtime ?? true, locale: "en-US", measure: 358, metrics: pageMetrics })
const flat = (s: string) => s.replace(/[\u00A0\u202F]/g, " ")

function renderPage(issue: FixtureIssue, send = jest.fn(), sheet: string | null = null) {
  render(
    <PlayerProvider value={send} sheet={sheet}>
      <BackCoverPage data={dataOf(issue)} issue={issueContext(issue, { returnTo: "/account" })} />
    </PlayerProvider>
  )
}

describe("billingBlock", () => {
  it("credits the heavy member as the design's poster does", () => {
    const { lines, entries } = block(issues.heavy.facts)
    const text = lines.map((line) => flat(line.parts.map((p) => p.text).join(" ")))
    expect(text[0]).toBe("CHESTER FAMILY PLEX presents MIKE")
    expect(text[1]).toMatch(/^in [\d,]+ HOURS of [\d,]+ EPISODES$/)
    expect(text[2]).toMatch(/^and [\d,]+ FILMS featuring$/)
    expect(text[3]).toBe(issues.heavy.facts["series[1].title"]!.display.toUpperCase())
    expect(text.at(-1)).toBe(`and introducing ${issues.heavy.facts["archetype.name"]!.display.toUpperCase()}`)
    expect(entries.find((e) => e.term === "Starring")?.detail).toBe("Mike")
    for (const line of lines) expect(line.size).toBeGreaterThan(12)
  })

  it.each(IDS)("%s: holds only eligible credits, never a zero, and its list matches the lines", (id) => {
    const { facts } = issues[id]
    const { lines, entries } = block(facts)
    const caps = lines.flatMap((line) => line.parts.filter((p) => p.kind === "caps").map((p) => p.text))
    expect(caps).toEqual(entries.map((e) => e.detail.toLocaleUpperCase("en-US")))
    for (const entry of entries) expect(entry.detail).not.toMatch(/^0\u00A0/)
    if (!facts["counts.films"]?.value) expect(entries.some((e) => e.term === "Films")).toBe(false)
    if (!facts["standing.percentile"]) expect(entries.some((e) => e.term === "Standing")).toBe(false)
  })

  it("credits a standing only in the top half, as the Standing page names it", () => {
    const at = (value: number) => block({ ...issues.heavy.facts, "standing.percentile": { value, display: `Top ${value}%`, unit: "percentile" } }).entries
    expect(at(4).find((e) => e.term === "Standing")?.detail).toBe("Top 4%")
    expect(at(50).find((e) => e.term === "Standing")?.detail).toBe("Top 50%")
    expect(at(84).some((e) => e.term === "Standing")).toBe(false)
  })

  it("leaves the member out of an unsigned card and the showtime out without the clock", () => {
    const { entries } = block(issues.heavy.facts, { named: false, showtime: false })
    expect(entries.map((e) => e.term)).not.toContain("Starring")
    expect(entries.map((e) => e.term)).not.toContain("Showtime")
  })

  it("sets a line outside the font subset in safe mode", () => {
    const facts: RewindFactsV3 = { ...issues.heavy.facts, "series[1].title": { value: "進撃の巨人", display: "進撃の巨人", unit: "title" } }
    const { lines } = block(facts)
    const titles = lines.filter((l) => l.parts.some((p) => /[^\u0000-\u024F\u00A0]/.test(p.text)))
    expect(titles.length).toBeGreaterThan(0)
    for (const line of titles) expect(line.safe).toBe(true)
  })
})

describe("18 Back cover", () => {
  it("names the member, prints the billing block and its list and the soundtrack note, with no words disclosure", () => {
    const issue = issues.heavy
    renderPage(issue)
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("That was your 2026, Mike.")
    const list = screen.getByTestId("rewind-billing-list")
    const { entries } = block(issue.facts)
    expect(within(list).getAllByRole("definition").map((dd) => dd.textContent)).toEqual(entries.map((e) => e.detail))
    expect(within(list).getByText("Mike")).toBeInTheDocument()
    expect(screen.getAllByTestId("rewind-billing-line").length).toBeGreaterThanOrEqual(6)
    expect(flat(document.body.textContent!)).toContain("One line per day, January 1 to November 30.")
    expect(document.body.textContent).not.toMatch(/final cut|still being written/i)
    expect(screen.queryByTestId("rewind-back-cover-disclosure")).toBeNull()
    expect(document.body).not.toHaveTextContent(/comes from a template|written by AI/)
    expect(screen.getByTestId("rewind-privacy-status")).toHaveTextContent("Public link off. Cards unsigned, no artwork.")
  })

  it("Read again dispatches READ_AGAIN, and Change opens the share sheet", async () => {
    const send = jest.fn()
    const user = userEvent.setup()
    renderPage(issues.heavy, send)
    await user.click(screen.getByTestId("rewind-read-again"))
    expect(send).toHaveBeenCalledWith({ type: "READ_AGAIN" })
    await user.click(screen.getByTestId("rewind-privacy-change"))
    expect(send).toHaveBeenCalledWith({ type: "OPEN_SHEET", sheet: "share-settings" })
  })

  it("draws its controls at artboard scale, each with a 44 px hit area (design 4.7)", () => {
    renderPage(issues.heavy)
    for (const id of ["rewind-back-cover-share", "rewind-privacy-change", "rewind-read-again", "rewind-contents", "rewind-done"]) {
      expect(screen.getByTestId(id)).toHaveClass("h-[calc(var(--u)*44px)]", "before:min-h-11", "before:min-w-11")
      expect(screen.getByTestId(id)).not.toHaveClass("h-11")
    }
  })

  it("reads the privacy line from the member's share choices and link", () => {
    const setup: ShareSetup = {
      rewindId: "wrapped-1", year: 2026, cards: ["cover"], artCards: [], allowArt: true, publicLinks: true, canShare: true,
      choices: { signed: true, includeArt: true, dailyDetail: false, cardFacts: [] },
      link: { shareId: "share-1", pages: ["cover"], expiresAt: null },
      seasonCloses: "31 January 2027",
      dailyCards: ["cover"], folios: {}, cardFactOptions: [], cardFactDefaults: {}, features: { editCard: false, saveAll: false },
    }
    render(
      <ShareProvider setup={setup} actions={{ enable: jest.fn(), rotate: jest.fn(), disable: jest.fn(), savePrefs: jest.fn() }}>
        <PlayerProvider value={jest.fn()} sheet={null}>
          <BackCoverPage data={dataOf(issues.heavy)} issue={issueContext(issues.heavy, { returnTo: "/account" })} />
        </PlayerProvider>
      </ShareProvider>
    )
    expect(screen.getByTestId("rewind-privacy-status")).toHaveTextContent("Public link on. Cards signed, with artwork.")
  })

  it("Done follows the return path", () => {
    renderPage(issues.heavy)
    expect(screen.getByTestId("rewind-done")).toHaveAttribute("href", "/account")
  })

  it("Contents opens through the player and lists every selected page with its folio", async () => {
    const send = jest.fn()
    const user = userEvent.setup()
    renderPage(issues.heavy, send)
    await user.click(screen.getByTestId("rewind-contents"))
    expect(send).toHaveBeenCalledWith({ type: "OPEN_SHEET", sheet: "contents" })
  })

  it("Contents lists the folios and turns to a page", async () => {
    const send = jest.fn()
    const issue = issues.heavy
    renderPage(issue, send, "contents")
    const sheet = await screen.findByTestId("rewind-contents-sheet")
    const rows = within(sheet).getAllByTestId("rewind-contents-page")
    expect(rows.map((row) => row.textContent)).toEqual(issue.pages.map((p) => `${String(p.folio).padStart(2, "0")}${registry[p.type].name}`))
    await userEvent.setup().click(rows[1])
    expect(send).toHaveBeenCalledWith({ type: "CLOSE_SHEET" })
    expect(send).toHaveBeenCalledWith({ type: "GOTO", index: 1, source: "button" })
  })

  it("summarises the page deterministically", () => {
    expect(["heavy", "light"].map((id) => registry["back-cover"].srSummary(dataOf(issues[id]), issues[id].facts))).toMatchSnapshot()
  })
})
