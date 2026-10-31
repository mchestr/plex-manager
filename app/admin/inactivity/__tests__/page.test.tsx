/**
 * The inactive members page: its own admin check before any read, then the
 * settings card (with "Last saved" only after a first save, the newest run
 * and Run now confirming the members the preview lists), the preview and the
 * runs, and a warning with a way to Settings while Tautulli is not set up.
 */

import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { connection } from "next/server"

import { resetUrl } from "@/__tests__/helpers/url-router"
import { runMemberActivityNow } from "@/actions/admin/inactivity"
import InactivityPage from "@/app/admin/inactivity/page"
import { assertAdmin } from "@/lib/admin"
import { getInactivityPage, type InactivityPageData } from "@/lib/data/inactivity"

jest.mock("next/navigation", () => require("@/__tests__/helpers/url-router").navigationModule)
jest.mock("next/server", () => ({ ...jest.requireActual("next/server"), connection: jest.fn().mockResolvedValue(undefined) }))
jest.mock("@/lib/admin", () => ({ assertAdmin: jest.fn() }))
jest.mock("@/lib/data/inactivity", () => ({ getInactivityPage: jest.fn() }))
jest.mock("@/lib/settings/app-settings", () => ({
  getFormat: async () => (await import("@/lib/utils/format")).bindFormat({ timeZone: "America/Chicago", locale: "en-US" }),
}))
jest.mock("@/actions/admin/inactivity", () => ({ updateInactivitySettings: jest.fn(), runMemberActivityNow: jest.fn() }))
jest.mock("@/components/ui/toast", () => ({ useToast: () => ({ showSuccess: jest.fn(), showError: jest.fn() }) }))

const DATA: InactivityPageData = {
  settings: { enabled: true, thresholdDays: 180 },
  lastSaved: null,
  runs: [
    {
      id: "run-2",
      startedAt: new Date("2026-10-31T07:17:00Z"),
      finishedAt: new Date("2026-10-31T07:18:00Z"),
      trigger: "scheduled",
      tautulliUsers: 12,
      matched: 10,
      qualified: 0,
      removed: 0,
      failed: 0,
      blocked: null,
      error: null,
      failedMembers: [],
    },
    {
      id: "run-1",
      startedAt: new Date("2026-10-30T07:17:00Z"),
      finishedAt: new Date("2026-10-30T07:18:00Z"),
      trigger: "admin",
      tautulliUsers: 12,
      matched: 10,
      qualified: 30,
      removed: 0,
      failed: 0,
      blocked: "not_confirmed",
      error: null,
      failedMembers: [],
    },
  ],
  tautulliConfigured: true,
  redisConfigured: true,
  preview: {
    rows: [
      {
        id: "u-nia",
        name: "Nia Never",
        lastSeenAt: null,
        lastActiveAt: new Date("2025-08-01T00:00:00Z"),
        createdAt: new Date("2025-08-01T00:00:00Z"),
      },
      {
        id: "u-sam",
        name: "Sam Seen",
        lastSeenAt: new Date("2026-03-03T20:00:00Z"),
        lastActiveAt: new Date("2026-03-03T20:00:00Z"),
        createdAt: new Date("2024-01-15T00:00:00Z"),
      },
    ],
    skips: { no_plex: 0, admin: 1, owner: 0, role: 0, exempt: 0, paying: 0, excluded: 0, not_read: 0 },
    active: 7,
    noAccess: 0,
    shareCheck: null,
    scheduledLimit: 1,
    readSince: new Date("2026-10-31T07:17:00Z"),
  },
}

async function renderPage() {
  render(await InactivityPage())
}

beforeEach(() => {
  jest.clearAllMocks()
  resetUrl("/admin/inactivity")
  jest.mocked(assertAdmin).mockResolvedValue({ user: { id: "admin-1", isAdmin: true }, expires: "" } as never)
  jest.mocked(getInactivityPage).mockResolvedValue(DATA)
})

describe("Admin inactivity page", () => {
  it("checks for an admin before reading anything", async () => {
    jest.mocked(assertAdmin).mockRejectedValue(Object.assign(new Error("Admin access required"), { digest: "PM_FORBIDDEN" }))

    await expect(InactivityPage()).rejects.toMatchObject({ digest: "PM_FORBIDDEN" })
    expect(getInactivityPage).not.toHaveBeenCalled()
  })

  it("renders per request, with the preview as of now", async () => {
    const before = Date.now()
    await renderPage()

    expect(connection).toHaveBeenCalled()
    const now = jest.mocked(getInactivityPage).mock.calls[0][0]
    expect(now.getTime()).toBeGreaterThanOrEqual(before)
    expect(now.getTime()).toBeLessThanOrEqual(Date.now())
  })

  it("shows the header, the settings card with the newest run, the preview and the runs", async () => {
    await renderPage()

    expect(screen.getByRole("heading", { level: 1, name: "Inactive members" })).toBeInTheDocument()
    expect(screen.getByTestId("settings-inactivity-summary-enabled")).toHaveTextContent("On")
    expect(screen.getByTestId("settings-inactivity-summary-schedule")).toHaveTextContent("Every day at about 02:17, server time")
    expect(screen.getByTestId("settings-inactivity-summary-limit")).toHaveTextContent("1 member per scheduled run")
    expect(screen.getByTestId("admin-inactivity-last-run")).toHaveTextContent(/Scheduled run, .+\. No inactive members\./)
    expect(screen.getByTestId("admin-inactivity-read-timestamp")).toHaveTextContent("Oct 31, 2026, 2:17 AM CDT")
    expect(screen.getByTestId("admin-inactivity-member-u-sam")).toHaveAttribute("href", "/admin/users/u-sam")
    expect(screen.getByTestId("admin-inactivity-not-listed-admin")).toHaveTextContent("Admin1")
    expect(screen.getByRole("heading", { level: 2, name: "Recent runs" })).toBeInTheDocument()
    expect(within(screen.getByTestId("admin-inactivity-runs-row-run-1")).getByText("A member who qualified was not confirmed")).toBeInTheDocument()
    expect(screen.queryByTestId("admin-inactivity-no-tautulli")).not.toBeInTheDocument()
  })

  it("asks to confirm Run now for the members the preview lists, and passes their ids on", async () => {
    const user = userEvent.setup()
    jest.mocked(runMemberActivityNow).mockResolvedValue({ success: true, data: { queued: true } })
    await renderPage()

    await user.click(screen.getByTestId("admin-inactivity-run-now"))
    expect(await screen.findByRole("heading", { name: "Remove Plex access from 2 members now?" })).toBeInTheDocument()
    await user.click(screen.getByTestId("admin-inactivity-run-confirm"))

    expect(runMemberActivityNow).toHaveBeenCalledWith({ confirmedUserIds: ["u-nia", "u-sam"] })
  })

  it("says who saved last, and leaves the footer out before a first save", async () => {
    await renderPage()
    expect(screen.queryByTestId("settings-inactivity-last-saved")).not.toBeInTheDocument()

    jest.mocked(getInactivityPage).mockResolvedValue({ ...DATA, lastSaved: { at: new Date(), by: "Dana Whitfield" } })
    await renderPage()
    expect(screen.getByTestId("settings-inactivity-last-saved")).toHaveTextContent("by Dana Whitfield")
  })

  it("warns while Tautulli is not set up, with a way to its settings", async () => {
    jest.mocked(getInactivityPage).mockResolvedValue({ ...DATA, tautulliConfigured: false, redisConfigured: false, runs: [] })
    await renderPage()

    expect(screen.getByTestId("admin-inactivity-no-tautulli")).toHaveTextContent("Tautulli is not set up")
    expect(screen.getByTestId("admin-inactivity-setup-tautulli")).toHaveAttribute("href", "/admin/settings#tautulli")
    expect(screen.getByTestId("settings-inactivity-summary-schedule")).toHaveTextContent("Not scheduled")
    expect(screen.getByTestId("admin-inactivity-last-run")).toHaveTextContent("No run yet.")
    expect(screen.getByTestId("admin-inactivity-runs-empty")).toBeInTheDocument()
  })
})
