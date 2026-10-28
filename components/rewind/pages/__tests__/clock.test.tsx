import { render, screen } from "@testing-library/react"

import { ClockPage } from "@/components/rewind/pages/clock"
import { fixtureIssue, issueContext, type FixtureIssue } from "@/lib/rewind/__tests__/helpers/fixture-issue"
import { CLOCK_PLAYS } from "@/lib/rewind/pages/clock"
import type { ClockData } from "@/lib/rewind/pages/clock.schema"
import { registry } from "@/lib/rewind/registry"

jest.mock("server-only", () => ({}))

const IDS = ["heavy", "light", "night-owl", "seven-minutes"] as const
const issues: Record<string, FixtureIssue> = {}

beforeAll(async () => {
  for (const id of IDS) issues[id] = await fixtureIssue(id)
})

const dataOf = (issue: FixtureIssue) => issue.pages.find((p) => p.type === "clock")?.data as ClockData | undefined
const selectFor = (issue: FixtureIssue) =>
  registry.clock.select(issue.facts, { edition: "full", archetype: issue.archetype?.id ?? null, disabledPages: [], stats: issue.stats })
const text = (s: string) => s.replace(/[\u00A0\u202F]/g, " ")

describe("09 The clock", () => {
  it.each(IDS)("%s: is kept only with more than 10 counted plays", (id) => {
    const issue = issues[id]
    expect(selectFor(issue) !== null).toBe(issue.stats.plays > CLOCK_PLAYS)
  })

  it.each(["heavy", "night-owl"])("%s: sets the peak hour, the after-dark share and the weekday row", (id) => {
    const issue = issues[id]
    const data = dataOf(issue)!
    render(<ClockPage data={data} issue={issueContext(issue)} />)
    expect(text(screen.getByRole("heading", { level: 2 }).textContent!)).toBe(text(`Your hour is ${issue.facts["hours.peak"]!.display}`))
    expect(screen.getByText(issue.facts["hours.afterDarkShare"]!.display)).toBeInTheDocument()
    expect(text(document.body.textContent!)).toContain("started 10 PM to 4 AM")
    expect(text(document.body.textContent!)).toContain("your busiest hour")
    expect(data.hours).toHaveLength(24)
    expect(data.hours.reduce((a, b) => a + b, 0)).toBe(issue.stats.plays)
    expect(data.weekdays.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6)
    expect(screen.getByTestId("rewind-figure")).toHaveAttribute("aria-label", registry.clock.srSummary(data, issue.facts))
  })

  it("never names a time zone: the times are the member's own", () => {
    const issue = issues.heavy
    render(<ClockPage data={dataOf(issue)!} issue={issueContext(issue)} />)
    expect(document.body).not.toHaveTextContent(issue.facts["tz.label"]!.display)
    expect(document.body).not.toHaveTextContent(/time zone/i)
  })

  it("tabulates the 24 hours, with no zone in the caption", () => {
    const issue = issues.heavy
    const table = registry.clock.table!(dataOf(issue)!, issue.facts, { locale: "en-US" })!
    expect(table.rows).toHaveLength(24)
    expect(table.columns).toEqual(["Hour", "Plays", "Share"])
    expect(text(table.rows[22][0])).toBe("10 PM")
    expect(table.caption).not.toContain(issue.facts["tz.label"]!.display)
  })

  it("summarises the page deterministically", () => {
    expect(["heavy", "night-owl"].map((id) => registry.clock.srSummary(dataOf(issues[id])!, issues[id].facts))).toMatchSnapshot()
  })
})
