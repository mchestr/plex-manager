import { act, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { renderToString } from "react-dom/server"

import { CalendarGrid } from "@/components/rewind/calendar/calendar-grid"
import { fixtureIssue, type FixtureIssue } from "@/lib/rewind/__tests__/helpers/fixture-issue"
import type { ArticleBlock } from "@/lib/rewind/article/blocks"
import type { CalendarData } from "@/lib/rewind/pages/calendar.schema"
import { registry } from "@/lib/rewind/registry"

jest.mock("server-only", () => ({}))

let heavy: FixtureIssue
let block: Extract<ArticleBlock, { kind: "calendar" }>

const ctx = (grid: boolean) => ({ locale: "en-US", features: { "calendar.grid": grid } })

beforeAll(async () => {
  heavy = await fixtureIssue("heavy")
  const data = registry.calendar.select(heavy.facts, { edition: "full", archetype: null, disabledPages: [], stats: heavy.stats }) as CalendarData
  const notes = registry.calendar.notes!(data, heavy.facts, ctx(true))
  block = notes.find((b): b is typeof block => b.kind === "calendar")!
})

const cells = () => screen.getAllByRole("gridcell")
const focusable = () => cells().filter((cell) => cell.getAttribute("tabindex") === "0")

describe("CalendarGrid (P8.3)", () => {
  it("is built by the Notes only under calendar.grid; the flag off keeps the month tables", async () => {
    const data = registry.calendar.select(heavy.facts, { edition: "full", archetype: null, disabledPages: [], stats: heavy.stats }) as CalendarData
    const kinds = registry.calendar.notes!(data, heavy.facts, ctx(false)).map((b) => b.kind)
    expect(kinds).not.toContain("calendar")
    expect(kinds).toContain("table")
    expect(block.tables.length).toBeGreaterThan(0)
    expect(block.months.length).toBe(11)
  })

  it("renders plain month tables on the server, with no grid roles", () => {
    const html = renderToString(<CalendarGrid caption={block.caption} tables={block.tables} months={block.months} />)
    expect(html).toContain("<table")
    expect(html).toContain("<caption")
    expect(html).not.toContain('role="grid"')
    expect(html).not.toContain("gridcell")
  })

  it("hydrates into a grid with month row headers and exactly one focusable cell", () => {
    render(<CalendarGrid caption={block.caption} tables={block.tables} months={block.months} />)
    expect(screen.getByRole("grid")).toHaveAccessibleName(block.caption)
    expect(screen.getAllByRole("row")).toHaveLength(block.months.length)
    expect(screen.getAllByRole("rowheader").map((h) => h.textContent)).toEqual(block.months.map((m) => m.label))
    expect(cells()).toHaveLength(block.months.reduce((n, m) => n + m.days.length, 0))
    expect(focusable()).toHaveLength(1)
    expect(cells()[0]).toHaveAccessibleName(block.months[0].days[0].label)
    cells().forEach((cell) => expect(cell.className).toContain("size-6"))
  })

  it("moves focus with the arrows, Home and End, and Enter reads the day", async () => {
    const user = userEvent.setup()
    render(<CalendarGrid caption={block.caption} tables={block.tables} months={block.months} />)
    const [jan, feb, mar] = block.months
    act(() => cells()[0].focus())
    await user.keyboard("{ArrowRight}")
    expect(document.activeElement).toHaveAccessibleName(jan.days[1].label)
    await user.keyboard("{ArrowLeft}{ArrowLeft}")
    expect(document.activeElement).toHaveAccessibleName(jan.days[0].label)
    await user.keyboard("{End}")
    expect(document.activeElement).toHaveAccessibleName(jan.days[30].label)
    // 31 January moves to the last day of February, clamped
    await user.keyboard("{ArrowDown}")
    expect(document.activeElement).toHaveAccessibleName(feb.days.at(-1)!.label)
    await user.keyboard("{ArrowDown}")
    expect(document.activeElement).toHaveAccessibleName(mar.days[feb.days.length - 1].label)
    await user.keyboard("{Home}")
    expect(document.activeElement).toHaveAccessibleName(mar.days[0].label)
    await user.keyboard("{ArrowUp}")
    expect(document.activeElement).toHaveAccessibleName(feb.days[0].label)
    expect(focusable()).toHaveLength(1)
    expect(focusable()[0]).toBe(document.activeElement)

    await user.keyboard("{Enter}")
    expect(screen.getByTestId("rewind-calendar-detail")).toHaveTextContent(feb.days[0].label.replace(/ /g, " "))
  })
})
