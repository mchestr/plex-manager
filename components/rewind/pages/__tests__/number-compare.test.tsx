import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { NumberPage } from "@/components/rewind/pages/number"
import { fixtureIssue, issueContext, type FixtureIssue } from "@/lib/rewind/__tests__/helpers/fixture-issue"
import { NO_REWIND_FEATURES } from "@/lib/rewind/features"
import type { NumberData } from "@/lib/rewind/pages/number.schema"
import { registry } from "@/lib/rewind/registry"

jest.mock("server-only", () => ({}))

let heavy: FixtureIssue

beforeAll(async () => {
  heavy = await fixtureIssue("heavy")
})

const ON = { ...NO_REWIND_FEATURES, compare2025: true }

function renderNumber(data: NumberData, features = ON) {
  render(<NumberPage data={data} issue={issueContext(heavy, { features })} />)
}

const dataOf = () => registry.number.select(heavy.facts, { edition: heavy.edition, archetype: null, disabledPages: [], stats: heavy.stats })!

describe("Compare with 2025 (P8.4)", () => {
  it("toggles aria-pressed and the figure's label with Space", async () => {
    const user = userEvent.setup()
    const data = dataOf()
    expect(data.lastYearDaily?.some((m) => m > 0)).toBe(true)
    renderNumber(data)
    const toggle = await screen.findByTestId("rewind-compare-2025")
    expect(toggle).toHaveAccessibleName("Compare with 2025")
    expect(toggle).toHaveAttribute("aria-pressed", "false")
    const figure = screen.getByRole("img", { name: registry.number.srSummary(data, heavy.facts) })

    toggle.focus()
    await user.keyboard(" ")
    expect(toggle).toHaveAttribute("aria-pressed", "true")
    expect(figure).toHaveAccessibleName(/^2026 above, 2025 below, as 7-day averages\. 2026 was ahead in \d+ of \d+ months\.$/)
    expect(screen.getByTestId("rewind-compare-strip")).toHaveAttribute("data-compare", "true")

    await user.keyboard(" ")
    expect(toggle).toHaveAttribute("aria-pressed", "false")
    expect(figure).toHaveAccessibleName(registry.number.srSummary(data, heavy.facts))
  })

  it("never turns the page: it sits inside data-rw-interactive", async () => {
    renderNumber(dataOf())
    expect((await screen.findByTestId("rewind-compare-2025")).closest("[data-rw-interactive]")).not.toBeNull()
  })

  it("is absent without last-year history, or when it sums to zero", () => {
    const { lastYearDaily, ...rest } = dataOf()
    renderNumber(rest)
    expect(screen.queryByTestId("rewind-compare-2025")).not.toBeInTheDocument()
    renderNumber({ ...rest, lastYearDaily: lastYearDaily!.map(() => 0) })
    expect(screen.queryByTestId("rewind-compare-2025")).not.toBeInTheDocument()
  })

  it("is absent with the flag off, and the page keeps its road", () => {
    renderNumber(dataOf(), NO_REWIND_FEATURES)
    expect(screen.queryByTestId("rewind-compare-2025")).not.toBeInTheDocument()
    expect(screen.getByText("The road to 1,307")).toBeInTheDocument()
  })
})
