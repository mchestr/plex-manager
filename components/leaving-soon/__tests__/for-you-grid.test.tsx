/**
 * For you (UX 9.2, 9.2.3): the heading and the private line, one card for
 * each title with its reason line in info and the dated fact, the leave
 * line, and Keep; a kept title shows Kept by you; nothing without titles.
 */

import { render, screen, within } from "@testing-library/react"

import { ForYouGrid } from "@/components/leaving-soon/for-you-grid"
import type { ForYouItem } from "@/lib/cleanup/types/member"
import type { ItemRef } from "@/lib/cleanup/types/preview"

jest.mock("@/actions/cleanup-keeps", () => ({ keepCleanupTitle: jest.fn(), removeMyCleanupKeep: jest.fn() }))
jest.mock("@/components/ui/toast", () => ({ useToast: () => ({ toast: jest.fn(), showSuccess: jest.fn(), showError: jest.fn() }) }))

const item = (key: string, overrides: Partial<ItemRef> = {}): ItemRef => ({
  itemKey: key, level: "movie", title: `Title ${key}`, year: 2009, seasonNumber: null, episodeCount: null, seasonCount: null,
  posterKey: null, sectionId: "1", sizeBytes: null, ...overrides,
})

const ENTRIES: ForYouItem[] = [
  { item: item("show:tvdb:1", { level: "show", title: "Invented Bones", seasonCount: 12 }), reason: "requested", reasonAt: "2025-03-14T12:00:00.000Z", leaveAt: "2026-12-02", kept: false },
  { item: item("movie:tmdb:2", { title: "Invented Gamer" }), reason: "started", reasonAt: "2023-03-02T12:00:00.000Z", leaveAt: "due", kept: false },
  { item: item("movie:tmdb:3", { title: "Invented Empire" }), reason: "played", reasonAt: "2023-10-10T12:00:00.000Z", leaveAt: "2026-12-08", kept: true },
  { item: item("movie:tmdb:4", { title: "Invented List" }), reason: "watchlist", reasonAt: "2026-06-01T12:00:00.000Z", leaveAt: "2026-12-08", kept: false },
]

describe("ForYouGrid", () => {
  it("names the list and says that only the member sees it", () => {
    render(<ForYouGrid items={ENTRIES} keeps={new Map()} />)

    const section = screen.getByTestId("leaving-soon-for-you")
    expect(within(section).getByRole("heading", { level: 2, name: "For you" })).toBeInTheDocument()
    expect(section).toHaveTextContent("You requested these or played them before. Only you see this list.")
    expect(screen.getByRole("region", { name: "For you" })).toBe(section)
  })

  it.each([
    ["show-tvdb-1", "You requested this", "Your request was in Mar 2025.", "Show, 12 seasons", "Leaves Dec 2"],
    ["movie-tmdb-2", "You started this", "You stopped part-way in Mar 2023.", "Movie, 2009", "Leaves any day now"],
    ["movie-tmdb-3", "You played this before", "Your last play was Oct 2023.", "Movie, 2009", "Leaves Dec 8"],
    ["movie-tmdb-4", "On your watchlist", "You added it in Jun 2026.", "Movie, 2009", "Leaves Dec 8"],
  ])("shows the reason of %s in info with its dated fact", (key, reason, fact, type, leave) => {
    render(<ForYouGrid items={ENTRIES} keeps={new Map()} />)

    const card = screen.getByTestId(`leaving-soon-for-you-${key}`)
    expect(within(card).getByTestId(`leaving-soon-for-you-${key}-reason`)).toHaveTextContent(reason)
    expect(within(card).getByTestId(`leaving-soon-for-you-${key}-reason`)).toHaveClass("text-info")
    expect(card).toHaveTextContent(fact)
    expect(card).toHaveTextContent(type)
    expect(card).toHaveTextContent(leave)
  })

  it("gives each card Keep under its own base, and Kept by you for a kept title", () => {
    const keeps = new Map([["movie:tmdb:3", { keepId: "keep-3", until: "2027-02-06T12:00:00.000Z" }]])
    render(<ForYouGrid items={ENTRIES} keeps={keeps} />)

    expect(screen.getByTestId("leaving-soon-for-you-show-tvdb-1-keep")).toHaveAccessibleName("Keep Invented Bones")
    const kept = screen.getByTestId("leaving-soon-for-you-movie-tmdb-3")
    expect(within(kept).getByText("Kept by you")).toBeInTheDocument()
    expect(within(kept).getByText("Until Feb 6, 2027")).toBeInTheDocument()
    expect(screen.getByTestId("leaving-soon-for-you-movie-tmdb-3-end-keep")).toBeInTheDocument()
  })

  it("renders nothing without titles", () => {
    const { container } = render(<ForYouGrid items={[]} keeps={new Map()} />)
    expect(container).toBeEmptyDOMElement()
  })
})
