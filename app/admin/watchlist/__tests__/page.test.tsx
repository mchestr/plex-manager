/**
 * The admin watchlist page: its own admin check before any read, the URL's
 * filters, sort and page handed to the loader, then the settings card (with
 * "Last saved" only after a first save), the figures and the table.
 */

import { render, screen, within } from "@testing-library/react"

import { resetUrl } from "@/__tests__/helpers/url-router"
import WatchlistPage from "@/app/admin/watchlist/page"
import { assertAdmin } from "@/lib/admin"
import { getWatchlistPage, type WatchlistPage as WatchlistPageData } from "@/lib/data/watchlist"
import { getWatchlistLastSaved } from "@/lib/settings/audit-meta"
import { getWatchlistHealth } from "@/lib/settings/connection-health"

jest.mock("next/navigation", () => require("@/__tests__/helpers/url-router").navigationModule)
jest.mock("@/lib/admin", () => ({ assertAdmin: jest.fn() }))
jest.mock("@/lib/data/watchlist", () => ({ getWatchlistPage: jest.fn() }))
jest.mock("@/lib/settings/connection-health", () => ({ getWatchlistHealth: jest.fn() }))
jest.mock("@/lib/settings/audit-meta", () => ({ getWatchlistLastSaved: jest.fn() }))
jest.mock("@/lib/settings/app-settings", () => ({
  getFormat: async () => (await import("@/lib/utils/format")).bindFormat({ timeZone: "America/Chicago", locale: "en-US" }),
}))
jest.mock("@/actions/admin/watchlist", () => ({ updateGlobalWatchlistSyncSettings: jest.fn() }))
jest.mock("@/components/ui/toast", () => ({ useToast: () => ({ showSuccess: jest.fn(), showError: jest.fn() }) }))

const DATA: WatchlistPageData = {
  settings: { enabled: true, intervalMinutes: 30 },
  stats: { membersWithSyncOn: 4, titles: 12, requested: 7, notAllowed: 2, noMatch: 1 },
  rows: [
    {
      id: "h1",
      title: "Severance",
      year: 2022,
      mediaType: "TV_SERIES",
      status: "REQUESTED",
      syncedAt: new Date("2026-10-20T12:00:00Z"),
      requestedAt: new Date("2026-10-20T12:00:05Z"),
      user: { id: "u1", name: "Ana", email: null },
    },
  ],
  total: 3,
}

async function renderPage(query: Record<string, string> = {}) {
  render(await WatchlistPage({ searchParams: Promise.resolve(query) }))
}

beforeEach(() => {
  jest.clearAllMocks()
  resetUrl("/admin/watchlist")
  jest.mocked(assertAdmin).mockResolvedValue({ user: { id: "admin-1", isAdmin: true }, expires: "" } as never)
  jest.mocked(getWatchlistPage).mockResolvedValue(DATA)
  jest.mocked(getWatchlistHealth).mockResolvedValue({ status: "ok", code: null, checkedAt: null })
  jest.mocked(getWatchlistLastSaved).mockResolvedValue(null)
})

describe("Admin watchlist page", () => {
  it("checks for an admin before reading anything", async () => {
    jest.mocked(assertAdmin).mockRejectedValue(Object.assign(new Error("Admin access required"), { digest: "PM_FORBIDDEN" }))

    await expect(WatchlistPage({ searchParams: Promise.resolve({}) })).rejects.toMatchObject({ digest: "PM_FORBIDDEN" })
    expect(getWatchlistPage).not.toHaveBeenCalled()
  })

  it("hands the URL's filters, page, page size and sort to the loader", async () => {
    await renderPage({ q: "sev", status: "requested", type: "tv", page: "2", pageSize: "50", sort: "-requested" })

    expect(getWatchlistPage).toHaveBeenCalledWith({
      q: "sev",
      status: "requested",
      type: "tv",
      page: 2,
      pageSize: 50,
      sort: { id: "requested", desc: true },
    })
  })

  it("falls back to every title, newest synced first, on a URL it does not know", async () => {
    await renderPage({ status: "bogus", sort: "-userId" })

    expect(getWatchlistPage).toHaveBeenCalledWith({
      q: "",
      status: "all",
      type: "all",
      page: 1,
      pageSize: 25,
      sort: { id: "synced", desc: true },
    })
  })

  it("shows the header, the settings card, the figures and the table", async () => {
    await renderPage()

    expect(screen.getByRole("heading", { level: 1, name: "Watchlist sync" })).toBeInTheDocument()
    expect(screen.getByTestId("settings-watchlist-section")).toHaveTextContent("Every 30 minutes")
    expect(screen.getByTestId("settings-watchlist-status")).toHaveTextContent("Connected")
    expect(screen.getByTestId("admin-watchlist-stat-members")).toHaveTextContent("4")
    expect(screen.getByTestId("admin-watchlist-stat-requested")).toHaveTextContent("7of 12 titles")
    expect(screen.getByTestId("admin-watchlist-stat-not-allowed")).toHaveTextContent("2")
    expect(screen.getByTestId("admin-watchlist-stat-no-match")).toHaveTextContent("1")
    expect(within(screen.getByTestId("admin-watchlist-row-h1")).getByRole("link", { name: "Ana" })).toHaveAttribute("href", "/admin/users/u1")
    expect(screen.getByTestId("admin-watchlist-filters-count")).toHaveTextContent("3 of 12 titles")
  })

  it("shows the last page for a page past the end", async () => {
    jest.mocked(getWatchlistPage).mockResolvedValue({ ...DATA, total: 60 })
    await renderPage({ page: "9" })

    expect(screen.getByTestId("admin-watchlist-pagination-info")).toHaveTextContent("Showing 51 to 60 of 60 titles")
  })

  it("says who saved last, and leaves the footer out before a first save", async () => {
    await renderPage()
    expect(screen.queryByTestId("settings-watchlist-last-saved")).not.toBeInTheDocument()

    jest.mocked(getWatchlistLastSaved).mockResolvedValue({ at: new Date(), by: "Dana Whitfield" })
    await renderPage()
    expect(screen.getByTestId("settings-watchlist-last-saved")).toHaveTextContent("by Dana Whitfield")
  })
})
