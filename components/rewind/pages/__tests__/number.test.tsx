import { render, screen } from "@testing-library/react"

import { NumberPage } from "@/components/rewind/pages/number"
import { fixtureIssue, issueContext, type FixtureIssue } from "@/lib/rewind/__tests__/helpers/fixture-issue"
import type { NumberData } from "@/lib/rewind/pages/number.schema"
import { registry } from "@/lib/rewind/registry"
import type { RewindFactsV3 } from "@/lib/wrapped/facts/catalogue"

jest.mock("server-only", () => ({}))

const issues: Record<string, FixtureIssue> = {}

beforeAll(async () => {
  for (const id of ["heavy", "median", "light", "zero-films"]) issues[id] = await fixtureIssue(id)
})

const dataOf = (issue: FixtureIssue) => issue.pages.find((p) => p.type === "number")!.data as NumberData

function renderNumber(issue: FixtureIssue, facts: RewindFactsV3 = issue.facts) {
  const data = registry.number.select(facts, { edition: issue.edition, archetype: null, disabledPages: [], stats: issue.stats })!
  render(<NumberPage data={data} issue={issueContext(issue, { facts })} />)
  return data
}

/** The light fixture with its total replaced, to read the hero's small forms. */
function withTotal(issue: FixtureIssue, minutes: number, display: string): RewindFactsV3 {
  const facts = { ...issue.facts, "time.totalMinutes": { value: minutes, display, unit: "duration" as const } }
  delete facts["time.totalHours"]
  return facts
}

describe("02 The number", () => {
  it("sets 1,307 hours for the heavy fixture, with its split, counts and stamp", () => {
    renderNumber(issues.heavy)
    // the halftone duplicate of the numeral is aria-hidden
    expect(screen.getByRole("heading", { level: 2 })).toHaveAccessibleName("This year you pressed play for 1,307 hours")
    expect(screen.getByTestId("rewind-number-split")).toHaveTextContent("Series 872 h, 67%")
    expect(screen.getByTestId("rewind-number-split")).toHaveTextContent("Films 435 h, 33%")
    for (const text of ["586", "31", "112", "episodes", "films"]) expect(screen.getAllByText(text).length).toBeGreaterThan(0)
    expect(screen.getByText("The road to 1,307")).toBeInTheDocument()
  })

  it("stamps the change on the same months of 2025, and hides it without last year's data", () => {
    renderNumber(issues.heavy)
    expect(screen.getByTestId("rewind-number-stamp")).toHaveTextContent("+18%on the samemonths of 2025")
    // In the flow beside "hours", so the deck starts below it
    expect(screen.getByTestId("rewind-number-stamp")).not.toHaveClass("absolute")
    expect(screen.getByTestId("rewind-number-stamp").style.marginTop).toBe("calc(var(--u) * -62px)")
    const facts = { ...issues.heavy.facts }
    delete facts["time.vsLastYear"]
    renderNumber(issues.light, facts)
    expect(screen.getAllByTestId("rewind-number-stamp")).toHaveLength(1)
  })

  it("reads 7 h 20 m under 10 hours and 47 minutes under one, with no 'hours'", () => {
    const data = renderNumber(issues.light, withTotal(issues.light, 440, "7\u00A0h 20\u00A0m"))
    expect(data.hero).toBe("time.totalMinutes")
    expect(screen.getByRole("heading", { level: 2 })).toHaveAccessibleName("This year you pressed play for 7\u00A0h 20\u00A0m")
    expect(screen.getByRole("heading", { level: 2 })).not.toHaveTextContent("hours")
  })

  it("reads 47 minutes under an hour", () => {
    renderNumber(issues.light, withTotal(issues.light, 47, "47 minutes"))
    expect(screen.getByRole("heading", { level: 2 })).toHaveAccessibleName("This year you pressed play for 47 minutes")
  })

  it("hides the split bar and the zero count when there are no films", () => {
    renderNumber(issues["zero-films"])
    expect(screen.queryByTestId("rewind-number-split")).not.toBeInTheDocument()
    expect(screen.queryByText("films")).not.toBeInTheDocument()
    expect(document.body).not.toHaveTextContent(/\b0 films?\b/)
  })

  it("tabulates watch time by month with the milestones", () => {
    const table = registry.number.table!(dataOf(issues.heavy), issues.heavy.facts, { locale: "en-US" })!
    expect(table.columns).toEqual(["Month", "Watched", "Milestones"])
    expect(table.rows).toHaveLength(11)
    expect(table.rows[0][0]).toBe("January")
    expect(table.caption).toContain("America/Chicago")
    expect(table.rows.flatMap((r) => (r[2] ? [r[2]] : []))).toHaveLength(4)
  })

  it("summarises the page deterministically", () => {
    expect(["heavy", "median", "light"].map((id) => registry.number.srSummary(dataOf(issues[id]), issues[id].facts))).toMatchSnapshot()
  })
})
