/**
 * The warning email alerts on Inactive members: nothing while warnings are
 * off; with them on, email or Redis not set up, failed warnings (naming the
 * ones no run tries again), a daily run held by the safety limit while
 * members wait, and a newest run that stopped before its warning step while
 * members past their days without a play have no warning.
 */

import { render, screen } from "@testing-library/react"

import { resetUrl } from "@/__tests__/helpers/url-router"
import { WarningAlerts } from "@/components/admin/inactivity/warning-alerts"
import type { InactivityRunRow } from "@/lib/data/inactivity"
import type { InactivityPreviewRow } from "@/lib/data/inactivity-preview"

jest.mock("next/navigation", () => require("@/__tests__/helpers/url-router").navigationModule)

const run = (overrides: Partial<InactivityRunRow> = {}): InactivityRunRow => ({
  id: "run-1",
  startedAt: new Date("2026-11-08T07:17:00Z"),
  finishedAt: new Date("2026-11-08T07:18:00Z"),
  trigger: "scheduled",
  tautulliUsers: 12,
  matched: 10,
  qualified: 0,
  removed: 0,
  warned: 0,
  failed: 0,
  blocked: null,
  error: null,
  failedMembers: [],
  ...overrides,
})

const member = (id: string): InactivityPreviewRow => ({
  id,
  name: id,
  lastSeenAt: null,
  lastActiveAt: new Date("2026-01-01T00:00:00Z"),
  createdAt: new Date("2026-01-01T00:00:00Z"),
})

type Props = Parameters<typeof WarningAlerts>[0]

const BASE: Props = {
  warningsOn: true,
  removalOn: true,
  mailReady: true,
  queued: true,
  preview: { rows: [], unwarned: 0, failedWarnings: [] },
  runs: [run()],
  savedAt: null,
}

const ALERTS = ["no-email", "no-queue", "failed", "over-limit", "unwarned"]

function shown(props: Partial<Props>) {
  render(<WarningAlerts {...BASE} {...props} />)
  return ALERTS.filter((id) => screen.queryByTestId(`admin-inactivity-alert-${id}`) !== null)
}

beforeEach(() => resetUrl("/admin/inactivity"))

describe("WarningAlerts", () => {
  it("shows nothing while all is well", () => {
    expect(shown({})).toEqual([])
  })

  it("shows nothing while warnings are off, whatever else is wrong", () => {
    const preview = { rows: [member("a")], unwarned: 2, failedWarnings: [{ id: "a", name: "Ann", stuck: true }] }
    expect(shown({ warningsOn: false, mailReady: false, queued: false, preview, runs: [run({ blocked: "over_limit" })] })).toEqual([])
  })

  it("says no one new is removed while email is not set up, with a way to its settings", () => {
    expect(shown({ mailReady: false })).toEqual(["no-email"])
    expect(screen.getByTestId("admin-inactivity-alert-no-email")).toHaveTextContent(
      "Warning emails cannot go outEmail is not set up. No one new is removed until email works."
    )
    expect(screen.getByTestId("admin-inactivity-alert-email-link")).toHaveAttribute("href", "/admin/settings#email")
  })

  it("says the emails need the job queue while Redis is not set up", () => {
    expect(shown({ queued: false })).toEqual(["no-queue"])
    expect(screen.getByTestId("admin-inactivity-alert-no-queue")).toHaveTextContent("Redis is not set up, so no warning email goes out. No one new is removed.")
  })

  it("counts failed warnings, and names those no run tries again", () => {
    const failedWarnings = [
      { id: "a", name: "Ann", stuck: false },
      { id: "b", name: "Bo", stuck: true },
      { id: "c", name: "Cy", stuck: true },
    ]
    expect(shown({ preview: { ...BASE.preview, failedWarnings } })).toEqual(["failed"])
    expect(screen.getByTestId("admin-inactivity-alert-failed")).toHaveTextContent(/^3 warnings failedTheir members wait until a run sends them\. These failed 9 times/)
    expect(screen.getByTestId("admin-inactivity-alert-failed-stuck")).toHaveTextContent(/^Bo, Cy$/)
  })

  it("names no member when every failed warning gets more tries", () => {
    shown({ preview: { ...BASE.preview, failedWarnings: [{ id: "a", name: "Ann", stuck: false }] } })
    expect(screen.getByTestId("admin-inactivity-alert-failed")).toHaveTextContent(/^1 warning failedTheir members wait until a run sends them\.$/)
    expect(screen.queryByTestId("admin-inactivity-alert-failed-stuck")).not.toBeInTheDocument()
  })

  it("asks for Run now when the newest scheduled run met the safety limit while members wait", () => {
    const runs = [run({ id: "admin", trigger: "admin", warned: 1 }), run({ id: "daily", blocked: "over_limit" })]
    expect(shown({ runs, preview: { ...BASE.preview, rows: [member("a"), member("b")] } })).toEqual(["over-limit"])
    expect(screen.getByTestId("admin-inactivity-alert-over-limit")).toHaveTextContent(
      "2 members wait for removal, but more qualify than the safety limit allows, so the daily run removes no one. Check the list, then use Run now. After 7 days, their warnings start again."
    )
  })

  it("says one member waits", () => {
    shown({ runs: [run({ blocked: "over_limit" })], preview: { ...BASE.preview, rows: [member("a")] } })
    expect(screen.getByTestId("admin-inactivity-alert-over-limit")).toHaveTextContent("1 member waits for removal")
  })

  it("leaves the safety limit out when no one waits, or the newest scheduled run removed", () => {
    expect(shown({ runs: [run({ blocked: "over_limit" })] })).toEqual([])
    expect(shown({ runs: [run({ blocked: null }), run({ blocked: "over_limit" })], preview: { ...BASE.preview, rows: [member("a")] } })).toEqual([])
  })

  describe("members with no warning yet", () => {
    const preview = { ...BASE.preview, unwarned: 2 }

    it("shows when the newest run, after the newest save, stopped before its warning step, with why", () => {
      const runs = [run({ blocked: "tautulli_stale" })]
      expect(shown({ preview, runs, savedAt: new Date("2026-11-07T00:00:00Z") })).toEqual(["unwarned"])
      expect(screen.getByTestId("admin-inactivity-alert-unwarned")).toHaveTextContent(
        "2 members past the days without a play have no warning yet. The newest run stopped before it could warn them: Tautulli recorded no play in 14 days. No one new is removed until a run warns them."
      )
    })

    it("says one member has none, and counts a Plex token refused before the step", () => {
      shown({ preview: { ...preview, unwarned: 1 }, runs: [run({ trigger: "admin", blocked: "plex_auth" })] })
      expect(screen.getByTestId("admin-inactivity-alert-unwarned")).toHaveTextContent(/^The newest run sent no first warnings1 member past the days without a play has no warning yet\. /)
    })

    it.each<[string, Partial<Props>]>([
      // An exclusion that ended or a subscription that lapsed after a run that reached its warning step: the next run warns them
      ["the newest run reached its warning step", { runs: [run(), run({ id: "older", blocked: "sync_failed" })] }],
      ["the newest run stopped after its warning step", { runs: [run({ blocked: "over_limit" })] }],
      ["the Plex token was refused part way through the removals", { runs: [run({ blocked: "plex_auth", qualified: 2, removed: 1 })] }],
      ["the newest run planned warnings", { runs: [run({ warned: 2, blocked: "plex_unavailable" })] }],
      ["no run finished yet", { runs: [run({ finishedAt: null, blocked: "sync_failed" })] }],
      ["the settings were saved after the newest run", { runs: [run({ blocked: "sync_failed" })], savedAt: new Date("2026-11-08T08:00:00Z") }],
      ["automatic removal is off", { runs: [run({ blocked: "sync_failed" })], removalOn: false }],
    ])("stays out when %s", (_case, props) => {
      expect(shown({ preview, ...props })).toEqual([])
    })
  })
})
