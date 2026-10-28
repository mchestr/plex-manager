/**
 * The watchlist table: each row's title, type, member link, status word and
 * dates, the Status and Type filters in the URL, the sortable headers, and
 * the first-use and filtered empty states.
 */

import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { currentHref, resetUrl } from "@/__tests__/helpers/url-router"
import { WatchlistTable } from "@/components/admin/watchlist/watchlist-table"
import type { WatchlistRow } from "@/lib/data/watchlist"

jest.mock("next/navigation", () => require("@/__tests__/helpers/url-router").navigationModule)

const row = (id: string, overrides: Partial<WatchlistRow> = {}): WatchlistRow => ({
  id,
  title: "Severance",
  year: 2022,
  mediaType: "TV_SERIES",
  status: "REQUESTED",
  syncedAt: new Date("2026-10-20T12:00:00Z"),
  requestedAt: new Date("2026-10-21T12:00:00Z"),
  user: { id: "u1", name: "Ana Lima", email: "ana@example.com" },
  ...overrides,
})

const ROWS = [
  row("h1"),
  row("h2", {
    title: "Arrival",
    year: null,
    mediaType: "MOVIE",
    status: "NOT_PERMITTED",
    requestedAt: null,
    user: { id: "u2", name: null, email: "sam@example.com" },
  }),
]

function renderTable(props: Partial<Parameters<typeof WatchlistTable>[0]> = {}) {
  return render(
    <WatchlistTable
      rows={ROWS}
      total={ROWS.length}
      all={ROWS.length}
      page={1}
      pageSize={25}
      sort={{ id: "synced", desc: true }}
      syncEnabled
      {...props}
    />
  )
}

beforeEach(() => resetUrl("/admin/watchlist"))

describe("WatchlistTable", () => {
  it("shows the title and year, the type, the member, the status and the dates", () => {
    renderTable()

    const severance = screen.getByTestId("admin-watchlist-row-h1")
    expect(severance).toHaveTextContent("Severance (2022)")
    expect(severance).toHaveTextContent("Series")
    expect(within(severance).getByRole("link", { name: "Ana Lima" })).toHaveAttribute("href", "/admin/users/u1")
    expect(severance).toHaveTextContent("Requested")
    expect(severance).toHaveTextContent("Oct 20, 2026")
    expect(severance).toHaveTextContent("Oct 21, 2026")
  })

  it("names a member with no name by their email, and dashes a title never requested", () => {
    renderTable()

    const arrival = screen.getByTestId("admin-watchlist-row-h2")
    expect(arrival).toHaveTextContent("Arrival")
    expect(arrival).not.toHaveTextContent("(")
    expect(arrival).toHaveTextContent("Film")
    expect(within(arrival).getByTestId("admin-watchlist-member-h2")).toHaveTextContent("sam@example.com")
    expect(arrival).toHaveTextContent("Not allowed")
    expect(arrival).toHaveTextContent("—")
  })

  it("counts the matching titles against every title", () => {
    renderTable({ rows: ROWS.slice(0, 1), total: 1, all: 12 })

    expect(screen.getByTestId("admin-watchlist-filters-count")).toHaveTextContent("1 of 12 titles")
  })

  it("sorts from the Title, Member, Synced and Requested headers", async () => {
    renderTable()
    const user = userEvent.setup()

    for (const id of ["title", "member", "synced", "requested"]) {
      expect(screen.getByTestId(`admin-watchlist-sort-${id}`)).toBeInTheDocument()
    }
    expect(screen.queryByTestId("admin-watchlist-sort-status")).not.toBeInTheDocument()

    await user.click(screen.getByTestId("admin-watchlist-sort-title"))
    expect(currentHref()).toBe("/admin/watchlist?sort=title")
  })

  it("offers every status in the badge's words, and writes the choice into the URL", async () => {
    renderTable()
    const user = userEvent.setup()

    await user.click(screen.getByTestId("admin-watchlist-filters-filter-status"))
    const options = await screen.findAllByRole("option")
    expect(options.map((option) => option.textContent)).toEqual([
      "All",
      "Requested",
      "Available",
      "Already requested",
      "Not allowed",
      "No TMDB match",
      "Failed",
      "Removed from watchlist",
    ])
    await user.click(screen.getByTestId("admin-watchlist-filters-filter-status-option-notAllowed"))

    expect(currentHref()).toBe("/admin/watchlist?status=notAllowed")
    expect(await screen.findByTestId("admin-watchlist-filters-chip-status")).toHaveTextContent("Status: Not allowed")
  })

  it("filters by type", async () => {
    renderTable()
    const user = userEvent.setup()

    await user.click(screen.getByTestId("admin-watchlist-filters-filter-type"))
    await user.click(await screen.findByTestId("admin-watchlist-filters-filter-type-option-movie"))

    expect(currentHref()).toBe("/admin/watchlist?type=movie")
    expect(await screen.findByTestId("admin-watchlist-filters-chip-type")).toHaveTextContent("Type: Film")
  })

  it("shows the first-use empty state, naming the global switch while it is off", () => {
    const { unmount } = renderTable({ rows: [], total: 0, all: 0 })
    expect(screen.getByTestId("admin-watchlist-empty")).toHaveTextContent("No watchlist titles yet")
    expect(screen.getByTestId("admin-watchlist-empty")).toHaveTextContent("once a member with sync on adds one")
    unmount()

    renderTable({ rows: [], total: 0, all: 0, syncEnabled: false })
    expect(screen.getByTestId("admin-watchlist-empty")).toHaveTextContent("Turn watchlist sync on in Sync settings")
  })

  it("shows the filtered empty state, and Clear filters drops every filter", async () => {
    resetUrl("/admin/watchlist?status=failed&type=tv&q=zzz&page=2&sort=title")
    renderTable({ rows: [], total: 0, all: 4 })

    const empty = screen.getByTestId("admin-watchlist-empty-filtered")
    expect(empty).toHaveTextContent("No titles match these filters")
    await userEvent.setup().click(within(empty).getByRole("button", { name: "Clear filters" }))
    expect(currentHref()).toBe("/admin/watchlist?sort=title")
  })
})
