/**
 * The page alerts of `/admin/cleanup` (UX 4.1.4, 10.2): the words and ids
 * of each alert and its action, the three `sourceShrank` counters, the
 * `NO_OWNER` alert beside a failed Plex read, the order by tone, and the
 * fold above three.
 */

import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { OffAlert, PageAlerts, type PageAlertsProps } from "@/components/admin/cleanup/page/page-alerts"
import type { Block } from "@/lib/cleanup/blocks"
import type { CleanupFeatureState } from "@/lib/cleanup/types/screens"

jest.mock("@/actions/admin/cleanup-settings", () => ({ refreshCleanupData: jest.fn(), resumeCleanup: jest.fn() }))
jest.mock("@/components/ui/toast", () => ({ useToast: () => ({ showSuccess: jest.fn(), showError: jest.fn() }) }))

const NOW = Date.parse("2026-11-08T12:00:00.000Z")
const ON: CleanupFeatureState = { enabled: true, enabledAt: "2026-10-09T10:00:00.000Z", pausedAt: null, pausedBy: null, redis: true }

const renderAlerts = (props: Partial<PageAlertsProps> = {}) => render(<PageAlerts feature={ON} blocks={[]} now={NOW} {...props} />)
const ids = () => screen.queryAllByTestId(/^admin-cleanup-alert-[a-z0-9-]+$/).filter((el) => el.getAttribute("data-slot") === "alert").map((el) => el.dataset.testid)
const alert = (id: string) => screen.getByTestId(`admin-cleanup-alert-${id}`)

describe("PageAlerts", () => {
  it("renders nothing while nothing is wrong", () => {
    const { container } = renderAlerts()
    expect(container).toBeEmptyDOMElement()
  })

  it("names a failed source with its read time, and offers Refresh data now", () => {
    renderAlerts({ blocks: [{ code: "sourceFailed", service: "tautulli", readAt: "2026-11-08T03:07:00.000Z" }] })
    expect(alert("source-tautulli")).toHaveTextContent("Tautulli did not answer at 3:07 AM")
    expect(alert("source-tautulli")).toHaveTextContent("Runs change nothing until Tautulli answers. Unknown values never match.")
    expect(screen.getByTestId("admin-cleanup-alert-source-tautulli-action")).toHaveTextContent("Refresh data now")
    expect(alert("source-tautulli")).toHaveAttribute("data-tone", "destructive")
  })

  it("names a source that failed on another day, or with no time", () => {
    renderAlerts({ blocks: [{ code: "sourceFailed", service: "radarr", readAt: "2026-11-06T03:07:00.000Z" }, { code: "sourceFailed", service: "sonarr" }] })
    expect(alert("source-radarr")).toHaveTextContent("Radarr did not answer on Nov 6, 2026, 3:07 AM")
    expect(alert("source-sonarr")).toHaveTextContent(/^Sonarr did not answerRuns change nothing/)
  })

  it.each<[string, Block, string]>([
    ["Overseerr requests", { code: "sourceShrank", service: "overseerr", counter: "overseerrRequests", rows: 0, previousRows: 312 }, "Safety stop: Overseerr returned 0 requests, 312 before"],
    ["Tautulli history rows", { code: "sourceShrank", service: "tautulli", counter: "tautulliRows", rows: 0, previousRows: 1312 }, "Safety stop: Tautulli returned 0 plays in the history, 1,312 before"],
    ["Tautulli members", { code: "sourceShrank", service: "tautulli", counter: "usersWithPlay", rows: 0, previousRows: 41 }, "Safety stop: Tautulli returned 0 members with a play, 41 before"],
  ])("names the counted thing of a source that returned much less: %s", (_name, block, title) => {
    renderAlerts({ blocks: [block] })
    const id = `shrank-${block.service}`
    expect(alert(id)).toHaveTextContent(title)
    expect(alert(id)).toHaveTextContent(
      `Runs of the rules that use ${block.service === "overseerr" ? "Overseerr" : "Tautulli"} change nothing. If you expect this, press Refresh data now: a read that you start and that agrees clears this stop. The nightly read does not clear it.`
    )
    expect(screen.getByTestId(`admin-cleanup-alert-${id}-action`)).toHaveTextContent("Refresh data now")
  })

  it("joins two counters of one source in one alert, so its id stays unique", () => {
    renderAlerts({ blocks: [
      { code: "sourceShrank", service: "tautulli", counter: "tautulliRows", rows: 0, previousRows: 312 },
      { code: "sourceShrank", service: "tautulli", counter: "usersWithPlay", rows: 0, previousRows: 41 },
    ] })
    expect(screen.getAllByTestId("admin-cleanup-alert-shrank-tautulli")).toHaveLength(1)
    expect(alert("shrank-tautulli")).toHaveTextContent("Safety stop: Tautulli returned 0 plays in the history, 312 before, and 0 members with a play, 41 before")
  })

  it("shows the NO_OWNER alert beside a failed Plex read, each with its own ids", () => {
    renderAlerts({ blocks: [
      { code: "sourceFailed", service: "plex", readAt: "2026-11-08T03:07:00.000Z", errorCode: "TIMEOUT" },
      { code: "sourceFailed", service: "plex", errorCode: "NO_OWNER" },
      { code: "sourceFailed", service: "plex", errorCode: "HTTP_500" },
    ] })
    expect(ids()).toEqual(["admin-cleanup-alert-source-plex", "admin-cleanup-alert-plex-owner"])
    expect(alert("plex-owner")).toHaveTextContent("Plex has no owner account for this server")
    expect(alert("plex-owner")).toHaveTextContent("Reconnect Plex in Settings. Until then, access is unknown, and runs of every rule change nothing.")
    const action = screen.getByTestId("admin-cleanup-alert-plex-owner-action")
    expect(action).toHaveTextContent("Open settings")
    expect(action).toHaveAttribute("href", "/admin/settings#plex")
    expect(screen.getByTestId("admin-cleanup-alert-source-plex-action")).toHaveTextContent("Refresh data now")
  })

  it("names stale data with its age, and Tautulli without plays", () => {
    renderAlerts({ blocks: [{ code: "dataStale", hours: 41 }, { code: "tautulliStale" }, { code: "historyShort" }] })
    expect(alert("stale")).toHaveTextContent("Library data is 41 hours old")
    expect(alert("stale")).toHaveTextContent("The nightly read did not finish. Runs change nothing until a fresh read.")
    expect(alert("tautulli-stale")).toHaveTextContent("Tautulli recorded no play in 14 days")
    expect(screen.getByTestId("admin-cleanup-alert-stale-action")).toHaveTextContent("Refresh data now")
    expect(ids()).toEqual(["admin-cleanup-alert-tautulli-stale", "admin-cleanup-alert-stale"])
  })

  it("names stale data with no age", () => {
    renderAlerts({ blocks: [{ code: "dataStale" }] })
    expect(alert("stale")).toHaveTextContent("Library data is too old")
  })

  it("shows the pause with its time and who paused, and offers Resume cleanup", () => {
    renderAlerts({ feature: { ...ON, pausedAt: "2026-11-08T09:12:00.000Z", pausedBy: { id: "admin-1", name: "Avery Example", isYou: true } } })
    expect(alert("paused")).toHaveTextContent("Cleanup is paused")
    expect(alert("paused")).toHaveTextContent(
      "Since 9:12 AM today, by you. No run changes anything, and nothing is deleted. A deletion that started before the pause finishes. Approved batches went back to waiting for your approval. The Leaving soon collections are empty and members do not see the Leaving soon page. Every Keep stays."
    )
    expect(screen.getByTestId("admin-cleanup-alert-paused-resume")).toHaveTextContent("Resume cleanup")
    expect(alert("paused")).toHaveAttribute("data-tone", "warning")
  })

  it("names another admin who paused, and leaves out a pausing admin it cannot name", () => {
    const { unmount } = renderAlerts({ feature: { ...ON, pausedAt: "2026-11-07T09:12:00.000Z", pausedBy: { id: "admin-2", name: "Sam Example", isYou: false } } })
    expect(alert("paused")).toHaveTextContent("Since Nov 7, 2026, 9:12 AM, by Sam Example. No run")
    unmount()
    renderAlerts({ feature: { ...ON, pausedAt: "2026-11-08T09:12:00.000Z" } })
    expect(alert("paused")).toHaveTextContent("Since 9:12 AM today. No run")
  })

  it("shows the Redis alert with Open settings", () => {
    renderAlerts({ feature: { ...ON, redis: false } })
    expect(alert("redis")).toHaveTextContent("Redis is not set upLibrary reads and runs need the job queue. The preview works on the last library data.")
    expect(screen.getByTestId("admin-cleanup-alert-redis-action")).toHaveAttribute("href", "/admin/settings")
  })

  it("shows a Kometa removal, with the time it was made again", () => {
    const { unmount } = renderAlerts({ kometa: { collection: "Shows leaving soon", removedAt: "2026-11-08T00:00:00.000Z", recreatedAt: "2026-11-08T00:41:00.000Z" } })
    expect(alert("kometa")).toHaveTextContent(
      "Kometa removed Shows leaving soon at 12:00 AMplex-manager made it again at 12:41 AM. Kometa removes collections that it does not manage. Change the Kometa file to stop this."
    )
    const action = screen.getByTestId("admin-cleanup-alert-kometa-action")
    expect(action).toHaveTextContent("Read the Kometa note")
    expect(action).toHaveAttribute("href", "https://github.com/mchestr/plex-manager/blob/main/docs/media-cleanup.md#kometa")
    expect(action).toHaveAttribute("target", "_blank")
    unmount()
    renderAlerts({ kometa: { collection: "Movies leaving soon", removedAt: "2026-11-03T16:00:00.000Z", recreatedAt: null } })
    expect(alert("kometa")).toHaveTextContent("Kometa removed Movies leaving soon on Nov 3, 2026, 4:00 PMKometa removes collections")
  })

  it("shows the off alert with Open settings at the feature section, unless the page shows it in its own place", () => {
    const { unmount } = renderAlerts({ feature: { ...ON, enabled: false } })
    expect(alert("off")).toHaveTextContent("Media cleanup is off")
    expect(alert("off")).toHaveTextContent("Make rules and preview them now. A rule starts in Dry run")
    expect(screen.getByTestId("admin-cleanup-alert-off-settings")).toHaveAttribute("href", "/admin/cleanup?tab=settings&section=cleanup-feature")
    unmount()
    const { container } = renderAlerts({ feature: { ...ON, enabled: false }, showOff: false })
    expect(container).toBeEmptyDOMElement()
  })

  it("orders destructive, then warning, then info, and folds the rest into a link that shows them and moves focus", async () => {
    const user = userEvent.setup()
    renderAlerts({
      feature: { ...ON, enabled: false, redis: false, pausedAt: "2026-11-08T09:12:00.000Z" },
      blocks: [{ code: "dataStale", hours: 41 }, { code: "sourceFailed", service: "overseerr" }],
    })
    expect(ids()).toEqual(["admin-cleanup-alert-source-overseerr", "admin-cleanup-alert-stale", "admin-cleanup-alert-paused"])
    const more = screen.getByTestId("admin-cleanup-alert-more")
    expect(more).toHaveTextContent("2 more problems. Show them")
    await user.click(more)
    expect(ids()).toEqual([
      "admin-cleanup-alert-source-overseerr", "admin-cleanup-alert-stale", "admin-cleanup-alert-paused", "admin-cleanup-alert-redis", "admin-cleanup-alert-off",
    ])
    expect(screen.queryByTestId("admin-cleanup-alert-more")).not.toBeInTheDocument()
    expect(alert("redis")).toHaveFocus()
  })

  it("folds one alert with the singular words", () => {
    renderAlerts({ feature: { ...ON, enabled: false, redis: false }, blocks: [{ code: "dataStale", hours: 40 }, { code: "tautulliStale" }] })
    expect(screen.getByTestId("admin-cleanup-alert-more")).toHaveTextContent("1 more problem. Show it")
    expect(ids()).toHaveLength(3)
  })

  it("shows Reading on each Refresh data now while a read runs", () => {
    renderAlerts({ blocks: [{ code: "dataStale", hours: 41 }], reading: true })
    const action = screen.getByTestId("admin-cleanup-alert-stale-action")
    expect(action).toHaveAttribute("aria-busy", "true")
    expect(within(action).getAllByText("Reading").length).toBeGreaterThan(0)
  })
})

describe("OffAlert", () => {
  it("renders the off alert alone with the ids of UX 10.2", () => {
    render(<OffAlert />)
    expect(screen.getByTestId("admin-cleanup-alert-off")).toHaveTextContent("Media cleanup is off")
    expect(screen.getByTestId("admin-cleanup-alert-off-settings")).toHaveTextContent("Open settings")
  })
})
