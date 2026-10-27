/**
 * The Request limits section: a summary of the saved flag, hour and tiers
 * until Edit swaps in the tier grid, a save that sends numbers, the server's
 * message inline, and the last run with "Run now" from the summary.
 */

import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { runRequestTiersNow, updateRequestTierSettings } from "@/actions/admin/request-tiers"
import { RequestTiersSection } from "@/components/admin/settings/sections/request-tiers-section"
import { SettingsEditProvider } from "@/components/ui/settings-edit-context"
import type { RequestTierSettingsData } from "@/lib/data/community-stats"
import { DEFAULT_TIERS } from "@/lib/request-tiers/tiers"

jest.mock("@/actions/admin/request-tiers", () => ({ updateRequestTierSettings: jest.fn(), runRequestTiersNow: jest.fn() }))

const mockShowSuccess = jest.fn()
const mockShowError = jest.fn()
jest.mock("@/components/ui/toast", () => ({ useToast: () => ({ showSuccess: mockShowSuccess, showError: mockShowError }) }))

const saved = (patch: Partial<RequestTierSettingsData> = {}): RequestTierSettingsData => ({
  enabled: true,
  runHour: 0,
  tiers: [...DEFAULT_TIERS],
  lastRun: null,
  ...patch,
})

/** Inside the page's edit provider, so the section and its "Run now" share one mode. */
function renderSection(data: RequestTierSettingsData = saved(), startedLabel: string | null = null) {
  return render(
    <SettingsEditProvider onDirtyChange={jest.fn()}>
      <RequestTiersSection saved={data} startedLabel={startedLabel} />
    </SettingsEditProvider>
  )
}

const summaryRow = (key: string) => screen.getByTestId(`settings-request-tiers-summary-${key}`)
const cells = (row: HTMLElement) => within(row).getAllByRole("cell").map((cell) => cell.textContent)

async function edit(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByTestId("settings-request-tiers-edit"))
}

/** The save's transition has settled: Cancel and the grid take input again. */
const settled = () => waitFor(() => expect(screen.getByTestId("settings-request-tiers-cancel")).toBeEnabled())

/** "Run now" has finished, so it takes another click. */
const idle = () => waitFor(() => expect(screen.getByTestId("request-tiers-run")).not.toHaveAttribute("aria-busy"))

beforeEach(() => jest.clearAllMocks())

describe("RequestTiersSection", () => {
  describe("view mode", () => {
    it("summarises the flag, the hour and the tiers as a table, with no fields", () => {
      renderSection()

      expect(screen.getByTestId("settings-request-tiers-summary")).toBeInTheDocument()
      expect(summaryRow("enabled")).toHaveTextContent("On")
      expect(summaryRow("run-hour")).toHaveTextContent("00:00, server time")
      const table = within(summaryRow("tiers")).getByRole("table", { name: "Request limits by watch time" })
      expect(within(table).getAllByRole("columnheader").map((header) => header.textContent)).toEqual(["Tier", "Watch time", "Movies", "Shows", "Period"])
      expect(within(table).getByRole("rowheader", { name: "1" })).toBeInTheDocument()
      expect(cells(summaryRow("tier-1"))).toEqual(["Any", "2", "1", "7 days"])
      expect(cells(summaryRow("tier-2"))).toEqual(["More than 24 h", "4", "2", "7 days"])
      expect(cells(summaryRow("tier-5"))).toEqual(["More than 200 h", "Unlimited", "Unlimited", "7 days"])
      expect(screen.getByRole("button", { name: "Edit Request limits" })).toBeInTheDocument()
      expect(screen.queryByTestId("settings-request-tiers-form")).not.toBeInTheDocument()
      expect(screen.queryByTestId("request-tiers-2-overHours")).not.toBeInTheDocument()
      expect(screen.queryByTestId("request-tiers-toggle")).not.toBeInTheDocument()
      expect(screen.getByTestId("request-tiers-last-run")).toHaveTextContent("No run yet.")
    })

    it("reads Off, the hour padded and periods other than a week", () => {
      renderSection(
        saved({
          enabled: false,
          runHour: 3,
          tiers: [
            { overHours: 0, movieLimit: 1, tvLimit: 0, days: 1 },
            { overHours: 10, movieLimit: 3, tvLimit: 2, days: 30 },
          ],
        })
      )

      expect(summaryRow("enabled")).toHaveTextContent("Off")
      expect(summaryRow("run-hour")).toHaveTextContent("03:00, server time")
      expect(cells(summaryRow("tier-1"))).toEqual(["Any", "1", "Unlimited", "1 day"])
      expect(cells(summaryRow("tier-2"))).toEqual(["More than 10 h", "3", "2", "30 days"])
      expect(screen.queryByTestId("settings-request-tiers-summary-tier-3")).not.toBeInTheDocument()
    })

    it("runs now", async () => {
      const user = userEvent.setup()
      jest.mocked(runRequestTiersNow).mockResolvedValue({ success: true, data: { queued: true } })
      renderSection()

      await user.click(screen.getByTestId("request-tiers-run"))

      expect(runRequestTiersNow).toHaveBeenCalledTimes(1)
      await waitFor(() => expect(mockShowSuccess).toHaveBeenCalledWith("Request limit sync queued"))
    })

    it("says when the run finished in the request, and shows a refusal", async () => {
      const user = userEvent.setup()
      jest
        .mocked(runRequestTiersNow)
        .mockResolvedValueOnce({ success: true, data: { queued: false } })
        .mockResolvedValueOnce({ success: false, code: "INTERNAL", error: "Could not run the request limits" })
      renderSection()

      await user.click(screen.getByTestId("request-tiers-run"))
      await waitFor(() => expect(mockShowSuccess).toHaveBeenCalledWith("Request limits updated"))
      await idle()

      await user.click(screen.getByTestId("request-tiers-run"))
      await waitFor(() => expect(mockShowError).toHaveBeenCalledWith("Could not run the request limits"))
    })

    it("lists the members whose quota changed in the last run", () => {
      const lastRun = {
        startedAt: new Date("2027-01-02T00:00:00Z"),
        finishedAt: new Date("2027-01-02T00:01:00Z"),
        trigger: "scheduled",
        updated: 1,
        unchanged: 5,
        failed: 0,
        skipped: 2,
        error: null,
        entries: [
          {
            overseerrUserId: 1,
            name: "Sam",
            hours: 31,
            tier: 2,
            status: "updated" as const,
            oldQuota: { movieQuotaLimit: 2, movieQuotaDays: 7, tvQuotaLimit: 1, tvQuotaDays: 7 },
            newQuota: { movieQuotaLimit: 4, movieQuotaDays: 7, tvQuotaLimit: 2, tvQuotaDays: 7 },
          },
          {
            overseerrUserId: 2,
            name: "Quiet",
            hours: 1,
            tier: 1,
            status: "unchanged" as const,
            oldQuota: { movieQuotaLimit: 2, movieQuotaDays: 7, tvQuotaLimit: 1, tvQuotaDays: 7 },
            newQuota: { movieQuotaLimit: 2, movieQuotaDays: 7, tvQuotaLimit: 1, tvQuotaDays: 7 },
          },
        ],
      }
      renderSection(saved({ lastRun }), "Jan 2, 2027, 12:00 AM")

      const section = screen.getByTestId("request-tiers-last-run")
      expect(section).toHaveTextContent("Jan 2, 2027, 12:00 AM, scheduled.")
      expect(section).toHaveTextContent("1 updated, 5 unchanged, 0 failed, 2 excluded.")
      expect(section).toHaveTextContent("Sam")
      expect(section).toHaveTextContent("2 movies/week, 1 TV/week to 4 movies/week, 2 TV/week")
      expect(section).not.toHaveTextContent("Quiet")
    })
  })

  describe("edit mode", () => {
    it("shows a row per tier, the flag as a checkbox, and the last run without Run now", async () => {
      const user = userEvent.setup()
      renderSection()

      await edit(user)

      expect(screen.queryByTestId("settings-request-tiers-summary")).not.toBeInTheDocument()
      expect(screen.getByTestId("request-tiers-2-overHours")).toHaveValue(24)
      expect(screen.getByTestId("request-tiers-5-movieLimit")).toHaveValue(0)
      expect(screen.getByTestId("request-tiers-1-overHours")).toHaveAttribute("readonly")
      expect(screen.getByTestId("request-tiers-hour")).toHaveValue(0)
      const toggle = screen.getByRole("checkbox", { name: "Sync request limits every day" })
      expect(toggle).toHaveAttribute("data-testid", "request-tiers-toggle")
      expect(toggle).toHaveAttribute("aria-checked", "true")
      expect(toggle).toHaveAccessibleDescription(expect.stringContaining("The first run overwrites every matched member's Overseerr quota"))
      await waitFor(() => expect(toggle).toHaveFocus())
      expect(screen.queryByRole("switch")).not.toBeInTheDocument()
      expect(screen.getByTestId("request-tiers-last-run")).toHaveTextContent("No run yet.")
      expect(screen.queryByTestId("request-tiers-run")).not.toBeInTheDocument()
    })

    it("saves edited tiers as numbers, then returns to the summary", async () => {
      const user = userEvent.setup()
      jest.mocked(updateRequestTierSettings).mockResolvedValue({ success: true, data: null })
      renderSection()

      await edit(user)
      const movies = screen.getByTestId("request-tiers-2-movieLimit")
      await user.clear(movies)
      await user.type(movies, "5")
      await user.click(screen.getByTestId("settings-request-tiers-save"))

      expect(updateRequestTierSettings).toHaveBeenCalledWith({
        enabled: true,
        runHour: 0,
        tiers: DEFAULT_TIERS.map((tier, index) => (index === 1 ? { ...tier, movieLimit: 5 } : tier)),
      })
      expect(await screen.findByTestId("settings-request-tiers-summary")).toBeInTheDocument()
      expect(mockShowSuccess).toHaveBeenCalledWith("Request limits saved")
      await waitFor(() => expect(screen.getByTestId("settings-request-tiers-edit")).toHaveFocus())
      expect(screen.getByTestId("request-tiers-run")).toBeInTheDocument()
    })

    it("shows the server's message when a save is refused and stays in edit mode", async () => {
      const user = userEvent.setup()
      jest.mocked(updateRequestTierSettings).mockResolvedValue({
        success: false,
        code: "VALIDATION",
        error: "Invalid input",
        fieldErrors: { tiers: ["Each tier needs more hours than the one before"] },
      })
      renderSection()

      await edit(user)
      await user.click(screen.getByTestId("request-tiers-add"))
      await user.click(screen.getByTestId("settings-request-tiers-save"))

      expect(await screen.findByTestId("request-tiers-error")).toHaveTextContent("Each tier needs more hours than the one before")
      expect(screen.getByTestId("settings-request-tiers-form")).toBeInTheDocument()
      expect(mockShowError).not.toHaveBeenCalled()
    })

    it("shows a refusal without field errors inline and stays in edit mode", async () => {
      const user = userEvent.setup()
      const message = "Request limits need an active Tautulli and Overseerr server"
      jest.mocked(updateRequestTierSettings).mockResolvedValue({ success: false, code: "VALIDATION", error: message })
      renderSection(saved({ enabled: false }))

      await edit(user)
      await user.click(screen.getByTestId("request-tiers-toggle"))
      await user.click(screen.getByTestId("settings-request-tiers-save"))

      expect(await screen.findByTestId("request-tiers-error")).toHaveTextContent(message)
      expect(screen.getByTestId("settings-request-tiers-form")).toBeInTheDocument()
      expect(screen.getByTestId("request-tiers-toggle")).toHaveAttribute("aria-checked", "true")
    })

    it("treats a save whose schedule did not move as saved, with the queue's message", async () => {
      const user = userEvent.setup()
      const message = "Settings saved, but the job queue did not answer, so the schedule was not updated. The worker updates it the next time it starts."
      jest.mocked(updateRequestTierSettings).mockResolvedValue({ success: false, code: "UPSTREAM_UNAVAILABLE", error: message })
      renderSection()

      await edit(user)
      await user.clear(screen.getByTestId("request-tiers-hour"))
      await user.type(screen.getByTestId("request-tiers-hour"), "4")
      await user.click(screen.getByTestId("settings-request-tiers-save"))

      expect(await screen.findByTestId("settings-request-tiers-summary")).toBeInTheDocument()
      expect(mockShowError).toHaveBeenCalledWith(message)
      expect(mockShowSuccess).not.toHaveBeenCalled()
      expect(screen.queryByTestId("request-tiers-error")).not.toBeInTheDocument()
    })

    it("adds a tier above the last and removes the last", async () => {
      const user = userEvent.setup()
      renderSection()

      await edit(user)
      await user.click(screen.getByTestId("request-tiers-add"))
      expect(screen.getByTestId("request-tiers-6-overHours")).toHaveValue(250)

      await user.click(screen.getByTestId("request-tiers-remove"))
      expect(screen.queryByTestId("request-tiers-row-6")).not.toBeInTheDocument()
    })

    it("clears the error with the edits on Cancel", async () => {
      const user = userEvent.setup()
      jest.mocked(updateRequestTierSettings).mockResolvedValue({
        success: false,
        code: "VALIDATION",
        error: "Invalid input",
        fieldErrors: { tiers: ["Each tier needs more hours than the one before"] },
      })
      renderSection()

      await edit(user)
      await user.click(screen.getByTestId("request-tiers-add"))
      await user.click(screen.getByTestId("settings-request-tiers-save"))
      expect(await screen.findByTestId("request-tiers-error")).toBeInTheDocument()
      await settled()

      await user.click(screen.getByTestId("settings-request-tiers-cancel"))
      await user.click(await screen.findByTestId("settings-request-tiers-discard-dialog-confirm"))
      expect(await screen.findByTestId("settings-request-tiers-summary")).toBeInTheDocument()

      await edit(user)
      expect(screen.queryByTestId("request-tiers-row-6")).not.toBeInTheDocument()
      expect(screen.queryByTestId("request-tiers-error")).not.toBeInTheDocument()
    })
  })
})
