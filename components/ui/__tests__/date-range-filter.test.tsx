import { fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { axe, toHaveNoViolations } from "jest-axe"

import { currentHref, resetUrl } from "@/__tests__/helpers/url-router"
import { DateRangeFilter } from "@/components/ui/date-range-filter"
import { addDays, dateRangeToInstants, parseDateRange, presetRange } from "@/lib/ui/date-range"

expect.extend(toHaveNoViolations)

jest.mock("next/navigation", () => require("@/__tests__/helpers/url-router").navigationModule)

// 03:00 UTC on 21 October is still 20 October in Los Angeles.
const NOW = Date.parse("2026-10-21T03:00:00Z")

beforeEach(() => {
  resetUrl("/admin/llm-usage?conversationId=c_42")
  jest.spyOn(Date, "now").mockReturnValue(NOW)
})
afterEach(() => jest.restoreAllMocks())

describe("DateRangeFilter", () => {
  it("writes a preset ending today in the server zone, end inclusive", async () => {
    const user = userEvent.setup()
    const { container } = render(<DateRangeFilter zone="America/Los_Angeles" data-testid="usage-dates" />)
    expect(await axe(container)).toHaveNoViolations()

    await user.click(screen.getByTestId("usage-dates-preset"))
    await user.click(await screen.findByRole("option", { name: "Last 7 days" }))
    expect(currentHref()).toBe("/admin/llm-usage?conversationId=c_42&from=2026-10-14&to=2026-10-20")
    expect(screen.getByLabelText("From")).toHaveValue("2026-10-14")
    expect(screen.getByLabelText("To")).toHaveValue("2026-10-20")
  })

  it("offers This season when given one", async () => {
    const user = userEvent.setup()
    render(<DateRangeFilter zone="UTC" season={{ from: "2026-01-01", to: "2026-11-30" }} data-testid="usage-dates" />)
    await user.click(screen.getByTestId("usage-dates-preset"))
    await user.click(await screen.findByRole("option", { name: "This season" }))
    expect(currentHref()).toBe("/admin/llm-usage?conversationId=c_42&from=2026-01-01&to=2026-11-30")
  })

  it("refuses an end before the start and leaves the URL alone", () => {
    resetUrl("/admin/llm-usage?from=2026-10-10&to=2026-10-12")
    render(<DateRangeFilter zone="UTC" data-testid="usage-dates" />)
    fireEvent.change(screen.getByLabelText("To"), { target: { value: "2026-10-01" } })
    expect(screen.getByTestId("usage-dates-error")).toHaveTextContent("The end date is before the start date.")
    expect(screen.getByLabelText("To")).toHaveAttribute("aria-invalid", "true")
    expect(currentHref()).toBe("/admin/llm-usage?from=2026-10-10&to=2026-10-12")

    fireEvent.change(screen.getByLabelText("To"), { target: { value: "2026-10-10" } })
    expect(screen.queryByTestId("usage-dates-error")).not.toBeInTheDocument()
    expect(currentHref()).toBe("/admin/llm-usage?from=2026-10-10&to=2026-10-10")
  })

  it("shows a range from the URL as Custom when it matches no preset", () => {
    resetUrl("/admin/llm-usage?from=2026-03-02&to=2026-03-09")
    render(<DateRangeFilter zone="UTC" data-testid="usage-dates" />)
    expect(screen.getByTestId("usage-dates-preset")).toHaveTextContent("Custom")
  })
})

describe("date-range helpers", () => {
  it("counts the end day in a preset", () => {
    expect(presetRange("7d", "2026-10-20")).toEqual({ from: "2026-10-14", to: "2026-10-20" })
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01")
  })

  it("turns an inclusive end into the next midnight in the zone", () => {
    const { gte, lt } = dateRangeToInstants({ from: "2026-10-14", to: "2026-10-20" }, "America/Los_Angeles")
    expect(gte.toISOString()).toBe("2026-10-14T07:00:00.000Z")
    expect(lt.toISOString()).toBe("2026-10-21T07:00:00.000Z")
  })

  it("parses only a whole, ordered range", () => {
    expect(parseDateRange({ from: "2026-10-01", to: "2026-10-05" })).toEqual({ from: "2026-10-01", to: "2026-10-05" })
    expect(parseDateRange({ from: "2026-10-05", to: "2026-10-01" })).toBeNull()
    expect(parseDateRange({ from: "2026-02-30", to: "2026-03-01" })).toBeNull()
    expect(parseDateRange({ from: "2026-10-01" })).toBeNull()
  })
})
