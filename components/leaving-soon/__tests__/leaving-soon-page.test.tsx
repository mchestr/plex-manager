/**
 * The member Leaving soon page (UX 9.1, 9.2, TS 13.3): the lead with the Keep
 * days or without Keeps, the meter, For you, Everything, Your Keeps and the
 * footer with the shortest grace period; the empty state; the plex.tv
 * warning instead of the empty state; Your Keeps beside both while the member
 * holds a Keep; a Keep that reaches the limit; and no size, rule or member.
 */

import { act, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { keepCleanupTitle } from "@/actions/cleanup-keeps"
import { LeavingSoonPage } from "@/components/leaving-soon/leaving-soon-page"
import type { MemberLeavingSoonData, MyKeepRow } from "@/lib/cleanup/types/member"
import type { ItemRef } from "@/lib/cleanup/types/preview"

jest.mock("@/actions/cleanup-keeps", () => ({ keepCleanupTitle: jest.fn(), removeMyCleanupKeep: jest.fn() }))
const mockToast = jest.fn()
jest.mock("@/components/ui/toast", () => ({ useToast: () => ({ toast: mockToast, showSuccess: jest.fn(), showError: jest.fn() }) }))

const item = (key: string, title: string, overrides: Partial<ItemRef> = {}): ItemRef => ({
  itemKey: key, level: "movie", title, year: 2009, seasonNumber: null, episodeCount: null, seasonCount: null, posterKey: null,
  sectionId: "1", sizeBytes: null, ...overrides,
})

const KEEP: MyKeepRow = { id: "keep-1", item: item("movie:tmdb:9", "Invented Arrival"), until: "2027-01-31T12:00:00.000Z", keptAt: "2026-11-02T12:00:00.000Z" }

const DATA: MemberLeavingSoonData = {
  enabled: true,
  plexFailed: false,
  keeps: { enabled: true, limit: 20, used: 1, days: 90 },
  forYou: [{ item: item("movie:tmdb:1", "Invented Gamer"), reason: "started", reasonAt: "2023-03-02T12:00:00.000Z", leaveAt: "2026-12-08", kept: false }],
  groups: [
    { date: "due", count: 2, items: [
      { item: item("show:tvdb:2", "Invented Treme", { level: "show", seasonCount: 4 }), leaveAt: "due", kept: false },
      { item: item("movie:tmdb:3", "Invented Knick"), leaveAt: "due", kept: false },
    ] },
  ],
  myKeeps: [KEEP],
}

const CLOSED: MemberLeavingSoonData = { ...DATA, enabled: false, forYou: [], groups: [], myKeeps: [] }

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(keepCleanupTitle).mockResolvedValue({ success: true, data: { keepId: "keep-new", until: "2027-02-06T12:00:00.000Z" } })
})

describe("LeavingSoonPage with titles", () => {
  it("reads the lead with the Keep days, the meter, For you, Everything, Your Keeps and the footer", () => {
    render(<LeavingSoonPage data={DATA} serverName="Northfield Plex" graceDays={30} />)

    expect(screen.getByRole("heading", { level: 1, name: "Leaving soon" })).toBeInTheDocument()
    expect(screen.getByText("These titles leave Northfield Plex on the date shown. If you still want to watch one, keep it. A kept title stays for 90 days.")).toBeInTheDocument()
    expect(screen.getByTestId("leaving-soon-keep-meter")).toHaveTextContent("1 of 20 Keeps used")
    expect(screen.getByTestId("leaving-soon-for-you-movie-tmdb-1")).toHaveTextContent("You started this")
    expect(screen.getByText("2 more titles, the soonest first. Titles in For you do not repeat here.")).toBeInTheDocument()
    expect(screen.getByTestId("leaving-soon-group-due")).toBeInTheDocument()
    expect(within(screen.getByTestId("leaving-soon-my-keeps")).getByText("Invented Arrival")).toBeInTheDocument()
    expect(screen.getByTestId("leaving-soon-footer")).toHaveTextContent(
      "A Keep lasts 90 days. After that, a title can come back to this list with a new date at least 30 days away. The server admin can end a Keep. You see that here."
    )
    expect(screen.queryByTestId("leaving-soon-empty")).not.toBeInTheDocument()
  })

  it("orders the parts For you, Everything, Your Keeps, footer", () => {
    render(<LeavingSoonPage data={DATA} serverName="Northfield Plex" />)
    const order = ["leaving-soon-for-you", "leaving-soon-everything", "leaving-soon-my-keeps", "leaving-soon-footer"].map((id) => screen.getByTestId(id))
    for (let i = 1; i < order.length; i++) {
      expect(order[i - 1].compareDocumentPosition(order[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    }
  })

  it("names a full grace period without a live rule", () => {
    render(<LeavingSoonPage data={DATA} serverName="Northfield Plex" />)
    expect(screen.getByTestId("leaving-soon-footer")).toHaveTextContent("with a new date after a full grace period.")
  })

  it("drops the Keep words, the meter and the Keep buttons while member Keeps are off, and keeps Your Keeps", () => {
    render(<LeavingSoonPage data={{ ...DATA, keeps: { ...DATA.keeps, enabled: false } }} serverName="Northfield Plex" />)

    expect(screen.getByText("These titles leave Northfield Plex on the date shown.")).toBeInTheDocument()
    expect(screen.queryByTestId("leaving-soon-keep-meter")).not.toBeInTheDocument()
    expect(screen.queryByTestId("leaving-soon-card-movie-tmdb-3-keep")).not.toBeInTheDocument()
    expect(screen.getByTestId("leaving-soon-my-keeps-keep-1-end")).toBeInTheDocument()
  })

  it("leaves out Your Keeps while member Keeps are off and the member holds none", () => {
    render(<LeavingSoonPage data={{ ...DATA, keeps: { ...DATA.keeps, enabled: false }, myKeeps: [] }} serverName="Northfield Plex" />)
    expect(screen.queryByTestId("leaving-soon-my-keeps")).not.toBeInTheDocument()
  })

  it("counts a Keep at once and, at the limit, disables every other Keep with its reason", async () => {
    const user = userEvent.setup()
    render(<LeavingSoonPage data={{ ...DATA, keeps: { ...DATA.keeps, limit: 2 } }} serverName="Northfield Plex" />)

    await user.click(screen.getByTestId("leaving-soon-card-movie-tmdb-3-keep"))
    await act(async () => {})

    expect(screen.getByTestId("leaving-soon-keep-meter")).toHaveTextContent("2 of 2 Keeps used")
    expect(screen.getByTestId("leaving-soon-keep-limit")).toHaveTextContent("You keep 2 titles. End a Keep to keep another.")
    expect(screen.getByTestId("leaving-soon-card-movie-tmdb-3-end-keep")).toHaveFocus()
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: "Kept Invented Knick until Feb 6, 2027.", action: expect.objectContaining({ label: "Undo" }) }))
    const other = screen.getByTestId("leaving-soon-card-show-tvdb-2-keep")
    expect(other).toHaveAttribute("aria-disabled", "true")
    expect(screen.getByTestId("leaving-soon-card-show-tvdb-2-limit")).toHaveTextContent("You keep 2 titles. End a Keep to keep this one.")
  })

  it("shows no size", () => {
    const sized = { ...DATA, groups: [{ ...DATA.groups[0], items: DATA.groups[0].items.map((entry) => ({ ...entry, item: { ...entry.item, sizeBytes: "5000000000" } })) }] }
    render(<LeavingSoonPage data={sized} serverName="Northfield Plex" />)
    expect(screen.getByTestId("leaving-soon-page")).not.toHaveTextContent(/\bGB\b|\bbytes\b|5000000000/)
  })
})

describe("LeavingSoonPage without titles", () => {
  it("shows the empty state with the server name", () => {
    render(<LeavingSoonPage data={CLOSED} serverName="Northfield Plex" />)

    const empty = screen.getByTestId("leaving-soon-empty")
    expect(empty).toHaveTextContent("Nothing is leaving soon")
    expect(empty).toHaveTextContent("Titles that leave Northfield Plex show here before they go.")
    expect(screen.queryByTestId("leaving-soon-plex-failed")).not.toBeInTheDocument()
    expect(screen.queryByTestId("leaving-soon-keep-meter")).not.toBeInTheDocument()
    expect(screen.queryByTestId("leaving-soon-my-keeps")).not.toBeInTheDocument()
  })

  it("shows the empty state for an open gate with no title", () => {
    render(<LeavingSoonPage data={{ ...CLOSED, enabled: true }} serverName="Northfield Plex" />)
    expect(screen.getByTestId("leaving-soon-empty")).toBeInTheDocument()
  })

  it("shows the plex.tv warning, not the empty state, while plex.tv does not answer", () => {
    render(<LeavingSoonPage data={{ ...CLOSED, plexFailed: true }} serverName="Northfield Plex" />)

    const alert = screen.getByTestId("leaving-soon-plex-failed")
    expect(alert).toHaveTextContent("Plex did not answer. Reload the page to try again.")
    expect(alert).toHaveAttribute("role", "alert")
    expect(alert).toHaveAttribute("data-tone", "warning")
    expect(screen.queryByTestId("leaving-soon-empty")).not.toBeInTheDocument()
  })

  it("keeps Your Keeps beside the empty state and the warning while the member holds a Keep", () => {
    const { rerender } = render(<LeavingSoonPage data={{ ...CLOSED, myKeeps: [KEEP] }} serverName="Northfield Plex" />)
    expect(screen.getByTestId("leaving-soon-my-keeps-keep-1")).toBeInTheDocument()

    rerender(<LeavingSoonPage data={{ ...CLOSED, plexFailed: true, myKeeps: [KEEP] }} serverName="Northfield Plex" />)
    expect(screen.getByTestId("leaving-soon-my-keeps-keep-1")).toBeInTheDocument()

    rerender(<LeavingSoonPage data={{ ...CLOSED, myKeeps: [{ ...KEEP, endedBy: "self", endedAt: "2026-11-05T12:00:00.000Z" }] }} serverName="Northfield Plex" />)
    expect(screen.queryByTestId("leaving-soon-my-keeps")).not.toBeInTheDocument()
  })
})
