/**
 * The source line (UX 4.1.1, 4.1.4, 10.2): a dot per configured source, the
 * read time, the first read, the reading spinner and "Refresh data now".
 */

import { render, screen } from "@testing-library/react"

import { SourceLine } from "@/components/admin/cleanup/page/source-line"
import type { SourceStatus } from "@/lib/cleanup/schema/snapshot"
import type { CleanupSnapshotState } from "@/lib/cleanup/types/screens"

jest.mock("@/actions/admin/cleanup-settings", () => ({ refreshCleanupData: jest.fn() }))
jest.mock("@/components/ui/toast", () => ({ useToast: () => ({ showSuccess: jest.fn(), showError: jest.fn() }) }))

const NOW = Date.parse("2026-11-08T12:00:00.000Z")
const READ_AT = "2026-11-08T03:07:00.000Z"
const ok = (service: SourceStatus["service"], extra: Partial<SourceStatus> = {}): SourceStatus => ({ service, state: "ok", readAt: READ_AT, ...extra })
const SOURCES: SourceStatus[] = [
  ok("plex", { part: "server" }), ok("plex", { part: "shares" }), ok("tautulli"), ok("overseerr"), ok("radarr"), ok("sonarr"),
]
const SNAPSHOT: CleanupSnapshotState = { id: "snap-1", takenAt: READ_AT, finishedAt: "2026-11-08T03:09:14.000Z", reading: false }

describe("SourceLine", () => {
  it("shows each configured source once, the read time and Refresh data now", () => {
    render(<SourceLine sources={SOURCES} snapshot={SNAPSHOT} redis now={NOW} />)
    const line = screen.getByTestId("admin-cleanup-sources")
    expect(line).toHaveTextContent("PlexTautulliOverseerrRadarrSonarrLibrary data from 3:07 AM todayRefresh data now")
    expect(screen.getAllByTestId("admin-cleanup-source-plex")).toHaveLength(1)
    expect(screen.getByTestId("admin-cleanup-data-timestamp")).toHaveTextContent("3:07 AM today")
    expect(screen.getByTestId("admin-cleanup-refresh-data")).toBeEnabled()
    expect(screen.getByRole("list", { name: "Library data sources" })).toBeInTheDocument()
  })

  it("names a failed source, leaves out sources that are not set up, and reads data of another day with its date", () => {
    const sources = [ok("plex"), ok("plex", { part: "shares", state: "failed", errorCode: "NO_OWNER" }), ok("tautulli", { state: "failed" }),
      ok("overseerr", { state: "notConfigured", readAt: null })]
    render(<SourceLine sources={sources} snapshot={{ ...SNAPSHOT, takenAt: "2026-11-06T03:07:00.000Z" }} redis now={NOW} refresh={false} />)
    expect(screen.getByTestId("admin-cleanup-source-plex")).toHaveTextContent("Plex failed")
    expect(screen.getByTestId("admin-cleanup-source-tautulli")).toHaveTextContent("Tautulli failed")
    expect(screen.queryByTestId("admin-cleanup-source-overseerr")).not.toBeInTheDocument()
    expect(screen.getByTestId("admin-cleanup-data-timestamp")).toHaveTextContent("Nov 6, 2026, 3:07 AM")
    expect(screen.queryByTestId("admin-cleanup-refresh-data")).not.toBeInTheDocument()
  })

  it("falls back to the finish time when the snapshot has no read time", () => {
    render(<SourceLine sources={SOURCES} snapshot={{ ...SNAPSHOT, takenAt: null }} redis now={NOW} />)
    expect(screen.getByTestId("admin-cleanup-data-timestamp")).toHaveTextContent("3:09 AM today")
  })

  it("reads the library for the first time before any library data", () => {
    render(<SourceLine sources={[]} snapshot={{ id: null, takenAt: null, finishedAt: null, reading: false }} redis now={NOW} />)
    expect(screen.getByTestId("admin-cleanup-first-read")).toHaveTextContent("Reading your library for the first time. This takes 1 to 3 minutes.")
    expect(screen.queryByRole("list")).not.toBeInTheDocument()
    expect(screen.queryByTestId("admin-cleanup-data-timestamp")).not.toBeInTheDocument()
  })

  it("says no library data yet without Redis, and disables Refresh data now with the reason", () => {
    render(<SourceLine sources={[]} snapshot={{ id: null, takenAt: null, finishedAt: null, reading: false }} redis={false} now={NOW} />)
    expect(screen.getByTestId("admin-cleanup-sources")).toHaveTextContent("No library data yet.")
    expect(screen.queryByTestId("admin-cleanup-first-read")).not.toBeInTheDocument()
    expect(screen.getByTestId("admin-cleanup-refresh-data")).toHaveAccessibleDescription("Redis is not set up. Library reads and runs need the job queue.")
  })

  it("shows the reading spinner while a read runs, and Reading on the button", () => {
    render(<SourceLine sources={SOURCES} snapshot={{ ...SNAPSHOT, reading: true }} redis now={NOW} />)
    expect(screen.getByTestId("admin-cleanup-sources")).toHaveTextContent("Reading the library. This takes 1 to 3 minutes.")
    expect(screen.queryByTestId("admin-cleanup-data-timestamp")).not.toBeInTheDocument()
    expect(screen.getByTestId("admin-cleanup-refresh-data")).toHaveAttribute("aria-busy", "true")
  })
})
