/**
 * A Leaving soon card (UX 9.2): the type line of each level, the leave line
 * (a date, or "Leaves any day now" in warning), the poster, and Keep named
 * after the title under the card's own test id base.
 */

import { render, screen } from "@testing-library/react"

import { LeaveLine, LeavingCard, memberTypeLine } from "@/components/leaving-soon/leaving-card"
import type { ItemRef } from "@/lib/cleanup/types/preview"

jest.mock("@/actions/cleanup-keeps", () => ({ keepCleanupTitle: jest.fn(), removeMyCleanupKeep: jest.fn() }))
jest.mock("@/components/ui/toast", () => ({ useToast: () => ({ toast: jest.fn(), showSuccess: jest.fn(), showError: jest.fn() }) }))

const SEASON: ItemRef = {
  itemKey: "season:tvdb:7001:4", level: "season", title: "The Invented Show", year: 2008, seasonNumber: 4, episodeCount: 22, seasonCount: null,
  posterKey: "5501", sectionId: "2", sizeBytes: null,
}

describe("memberTypeLine", () => {
  it.each([
    [{ level: "movie", year: 2009, seasonCount: null, episodeCount: null }, "Movie, 2009"],
    [{ level: "movie", year: null, seasonCount: null, episodeCount: null }, "Movie"],
    [{ level: "show", year: 2005, seasonCount: 12, episodeCount: null }, "Show, 12 seasons"],
    [{ level: "show", year: 2005, seasonCount: 1, episodeCount: null }, "Show, 1 season"],
    [{ level: "show", year: 2005, seasonCount: null, episodeCount: null }, "Show"],
    [{ level: "season", year: 2005, seasonCount: null, episodeCount: 22 }, "22 episodes"],
    [{ level: "season", year: 2005, seasonCount: null, episodeCount: 1 }, "1 episode"],
    [{ level: "season", year: 2005, seasonCount: null, episodeCount: null }, "Season"],
  ] as const)("%o reads %s", (item, line) => {
    expect(memberTypeLine(item)).toBe(line)
  })
})

describe("LeaveLine", () => {
  it("names the leave day in muted text", () => {
    render(<LeaveLine leaveAt="2026-11-19" />)
    const line = screen.getByText("Leaves Nov 19")
    expect(line).toHaveClass("text-muted-foreground")
    expect(line).not.toHaveClass("text-warning")
  })

  it("reads Leaves any day now in warning for a due title", () => {
    render(<LeaveLine leaveAt="due" />)
    expect(screen.getByText("Leaves any day now")).toHaveClass("text-warning")
  })
})

describe("LeavingCard", () => {
  it("shows the title with its season, the type line, the leave line and Keep named after the title", () => {
    render(<LeavingCard item={SEASON} leaveAt="2026-11-19" keep={null} />)

    const card = screen.getByTestId("leaving-soon-card-season-tvdb-7001-4")
    expect(card).toHaveAccessibleName("The Invented Show, Season 4")
    expect(card).toHaveAttribute("tabindex", "-1")
    expect(card).toHaveTextContent("22 episodes")
    expect(card).toHaveTextContent("Leaves Nov 19")
    expect(card.querySelector('[data-slot="poster"]')).toHaveAttribute("aria-hidden", "true")
    expect(screen.getByTestId("leaving-soon-card-season-tvdb-7001-4-keep")).toHaveAccessibleName("Keep The Invented Show, Season 4")
  })

  it("shows Kept by you with End keep for a title the member keeps", () => {
    render(<LeavingCard item={SEASON} leaveAt="due" keep={{ keepId: "keep-1", until: "2027-02-06T12:00:00.000Z" }} />)

    expect(screen.getByText("Kept by you")).toBeInTheDocument()
    expect(screen.getByTestId("leaving-soon-card-season-tvdb-7001-4-end-keep")).toBeInTheDocument()
    expect(screen.queryByTestId("leaving-soon-card-season-tvdb-7001-4-keep")).not.toBeInTheDocument()
  })

  it("holds no size", () => {
    render(<LeavingCard item={{ ...SEASON, sizeBytes: "1000000000" }} leaveAt="due" keep={null} />)
    expect(screen.getByTestId("leaving-soon-card-season-tvdb-7001-4")).not.toHaveTextContent(/GB|bytes/)
  })
})
