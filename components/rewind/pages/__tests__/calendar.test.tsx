import { render, screen, within } from "@testing-library/react"

import { CalendarPage } from "@/components/rewind/pages/calendar"
import { fixtureIssue, issueContext, type FixtureIssue } from "@/lib/rewind/__tests__/helpers/fixture-issue"
import { calendarDays, GRID_ACTIVE_DAYS } from "@/lib/rewind/pages/calendar"
import { CalendarDataSchema } from "@/lib/rewind/pages/calendar.schema"
import { registry } from "@/lib/rewind/registry"

jest.mock("server-only", () => ({}))

const IDS = ["heavy", "light", "night-owl", "seven-minutes"] as const
const issues: Record<string, FixtureIssue> = {}

beforeAll(async () => {
  for (const id of IDS) issues[id] = await fixtureIssue(id)
})

/** The page's data whether or not the edition prints it (the postcard prints none). */
const dataOf = (issue: FixtureIssue) =>
  registry.calendar.select(issue.facts, { edition: "full", archetype: issue.archetype?.id ?? null, disabledPages: [], stats: issue.stats })!

describe("10 The calendar", () => {
  it.each(IDS)("%s: is always kept, with a valid day for every day of the window", (id) => {
    const issue = issues[id]
    const data = dataOf(issue)
    expect(CalendarDataSchema.parse(JSON.parse(JSON.stringify(data)))).toEqual(data)
    expect(data.days).toHaveLength(issue.stats.calendar.minutes.length)
  })

  it("stores each day's minutes and top title, and every key resolves in the titles map (P8.3)", () => {
    const issue = issues.heavy
    const data = dataOf(issue)
    const days = calendarDays(data, issue.facts)
    expect(days[0].date).toBe(issue.facts["window.from"]!.value)
    expect(days.map((d) => d.minutes)).toEqual(issue.stats.calendar.minutes.map((d) => d.minutes))
    const keyed = data.days.filter((d) => d.key !== null)
    expect(keyed.length).toBeGreaterThan(200)
    for (const day of keyed) expect(data.titles[day.key!]).toEqual(expect.any(String))
    const top = issue.stats.calendar.topTitle[0]
    expect(days.find((d) => d.date === top.date)!.key).toBe(top.key)
    expect(data.titles[top.key]).toBe(top.title)
    expect(CalendarDataSchema.safeParse({ ...data, titles: {} }).success).toBe(false)
  })

  it.each(["heavy", "night-owl"])("%s: draws the grid with the streak headline and the key", (id) => {
    const issue = issues[id]
    render(<CalendarPage data={dataOf(issue)} issue={issueContext(issue)} />)
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(`${issue.facts["streak.longest.days"]!.display.replace(/\u00A0/g, " ")} without a night off`)
    expect(screen.queryByTestId("rewind-calendar-dates")).not.toBeInTheDocument()
    const figure = screen.getByTestId("rewind-figure")
    expect(figure.querySelectorAll("rect").length).toBe(issue.stats.calendar.minutes.length)
    expect(figure).toHaveTextContent(`Biggest day, ${issue.facts["days.biggest.date"]!.display}`.replace(/\u00A0/g, " "))
  })

  it("lists the active dates in one row under 5 active days", () => {
    const issue = issues["seven-minutes"]
    const data = dataOf(issue)
    const played = data.days.filter((d) => d.minutes > 0)
    expect(played.length).toBeLessThan(GRID_ACTIVE_DAYS)
    render(<CalendarPage data={data} issue={issueContext(issue)} />)
    expect(within(screen.getByTestId("rewind-calendar-dates")).getAllByRole("listitem")).toHaveLength(played.length)
    expect(screen.getByTestId("rewind-figure").querySelector("svg rect")).toBeNull()
  })

  it("tabulates the minutes of each day played, with no zone in the caption", () => {
    const issue = issues.light
    const data = dataOf(issue)
    const table = registry.calendar.table!(data, issue.facts, { locale: "en-US" })!
    expect(table.rows).toHaveLength(data.days.filter((d) => d.minutes > 0).length)
    expect(table.columns).toEqual(["Day", "Watched", "Most watched"])
    expect(table.caption).not.toContain(issue.facts["tz.label"]!.display)
  })

  it("summarises the page deterministically", () => {
    expect(IDS.map((id) => registry.calendar.srSummary(dataOf(issues[id]), issues[id].facts))).toMatchSnapshot()
  })
})
