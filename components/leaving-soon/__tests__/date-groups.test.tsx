/**
 * Everything leaving soon (UX 9.2): the line with the N of "All", the Show
 * control and its counts (shows include seasons), the due group first with
 * its line, the day groups with their count lines, 6 cards on a desktop and
 * 4 below `md` with "Show all {N}", and the focus after Show all.
 */

import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { EverythingLeaving } from "@/components/leaving-soon/date-groups"
import type { MemberLeavingGroup } from "@/lib/cleanup/types/member"
import type { ItemRef } from "@/lib/cleanup/types/preview"
import type { Level } from "@/lib/validations/cleanup-vocabulary"

jest.mock("@/actions/cleanup-keeps", () => ({ keepCleanupTitle: jest.fn(), removeMyCleanupKeep: jest.fn() }))
jest.mock("@/components/ui/toast", () => ({ useToast: () => ({ toast: jest.fn(), showSuccess: jest.fn(), showError: jest.fn() }) }))

const ref = (n: number, level: Level): ItemRef => ({
  itemKey: level === "season" ? `season:tvdb:${n}:1` : `${level}:tmdb:${n}`, level, title: `Invented ${n}`, year: 2010,
  seasonNumber: level === "season" ? 1 : null, episodeCount: level === "season" ? 8 : null, seasonCount: level === "show" ? 3 : null,
  posterKey: String(n), sectionId: level === "movie" ? "1" : "2", sizeBytes: null,
})

function group(date: string, levels: Level[], start: number): MemberLeavingGroup {
  const items = levels.map((level, i) => ({ item: ref(start + i, level), leaveAt: date, kept: false }))
  return { date, count: items.length, items }
}

const DUE = group("due", ["show", "show", "movie"], 100)
const NOV19 = group("2026-11-19", Array.from({ length: 12 }, () => "season" as const), 200)
const NOV21 = group("2026-11-21", ["movie", "movie", "movie", "movie", "show"], 300)
const GROUPS = [DUE, NOV19, NOV21]

function setDesktop(desktop: boolean) {
  window.matchMedia = jest.fn().mockImplementation((query: string) => ({ matches: desktop, media: query, addEventListener: jest.fn(), removeEventListener: jest.fn() }))
}

const cards = (base: string) => within(screen.getByTestId(base)).getAllByRole("listitem")

describe("EverythingLeaving", () => {
  beforeEach(() => setDesktop(true))

  it("counts the titles with the N of All, and says For you titles do not repeat", () => {
    render(<EverythingLeaving groups={GROUPS} afterForYou keeps={new Map()} />)

    expect(screen.getByRole("heading", { level: 2, name: "Everything leaving soon" })).toBeInTheDocument()
    expect(screen.getByText("20 more titles, the soonest first. Titles in For you do not repeat here.")).toBeInTheDocument()
    expect(screen.getByTestId("leaving-soon-filter-all")).toHaveTextContent("All 20")
    expect(screen.getByTestId("leaving-soon-filter-movies")).toHaveTextContent("Movies 5")
    expect(screen.getByTestId("leaving-soon-filter-shows")).toHaveTextContent("Shows 15")
    expect(screen.getByRole("radiogroup", { name: "Show" })).toBe(screen.getByTestId("leaving-soon-filter"))
  })

  it("drops more without For you titles, and says title for one", () => {
    const { rerender } = render(<EverythingLeaving groups={GROUPS} afterForYou={false} keeps={new Map()} />)
    expect(screen.getByText("20 titles, the soonest first.")).toBeInTheDocument()

    rerender(<EverythingLeaving groups={[group("due", ["movie"], 1)]} afterForYou keeps={new Map()} />)
    expect(screen.getByText("1 more title, the soonest first. Titles in For you do not repeat here.")).toBeInTheDocument()
  })

  it("puts the due group first with its line, then each day with its count line", () => {
    render(<EverythingLeaving groups={GROUPS} afterForYou keeps={new Map()} />)

    const headings = screen.getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent)
    expect(headings).toEqual(["Leaves any day now", "Leaves Nov 19", "Leaves Nov 21"])
    expect(screen.getByTestId("leaving-soon-group-due")).toHaveTextContent("These reached their leave date. They can still be kept.")
    expect(screen.getByTestId("leaving-soon-group-2026-11-19")).toHaveTextContent("12 seasons")
    expect(screen.getByTestId("leaving-soon-group-2026-11-21")).toHaveTextContent("4 movies, 1 show")
    expect(within(screen.getByTestId("leaving-soon-group-due")).getAllByText("Leaves any day now")).toHaveLength(4)
  })

  it("shows 6 cards and Show all {N}, then every card with focus on the first new one", async () => {
    const user = userEvent.setup()
    render(<EverythingLeaving groups={GROUPS} afterForYou keeps={new Map()} />)

    expect(cards("leaving-soon-group-2026-11-19")).toHaveLength(6)
    const showAll = screen.getByTestId("leaving-soon-group-2026-11-19-show-all")
    expect(showAll).toHaveTextContent("Show all 12")
    expect(showAll).not.toHaveClass("md:hidden")
    await user.click(showAll)

    expect(cards("leaving-soon-group-2026-11-19")).toHaveLength(12)
    expect(screen.queryByTestId("leaving-soon-group-2026-11-19-show-all")).not.toBeInTheDocument()
    expect(screen.getByTestId("leaving-soon-card-season-tvdb-206-1")).toHaveFocus()
  })

  it("hides the cards past 4 below md, with Show all only below md for 5 or 6 cards", async () => {
    setDesktop(false)
    const user = userEvent.setup()
    render(<EverythingLeaving groups={GROUPS} afterForYou keeps={new Map()} />)

    const items = cards("leaving-soon-group-2026-11-21")
    expect(items).toHaveLength(5)
    expect(items.map((item) => item.className.includes("max-md:hidden"))).toEqual([false, false, false, false, true])
    expect(screen.getByTestId("leaving-soon-group-2026-11-21-show-all")).toHaveClass("md:hidden")
    expect(screen.queryByTestId("leaving-soon-group-due-show-all")).not.toBeInTheDocument()

    await user.click(screen.getByTestId("leaving-soon-group-2026-11-21-show-all"))
    expect(cards("leaving-soon-group-2026-11-21").some((item) => item.className.includes("max-md:hidden"))).toBe(false)
    expect(screen.getByTestId("leaving-soon-card-show-tmdb-304")).toHaveFocus()
  })

  it("filters to movies or to shows with seasons, and drops a group with none left", async () => {
    const user = userEvent.setup()
    render(<EverythingLeaving groups={GROUPS} afterForYou keeps={new Map()} />)

    await user.click(screen.getByTestId("leaving-soon-filter-movies"))
    expect(screen.queryByTestId("leaving-soon-group-2026-11-19")).not.toBeInTheDocument()
    expect(cards("leaving-soon-group-due")).toHaveLength(1)
    expect(screen.getByTestId("leaving-soon-group-2026-11-21")).toHaveTextContent("4 movies")
    expect(screen.getByText("20 more titles, the soonest first. Titles in For you do not repeat here.")).toBeInTheDocument()

    await user.click(screen.getByTestId("leaving-soon-filter-shows"))
    expect(cards("leaving-soon-group-due")).toHaveLength(2)
    expect(screen.getByTestId("leaving-soon-group-2026-11-19")).toBeInTheDocument()
    expect(cards("leaving-soon-group-2026-11-21")).toHaveLength(1)

    await user.click(screen.getByTestId("leaving-soon-filter-all"))
    expect(cards("leaving-soon-group-due")).toHaveLength(3)
  })

  it("disables a segment with no titles", () => {
    render(<EverythingLeaving groups={[group("due", ["movie"], 1)]} afterForYou keeps={new Map()} />)
    expect(screen.getByTestId("leaving-soon-filter-shows")).toHaveTextContent("Shows 0")
    expect(screen.getByTestId("leaving-soon-filter-shows")).toHaveAttribute("data-disabled")
  })

  it("shows Kept by you on a card the member keeps, and renders nothing without titles", () => {
    const keeps = new Map([["movie:tmdb:102", { keepId: "keep-1", until: "2027-02-06T12:00:00.000Z" }]])
    const { container, rerender } = render(<EverythingLeaving groups={GROUPS} afterForYou keeps={keeps} />)
    expect(within(screen.getByTestId("leaving-soon-card-movie-tmdb-102")).getByText("Kept by you")).toBeInTheDocument()

    rerender(<EverythingLeaving groups={[]} afterForYou keeps={keeps} />)
    expect(container).toBeEmptyDOMElement()
  })
})
