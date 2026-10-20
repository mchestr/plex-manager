import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { rowTitle, TopShowsPage } from "@/components/rewind/pages/top-shows"
import { PlayerProvider } from "@/components/rewind/stage/player-context"
import { QuizProvider, resetQuizAnswers } from "@/components/rewind/stage/quiz-context"
import { PortalContainerProvider } from "@/components/ui/portal-container"
import { fixtureIssue, issueContext, type FixtureIssue } from "@/lib/rewind/__tests__/helpers/fixture-issue"
import type { GuessData } from "@/lib/rewind/pages/guess.schema"
import type { TopShowsData } from "@/lib/rewind/pages/top-lists.schema"
import { registry } from "@/lib/rewind/registry"
import type { RewindFactsV3 } from "@/lib/wrapped/facts/catalogue"

jest.mock("server-only", () => ({}))

const IDS = ["heavy", "median", "single-title", "zero-films", "long-and-non-latin-titles", "zero-series", "night-owl"] as const
const issues = {} as Record<(typeof IDS)[number], FixtureIssue>

beforeAll(async () => {
  for (const id of IDS) issues[id] = await fixtureIssue(id)
})

beforeEach(() => {
  resetQuizAnswers()
  window.sessionStorage.clear()
})

const dataOf = (issue: FixtureIssue) => issue.pages.find((p) => p.type === "top-shows")?.data as TopShowsData | undefined

function renderShows(issue: FixtureIssue, facts: RewindFactsV3 = issue.facts) {
  const send = jest.fn()
  render(
    <div data-theme="rewind">
      <PortalContainerProvider popupProps={{ "data-field": "paper" }}>
        <PlayerProvider value={send}>
          <QuizProvider year={2026}>
            <TopShowsPage data={dataOf(issue)!} issue={issueContext(issue, { facts })} />
          </QuizProvider>
        </PlayerProvider>
      </PortalContainerProvider>
    </div>
  )
  return send
}

const title = (issue: FixtureIssue, n: number) => issue.facts[`series[${n}].title` as keyof RewindFactsV3]!.display

describe("05 Top shows", () => {
  it.each(["heavy", "median", "zero-films", "long-and-non-latin-titles"] as const)("%s: the No. 1 feature and a row for each other series", (id) => {
    const issue = issues[id]
    renderShows(issue)
    const rows = dataOf(issue)!.rows
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("The shows you kept coming back to")
    expect(screen.getByRole("heading", { level: 3 })).toHaveTextContent(title(issue, 1))
    const list = screen.getAllByTestId("rewind-list-row")
    expect(list).toHaveLength(rows.length - 1)
    // every title reads whole, however it was broken into lines
    list.forEach((row, i) => expect(row).toHaveTextContent(title(issue, i + 2)))
  })

  it("is a single feature with one series, and omitted with none", () => {
    renderShows(issues["single-title"])
    expect(screen.getByTestId("rewind-top-shows-feature")).toBeInTheDocument()
    expect(screen.queryByRole("list")).not.toBeInTheDocument()
    const none = issues["zero-series"]
    expect(registry["top-shows"].select(none.facts, { edition: "full", archetype: null, disabledPages: [], stats: none.stats })).toBeNull()
  })

  it("joins the fitted lines back into the title, and ellipsizes only beyond 3 lines", () => {
    for (const id of IDS) {
      for (let n = 1; n <= 5; n++) {
        const text = issues[id].facts[`series[${n}].title` as keyof RewindFactsV3]?.display
        if (!text) continue
        const fit = rowTitle(text)
        if (fit.safeMode || fit.ellipsized) expect(fit.ariaLabel).toBe(text)
        else expect(fit.lines.map((l) => l.text).join(" ")).toBe(text)
        expect(fit.lines.length).toBeLessThanOrEqual(3)
      }
    }
  })

  it("sets safe-mode titles with dir=auto", () => {
    const issue = issues["long-and-non-latin-titles"]
    renderShows(issue, { ...issue.facts, "series[2].title": { value: "深夜食堂", display: "深夜食堂", unit: "title" } })
    const row = screen.getAllByTestId("rewind-list-row")[0]
    expect(within(row).getByText("深夜食堂")).toHaveAttribute("dir", "auto")
  })

  it("shows the viewer rank from 3 viewers, never below", () => {
    const facts = (count: number): RewindFactsV3 => ({
      ...issues.heavy.facts,
      "series[1].viewerRank": { value: 1, display: "#1", unit: "rank" },
      "series[1].viewerCount": { value: count, display: String(count), unit: "count" },
    })
    renderShows(issues.heavy, facts(2))
    expect(screen.queryByTestId("rewind-viewer-rank")).not.toBeInTheDocument()
    renderShows(issues.heavy, facts(6))
    expect(screen.getByTestId("rewind-viewer-rank")).toHaveTextContent("#1 of 6 viewers here")
  })

  it("prints the quiz callback after a series quiz was answered", () => {
    const issue = issues["night-owl"]
    const guess = issue.pages.find((p) => p.type === "guess")!.data as GuessData
    const second = guess.options.find((o) => o.rank === 2)!
    renderShows(issue)
    const deck = screen.getByTestId("rewind-top-shows-deck").textContent
    expect(deck).not.toContain("You guessed")

    window.sessionStorage.setItem("rewind:quiz:2026", JSON.stringify({ key: second.key, rank: 2, title: second.title, kind: "series" }))
    resetQuizAnswers()
    document.body.innerHTML = ""
    renderShows(issue)
    expect(screen.getByTestId("rewind-top-shows-deck").textContent).toBe(`You guessed ${second.title}. Close: it came second, ${issue.facts["quiz.gapMinutes"]!.display} behind.`)
  })

  it("opens a row's sheet with its numbers and months, pausing through OPEN_SHEET", async () => {
    const user = userEvent.setup()
    const send = renderShows(issues.heavy)
    await user.click(screen.getAllByTestId("rewind-list-row")[0])
    expect(send).toHaveBeenCalledWith({ type: "OPEN_SHEET", sheet: "row" })
    const sheet = await screen.findByTestId("rewind-row-sheet")
    expect(within(sheet).getByRole("heading")).toHaveTextContent(title(issues.heavy, 2))
    expect(within(sheet).getAllByRole("columnheader").map((c) => c.textContent)).toEqual(["Month", "Watched"])
    await user.keyboard("{Escape}")
    expect(send).toHaveBeenCalledWith({ type: "CLOSE_SHEET" })
  })

  it("tabulates every row by month, and summarises deterministically", () => {
    const issue = issues.heavy
    const table = registry["top-shows"].table!(dataOf(issue)!, issue.facts, { locale: "en-US" })!
    expect(table.columns[0]).toBe("Series")
    expect(table.columns).toHaveLength(1 + 11 + 1)
    expect(table.rows).toHaveLength(5)
    expect(registry["top-shows"].srSummary(dataOf(issue)!, issue.facts)).toMatchSnapshot()
  })
})
