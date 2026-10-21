import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useReducer } from "react"

import { DayPicker } from "@/components/rewind/sheets/day-picker-sheet"
import { PlayerProvider } from "@/components/rewind/stage/player-context"
import { fixtureIssue, type FixtureIssue } from "@/lib/rewind/__tests__/helpers/fixture-issue"
import { calendarDayRows, type CalendarDayRow } from "@/lib/rewind/pages/calendar"
import type { CalendarData } from "@/lib/rewind/pages/calendar.schema"
import { registry } from "@/lib/rewind/registry"
import { initPlayer, playerReducer, type PlayerMode } from "@/lib/rewind/stage/player-reducer"

jest.mock("server-only", () => ({}))

let heavy: FixtureIssue
let data: CalendarData
let days: CalendarDayRow[]

beforeAll(async () => {
  heavy = await fixtureIssue("heavy")
  data = registry.calendar.select(heavy.facts, { edition: "full", archetype: null, disabledPages: [], stats: heavy.stats }) as CalendarData
  days = calendarDayRows(data, heavy.facts, { locale: "en-US" })
})

/** The picker under a real player, starting in `mode`. */
function Harness({ mode, rows = days }: { mode: PlayerMode; rows?: CalendarDayRow[] }) {
  const [state, send] = useReducer(playerReducer, { ...initPlayer({ kinds: ["timed", "timed"], autoplay: true }), mode })
  return (
    <PlayerProvider value={send} sheet={state.mode === "sheet" ? state.sheet : null}>
      <span data-testid="mode">{state.mode}</span>
      <DayPicker days={rows} initialMonth={7} locale="en-US" />
    </PlayerProvider>
  )
}

const rowTexts = () => screen.getAllByTestId("rewind-day-picker-row").map((row) => row.textContent!.replace(/ /g, " "))

describe("Pick a day (P8.3)", () => {
  it("is a 44 px button that says it opens a dialog", () => {
    render(<Harness mode="playing" />)
    const button = screen.getByTestId("rewind-day-picker")
    expect(button).toHaveTextContent("Pick a day")
    expect(button).toHaveAttribute("aria-haspopup", "dialog")
    expect(button).toHaveAttribute("data-rw-interactive")
    expect(button.className).toContain("h-11")
  })

  it("opens on the biggest day's month with a 44 px row per day", async () => {
    const user = userEvent.setup()
    render(<Harness mode="playing" />)
    await user.click(screen.getByTestId("rewind-day-picker"))
    const sheet = await screen.findByTestId("rewind-day-picker-sheet")
    expect(within(sheet).getByRole("radiogroup", { name: "Month" })).toBeInTheDocument()
    expect(within(sheet).getByRole("radio", { name: "July" })).toBeChecked()
    const july = days.filter((day) => day.month === 7)
    expect(rowTexts()).toEqual(july.map((day) => day.label.replace(/ /g, " ")))
    screen.getAllByTestId("rewind-day-picker-row").forEach((row) => expect(row.className).toContain("min-h-11"))
    const played = july.find((day) => day.title)!
    expect(played.label).toMatch(new RegExp(`^Jul\\u00A0\\d+, .+, mostly ${played.title!.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`))
    expect(within(sheet).getAllByText(played.title!)[0].tagName).toBe("I")
  })

  it("reads a day without plays as no plays", async () => {
    const user = userEvent.setup()
    const rows = days.map((day, i) => (i === 0 ? { ...day, month: 7, minutes: 0, watched: null, title: null, label: `${day.day}, no plays` } : day))
    render(<Harness mode="playing" rows={rows} />)
    await user.click(screen.getByTestId("rewind-day-picker"))
    expect(rowTexts()[0]).toMatch(/^Jan 1, no plays$/)
  })

  it("moves the month with the arrows", async () => {
    const user = userEvent.setup()
    render(<Harness mode="playing" />)
    await user.click(screen.getByTestId("rewind-day-picker"))
    const july = await screen.findByRole("radio", { name: "July" })
    july.focus()
    await user.keyboard("{ArrowRight}")
    expect(screen.getByRole("radio", { name: "August" })).toBeChecked()
    expect(rowTexts()[0]).toMatch(/^Aug 1,/)
    await user.keyboard("{ArrowLeft}{ArrowLeft}")
    expect(screen.getByRole("radio", { name: "June" })).toBeChecked()
  })

  it("never shows a title the member hid", async () => {
    const user = userEvent.setup()
    const top = days.find((day) => day.month === 7 && day.title)!
    const key = data.days[days.indexOf(top)].key!
    const rows = calendarDayRows(data, heavy.facts, { locale: "en-US" }, new Set([key]))
    render(<Harness mode="playing" rows={rows} />)
    await user.click(screen.getByTestId("rewind-day-picker"))
    expect(screen.getByTestId("rewind-day-picker-sheet")).not.toHaveTextContent(top.title!)
  })

  it("pauses while open, and resumes on close only if the story was playing", async () => {
    const user = userEvent.setup()
    const { unmount } = render(<Harness mode="playing" />)
    await user.click(screen.getByTestId("rewind-day-picker"))
    expect(screen.getByTestId("mode")).toHaveTextContent("sheet")
    await user.keyboard("{Escape}")
    expect(screen.getByTestId("mode")).toHaveTextContent("playing")
    unmount()

    render(<Harness mode="paused" />)
    await user.click(screen.getByTestId("rewind-day-picker"))
    expect(screen.getByTestId("mode")).toHaveTextContent("sheet")
    await user.keyboard("{Escape}")
    expect(screen.getByTestId("mode")).toHaveTextContent("paused")
  })
})
