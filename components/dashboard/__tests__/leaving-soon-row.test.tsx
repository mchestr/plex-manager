/**
 * Home's "Leaving soon" row (UX 9.3): the heading with the server name, the
 * caption with and without For you titles, See all, each title with its
 * leave line and Keep; the Keep result state with End keep and the Undo
 * toast; the limit line; no Keep without member Keeps; nothing without a
 * title (also when plex.tv did not answer); and the skeleton.
 */

import { act, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { keepCleanupTitle } from "@/actions/cleanup-keeps"
import { LeavingSoonRow, LeavingSoonRowSkeleton, rowCaption } from "@/components/dashboard/leaving-soon-row"
import type { LeavingSoonRowData, MemberLeavingSoonData } from "@/lib/cleanup/types/member"
import type { ItemRef } from "@/lib/cleanup/types/preview"
import { getLeavingSoonForMember, getLeavingSoonRow } from "@/lib/data/leaving-soon"

jest.mock("@/lib/data/leaving-soon", () => ({ getLeavingSoonRow: jest.fn(), getLeavingSoonForMember: jest.fn() }))
jest.mock("@/actions/cleanup-keeps", () => ({ keepCleanupTitle: jest.fn(), removeMyCleanupKeep: jest.fn() }))
const mockToast = jest.fn()
jest.mock("@/components/ui/toast", () => ({ useToast: () => ({ toast: mockToast, showSuccess: jest.fn(), showError: jest.fn() }) }))

const FORMAT = { timeZone: "UTC", locale: "en-US" }
const item = (key: string, title: string): ItemRef => ({
  itemKey: key, level: "movie", title, year: 2009, seasonNumber: null, episodeCount: null, seasonCount: null, posterKey: "77",
  sectionId: "1", sizeBytes: null,
})

const ROW: LeavingSoonRowData = {
  items: [
    { item: item("movie:tmdb:1", "Invented Bones"), leaveAt: "2026-12-02", kept: false, forYou: true },
    { item: item("movie:tmdb:2", "Invented Gamer"), leaveAt: "2026-12-08", kept: false, forYou: true },
    { item: item("movie:tmdb:3", "Invented Treme"), leaveAt: "due", kept: false, forYou: false },
  ],
  total: 52,
  forYouCount: 2,
}
const PAGE: MemberLeavingSoonData = {
  enabled: true, plexFailed: false, keeps: { enabled: true, limit: 20, used: 2, days: 90 }, forYou: [], groups: [], myKeeps: [],
}

async function renderRow(row: LeavingSoonRowData = ROW, page: MemberLeavingSoonData = PAGE) {
  jest.mocked(getLeavingSoonRow).mockResolvedValue(row)
  jest.mocked(getLeavingSoonForMember).mockResolvedValue(page)
  const element = await LeavingSoonRow({ userId: "member-1", serverName: "Northfield Plex", format: FORMAT })
  return render(<>{element}</>)
}

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(keepCleanupTitle).mockResolvedValue({ success: true, data: { keepId: "keep-new", until: "2027-02-06T12:00:00.000Z" } })
})

describe("LeavingSoonRow", () => {
  it("names the server, counts the titles and the For you ones, and links to the page", async () => {
    await renderRow()

    const row = screen.getByTestId("home-leaving-soon-row")
    expect(screen.getByRole("region", { name: "Leaving soon on Northfield Plex" })).toBe(row)
    expect(within(row).getByRole("heading", { level: 2 })).toHaveTextContent("Leaving soon on Northfield Plex")
    expect(row).toHaveTextContent("52 titles leave soon. The 2 for you come first. Keep one to watch it later.")
    expect(screen.getByTestId("home-leaving-soon-see-all")).toHaveAttribute("href", "/leaving-soon")
    expect(getLeavingSoonRow).toHaveBeenCalledWith("member-1")
    expect(getLeavingSoonForMember).toHaveBeenCalledWith("member-1")
  })

  it("lists each title in order with its leave line and Keep under its own base", async () => {
    await renderRow()

    const items = within(screen.getByTestId("home-leaving-soon-list")).getAllByRole("listitem")
    expect(items.map((entry) => entry.getAttribute("data-testid"))).toEqual([
      "home-leaving-soon-item-movie-tmdb-1",
      "home-leaving-soon-item-movie-tmdb-2",
      "home-leaving-soon-item-movie-tmdb-3",
    ])
    expect(items[0]).toHaveTextContent("Leaves Dec 2")
    expect(within(items[2]).getByText("Leaves any day now")).toHaveClass("text-warning")
    expect(screen.getByTestId("home-leaving-soon-item-movie-tmdb-3-keep")).toHaveAccessibleName("Keep Invented Treme")
  })

  it("shows Kept by you and End keep at once after Keep, with the Undo toast and focus on End keep", async () => {
    const user = userEvent.setup()
    await renderRow()

    await user.click(screen.getByTestId("home-leaving-soon-item-movie-tmdb-1-keep"))
    await act(async () => {})

    const entry = screen.getByTestId("home-leaving-soon-item-movie-tmdb-1")
    expect(within(entry).getByText("Kept by you")).toBeInTheDocument()
    expect(within(entry).getByText("Until Feb 6, 2027")).toBeInTheDocument()
    expect(screen.getByTestId("home-leaving-soon-item-movie-tmdb-1-end-keep")).toHaveFocus()
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: "Kept Invented Bones until Feb 6, 2027.", action: expect.objectContaining({ label: "Undo" }) }))
  })

  it("disables Keep at the limit and names the reason under it", async () => {
    await renderRow(ROW, { ...PAGE, keeps: { ...PAGE.keeps, used: 20 } })

    const keep = screen.getByTestId("home-leaving-soon-item-movie-tmdb-2-keep")
    expect(keep).toHaveAttribute("aria-disabled", "true")
    const limit = screen.getByTestId("home-leaving-soon-item-movie-tmdb-2-limit")
    expect(limit).toHaveTextContent("You keep 20 titles. End a Keep to keep this one.")
    expect(keep).toHaveAttribute("aria-describedby", limit.id)
  })

  it("shows Kept by you for a title the member keeps", async () => {
    const keep = { id: "keep-3", item: ROW.items[2].item, until: "2027-02-06T12:00:00.000Z", keptAt: "2026-11-08T12:00:00.000Z" }
    await renderRow(ROW, { ...PAGE, myKeeps: [keep] })

    expect(within(screen.getByTestId("home-leaving-soon-item-movie-tmdb-3")).getByText("Kept by you")).toBeInTheDocument()
    expect(screen.getByTestId("home-leaving-soon-item-movie-tmdb-3-end-keep")).toBeInTheDocument()
  })

  it("has no Keep without member Keeps, and the caption drops its Keep sentence", async () => {
    await renderRow(ROW, { ...PAGE, keeps: { ...PAGE.keeps, enabled: false } })

    expect(screen.queryByTestId("home-leaving-soon-item-movie-tmdb-1-keep")).not.toBeInTheDocument()
    expect(screen.getByTestId("home-leaving-soon-row")).toHaveTextContent("52 titles leave soon. The 2 for you come first.")
    expect(screen.getByTestId("home-leaving-soon-row")).not.toHaveTextContent("Keep one")
  })

  it("renders nothing without a title, as when plex.tv did not answer", async () => {
    const { container } = await renderRow({ items: [], total: 0, forYouCount: 0 }, { ...PAGE, enabled: false, plexFailed: true })
    expect(container).toBeEmptyDOMElement()
  })

  it("shows a skeleton with a status while it loads", () => {
    render(<LeavingSoonRowSkeleton />)
    expect(screen.getByRole("status")).toHaveTextContent("Loading titles that leave soon")
  })
})

describe("rowCaption", () => {
  it.each([
    [{ total: 52, forYouCount: 0 }, true, "52 titles leave soon. Keep one to watch it later."],
    [{ total: 1, forYouCount: 1 }, true, "1 title leaves soon. The 1 for you comes first. Keep one to watch it later."],
    [{ total: 1200, forYouCount: 3 }, false, "1,200 titles leave soon. The 3 for you come first."],
  ])("%o with Keeps %s reads %s", (row, keepsOn, caption) => {
    expect(rowCaption(row, keepsOn, FORMAT)).toBe(caption)
  })
})
