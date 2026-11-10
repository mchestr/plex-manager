/**
 * The tiles of the Rules tab (UX 4.1.1, 4.1.2, 8.2, TS 12.7 items 3, 5 and
 * 6): in normal use, Leaving soon with the next leave date, the batch items
 * that wait ("Due today"), the space freed in 30 days ("Up to"), and the
 * free space with the Leaving soon share in its meter; on first use, the
 * movies, the shows, the free space with the months it lasts, and the
 * growth. Unknown disk values show a dash.
 */

import { render, screen } from "@testing-library/react"

import { LibraryTiles, monthsOfSpace } from "@/components/admin/cleanup/rules/library-tiles"
import { StatTiles } from "@/components/admin/cleanup/rules/stat-tiles"
import type { CleanupOverviewData } from "@/lib/cleanup/types/screens"
import { bindFormat } from "@/lib/utils/format"

const GB = 1024 ** 3
const TB = 1024 * GB
const b = (n: number) => String(Math.round(n))

const LIBRARY: CleanupOverviewData["library"] = {
  movies: { count: 780, bytes: b(4.88 * TB), libraries: ["Movies"], outOfScope: ["Movies 4K", "Keepsakes"] },
  shows: { count: 636, bytes: b(51.3 * TB), seasons: 2000, libraries: ["TV Shows"], outOfScope: [] },
  freeBytes: b(25.6 * TB),
  totalBytes: b(84 * TB),
  growthBytesPerMonth: b(1.4 * TB),
}

const STATS: CleanupOverviewData["stats"] = {
  leaving: { count: 52, bytes: b(4.5 * TB), nextLeaveAt: "2026-11-19" },
  waiting: { count: 6, bytes: b(1.24 * TB), dueAt: "2026-11-08", dueToday: true, level: "show" },
  freed30d: { count: 9, bytes: b(412 * GB), level: "season" },
}

const tile = (id: string) => screen.getByTestId(`admin-cleanup-tile-${id}`)
const renderStats = (stats: Partial<CleanupOverviewData["stats"]> = {}, library: Partial<CleanupOverviewData["library"]> = {}) =>
  render(<StatTiles stats={{ ...STATS, ...stats }} library={{ ...LIBRARY, ...library }} today="2026-11-08" />)

describe("StatTiles", () => {
  it("shows Leaving soon, the waiting batch due today, the freed space and the free space with its meter", () => {
    renderStats()

    expect(screen.getByTestId("admin-cleanup-stats")).toBeInTheDocument()
    expect(tile("leaving")).toHaveTextContent("In Leaving soon52titles, 4.5 TBNext leave date: Nov 19")
    expect(tile("waiting")).toHaveTextContent("Waiting for you6shows, 1.24 TBDue today")
    expect(tile("freed")).toHaveTextContent("Freed in the last 30 daysUp to 412GB9 seasons deleted. Torrent copies free their space later.")
    expect(tile("free")).toHaveTextContent("Free space25.6TB of 84 TBAbout 1.4 TB is added a month")
    expect(screen.getByRole("img", { name: "53.9 TB used, 4.5 TB in Leaving soon, 25.6 TB free" })).toBeInTheDocument()
  })

  it("names the day of a batch that is due since an earlier day, and mixed levels as titles", () => {
    renderStats({ waiting: { count: 2, bytes: b(10 * GB), dueAt: "2026-11-03", dueToday: false, level: null } })

    expect(tile("waiting")).toHaveTextContent("Waiting for you2titles, 10 GBDue Nov 3")
  })

  it("shows 0 with no batch, nothing freed, no next leave date and an unknown disk", () => {
    renderStats(
      { leaving: { count: 0, bytes: "0", nextLeaveAt: null }, waiting: null, freed30d: { count: 0, bytes: "0", level: null } },
      { freeBytes: null, totalBytes: null, growthBytesPerMonth: null }
    )

    expect(tile("leaving")).toHaveTextContent(/^In Leaving soon0titles, 0 GB$/)
    expect(tile("waiting")).toHaveTextContent(/^Waiting for you0titles$/)
    expect(tile("freed")).toHaveTextContent("Freed in the last 30 days0GB0 titles deleted.")
    expect(tile("free")).toHaveTextContent("Free space")
    expect(screen.getByRole("img", { name: "Not available" })).toBeInTheDocument()
  })

  it("leaves the Leaving soon share out of the meter while nothing is in Leaving soon", () => {
    renderStats({ leaving: { count: 0, bytes: "0", nextLeaveAt: null } })

    expect(screen.getByRole("img", { name: "58.4 TB used, 25.6 TB free" })).toBeInTheDocument()
  })
})

describe("LibraryTiles", () => {
  it("shows the movies and shows with their libraries, the libraries never in scope, the free space with its months, and the growth", () => {
    render(<LibraryTiles library={LIBRARY} />)

    const tiles = screen.getByTestId("admin-cleanup-library-tiles")
    expect(tiles).toHaveTextContent("Movies780in Movies4.88 TB. Movies 4K and Keepsakes are never in scope")
    expect(tiles).toHaveTextContent("TV shows636in TV Shows51.3 TB in 2,000 seasons")
    expect(tiles).not.toHaveTextContent("TV Shows51.3 TB in 2,000 seasons.")
    expect(tile("free")).toHaveTextContent("Free space25.6TB of 84 TBAbout 18 months of space at this growth")
    expect(tiles).toHaveTextContent("Growth1.4TB a monthAverage of the last 6 months")
  })

  it("shows zeros and dashes before the first library read", () => {
    render(
      <LibraryTiles
        library={{
          movies: { count: 1, bytes: "0", libraries: [], outOfScope: [] },
          shows: { count: 1, bytes: "0", seasons: 1, libraries: [], outOfScope: ["Home videos"] },
          freeBytes: null,
          totalBytes: null,
          growthBytesPerMonth: null,
        }}
      />
    )

    const tiles = screen.getByTestId("admin-cleanup-library-tiles")
    expect(tiles).toHaveTextContent("Movies1movie0 GB")
    expect(tiles).toHaveTextContent("TV shows1show0 GB in 1 season. Home videos is never in scope")
    expect(screen.getAllByRole("img", { name: "Not available" })).toHaveLength(2)
  })
})

describe("monthsOfSpace", () => {
  const f = bindFormat({ timeZone: "UTC", locale: "en-US" })

  it("rounds the months down, says one month, groups large numbers, and is null without growth", () => {
    expect(monthsOfSpace({ freeBytes: "30", growthBytesPerMonth: "20" }, f)).toBe("About 1 month of space at this growth")
    expect(monthsOfSpace({ freeBytes: "20480", growthBytesPerMonth: "20" }, f)).toBe("About 1,024 months of space at this growth")
    expect(monthsOfSpace({ freeBytes: "30", growthBytesPerMonth: "0" }, f)).toBeNull()
    expect(monthsOfSpace({ freeBytes: null, growthBytesPerMonth: "20" }, f)).toBeNull()
  })
})
