import { render, screen } from "@testing-library/react"
import { useReducedMotion } from "motion/react"

import { RacePage } from "@/components/rewind/pages/race"
import { StagePage } from "@/components/rewind/stage/stage-page"
import { issueContext, type FixtureIssue } from "@/lib/rewind/__tests__/helpers/fixture-issue"
import type { RaceData } from "@/lib/rewind/pages/race.schema"
import { registry } from "@/lib/rewind/registry"
import { pageInk } from "@/lib/rewind/stage/page-ink"
import { raceGeometry } from "@/lib/rewind/viz/race"
import { renderCopyText } from "@/lib/wrapped/copy/render-copy"
import { headline } from "@/lib/wrapped/copy/templates"

import { hasCleanCounts, loadIssues, PAGE_FIXTURES, pageData, plainText } from "./page-copy-rules"

jest.mock("server-only", () => ({}))

let issues: Map<string, FixtureIssue>
const animate = jest.fn(() => ({ cancel: jest.fn() }))

beforeAll(async () => {
  issues = await loadIssues()
  Object.defineProperty(Element.prototype, "animate", { value: animate, configurable: true, writable: true })
})

afterAll(() => {
  Reflect.deleteProperty(Element.prototype, "animate")
})

beforeEach(() => {
  animate.mockClear()
  jest.mocked(useReducedMotion).mockReturnValue(false)
})

const ink = pageInk(registry.race, null)

/** The race as page 1 of a two-page stage, with page `current` showing. */
function Stage({ issue, data, current }: { issue: FixtureIssue; data: RaceData; current: number }) {
  return (
    <StagePage index={1} current={current} previous={null} ink={ink} label="Page 2 of 2: The race">
      <RacePage data={data} issue={issueContext(issue)} />
    </StagePage>
  )
}

describe("11 The race", () => {
  it.each(PAGE_FIXTURES)("%s: renders the final standings, the who-led strip and a summary", (id) => {
    const issue = issues.get(id)!
    const data = pageData<RaceData>(issue, "race")
    if (!data) return expect(issue.stats.race.eligible).toBe(false)
    render(<RacePage data={data} issue={issueContext(issue)} />)
    expect(plainText(screen.getByRole("heading", { level: 2 }).textContent!)).toBe(plainText(renderCopyText(headline("race", issue.facts), issue.facts)))
    expect(screen.getAllByTestId("rewind-race-row")).toHaveLength(data.series.length)
    expect(screen.getByTestId("rewind-race-clock")).toHaveTextContent("November")
    expect(screen.getByTestId("rewind-race-strip")).toBeInTheDocument()
    expect(screen.getByTestId("rewind-figure")).toHaveAttribute("aria-label", registry.race.srSummary(data, issue.facts))
    // the rows rest at their final ranks
    const { rows } = raceGeometry(data.frames, { pitch: 1 })
    screen.getAllByTestId("rewind-race-row").forEach((row, i) => expect(row.style.transform).toBe(`translateY(${rows[i].offset.at(-1)! * 100}%)`))
    expect(hasCleanCounts(document.body.textContent!)).toBe(true)
  })

  it("names every title whole, breaking a long one only between words", () => {
    const issue = issues.get("heavy")!
    const data = pageData<RaceData>(issue, "race")!
    render(<RacePage data={data} issue={issueContext(issue)} />)
    screen.getAllByTestId("rewind-race-row").forEach((row, i) => expect(row.textContent!.replace(/\s+/g, " ").trim()).toBe(data.series[i].title))
  })

  it("plays once with element.animate on the first visit, and not on a revisit", () => {
    const issue = issues.get("heavy")!
    const data = pageData<RaceData>(issue, "race")!
    const { rerender } = render(<Stage issue={issue} data={data} current={0} />)
    expect(animate).not.toHaveBeenCalled()
    rerender(<Stage issue={issue} data={data} current={1} />)
    // a bar and a lane per runner, and the month clock
    expect(animate).toHaveBeenCalledTimes(data.series.length * 2 + 1)
    const [, timing] = animate.mock.calls[0] as unknown[]
    expect(timing).toMatchObject({ duration: 5720 })
    rerender(<Stage issue={issue} data={data} current={0} />)
    rerender(<Stage issue={issue} data={data} current={1} />)
    expect(animate).toHaveBeenCalledTimes(data.series.length * 2 + 1)
  })

  it("shows the final frame at once under reduced motion", () => {
    jest.mocked(useReducedMotion).mockReturnValue(true)
    const issue = issues.get("heavy")!
    const data = pageData<RaceData>(issue, "race")!
    render(<Stage issue={issue} data={data} current={1} />)
    expect(animate).not.toHaveBeenCalled()
    expect(screen.getByTestId("rewind-race-clock")).toHaveTextContent("November")
  })

  it("reads the race events: who led, then the month the lead changed", () => {
    const facts = issues.get("heavy")!.facts
    const text = plainText(renderCopyText(headline("race", facts), facts))
    expect(text).toMatch(/ led (for (one month|[a-z]+ months)\. Then came [A-Z][a-z]+\.|all year\. Nothing came close\.)$/)
  })

  it("summarises the page deterministically", () => {
    expect(PAGE_FIXTURES.map((id) => {
      const data = pageData<RaceData>(issues.get(id)!, "race")
      return data && registry.race.srSummary(data, issues.get(id)!.facts)
    })).toMatchSnapshot()
  })
})
