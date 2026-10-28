/**
 * Watchlist sync's settings card (P10.20, on its own page since it left
 * Settings): the saved flag and interval as a summary until Edit swaps in the
 * form, where the flag is a Checkbox that saves with Save and the interval
 * shows while the draft is on. Unsaved changes make the browser ask before
 * the tab closes.
 */

import { act, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { updateGlobalWatchlistSyncSettings } from "@/actions/admin/watchlist"
import { SyncSettingsSection } from "@/components/admin/watchlist/sync-settings-section"

jest.mock("@/actions/admin/watchlist", () => ({ updateGlobalWatchlistSyncSettings: jest.fn() }))

const mockShowSuccess = jest.fn()
const mockShowError = jest.fn()
jest.mock("@/components/ui/toast", () => ({ useToast: () => ({ showSuccess: mockShowSuccess, showError: mockShowError }) }))

const HEALTH = { status: "ok" as const, code: null, checkedAt: null }
const ON = { enabled: true, intervalMinutes: 60 }
const OFF = { enabled: false, intervalMinutes: 60 }

async function renderSection(saved = ON) {
  await act(async () => {
    render(<SyncSettingsSection saved={saved} health={HEALTH} />)
  })
}

const summaryRow = (key: string) => screen.getByTestId(`settings-watchlist-summary-${key}`)

async function edit(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByTestId("settings-watchlist-edit"))
}

beforeEach(() => jest.clearAllMocks())

describe("SyncSettingsSection", () => {
  describe("view mode", () => {
    it("summarises sync as On with its interval", async () => {
      await renderSection()

      expect(screen.getByRole("heading", { name: "Sync settings" })).toBeInTheDocument()
      expect(screen.getByRole("button", { name: "Edit Sync settings" })).toBeInTheDocument()
      expect(summaryRow("enabled")).toHaveTextContent(/^Watchlist syncOn$/)
      expect(summaryRow("interval")).toHaveTextContent(/^Sync intervalEvery 60 minutes$/)
      // No controls, and no input test id reused
      expect(screen.queryByRole("checkbox")).not.toBeInTheDocument()
      expect(screen.queryByRole("switch")).not.toBeInTheDocument()
      expect(screen.queryByTestId("watchlist-sync-global-toggle")).not.toBeInTheDocument()
      expect(screen.queryByTestId("watchlist-sync-interval-input")).not.toBeInTheDocument()
      expect(screen.queryByTestId("settings-watchlist-form")).not.toBeInTheDocument()
    })

    it("says Off with no interval while sync is off", async () => {
      await renderSection(OFF)

      expect(summaryRow("enabled")).toHaveTextContent(/^Watchlist syncOff$/)
      expect(screen.queryByTestId("settings-watchlist-summary-interval")).not.toBeInTheDocument()
    })
  })

  describe("edit mode", () => {
    it("puts the flag in a Checkbox and focuses it", async () => {
      const user = userEvent.setup()
      await renderSection()

      await edit(user)

      const form = screen.getByTestId("settings-watchlist-form")
      const toggle = within(form).getByRole("checkbox", { name: "Watchlist sync" })
      expect(toggle).toHaveAttribute("data-testid", "watchlist-sync-global-toggle")
      expect(toggle).toHaveAttribute("aria-checked", "true")
      expect(toggle).toHaveAccessibleDescription(/members cannot turn on sync/)
      expect(screen.queryByRole("switch")).not.toBeInTheDocument()
      expect(within(form).getByTestId("watchlist-sync-interval-input")).toHaveValue(60)
      expect(screen.queryByTestId("settings-watchlist-summary")).not.toBeInTheDocument()
      await waitFor(() => expect(toggle).toHaveFocus())
    })

    it("shows the interval only while the draft is on", async () => {
      const user = userEvent.setup()
      await renderSection(OFF)

      await edit(user)
      expect(screen.queryByTestId("watchlist-sync-interval-input")).not.toBeInTheDocument()

      await user.click(screen.getByTestId("watchlist-sync-global-toggle"))
      expect(screen.getByTestId("watchlist-sync-interval-input")).toHaveValue(60)
    })

    it("closes on a Save with nothing changed, without calling the server", async () => {
      const user = userEvent.setup()
      await renderSection()

      await edit(user)
      await user.click(screen.getByTestId("settings-watchlist-save"))

      expect(updateGlobalWatchlistSyncSettings).not.toHaveBeenCalled()
      expect(screen.getByTestId("settings-watchlist-summary")).toBeInTheDocument()
    })

    it("saves a new interval through the footer and returns to the summary", async () => {
      const user = userEvent.setup()
      jest.mocked(updateGlobalWatchlistSyncSettings).mockResolvedValue({ success: true, data: null })
      await renderSection()

      await edit(user)
      await user.clear(screen.getByTestId("watchlist-sync-interval-input"))
      await user.type(screen.getByTestId("watchlist-sync-interval-input"), "30")
      expect(screen.getByTestId("settings-watchlist-unsaved")).toBeInTheDocument()
      await user.click(screen.getByTestId("settings-watchlist-save"))

      expect(updateGlobalWatchlistSyncSettings).toHaveBeenCalledWith({ watchlistSyncEnabled: true, watchlistSyncIntervalMinutes: 30 })
      expect(mockShowSuccess).toHaveBeenCalledWith("Watchlist sync saved")
      expect(await screen.findByTestId("settings-watchlist-summary")).toBeInTheDocument()
      await waitFor(() => expect(screen.getByTestId("settings-watchlist-edit")).toHaveFocus())
    })

    it("stops a save on an interval out of range, staying open on the field", async () => {
      const user = userEvent.setup()
      await renderSection()

      await edit(user)
      const interval = screen.getByTestId("watchlist-sync-interval-input")
      await user.clear(interval)
      await user.type(interval, "5")
      expect(interval).toHaveAccessibleDescription(/Enter a whole number of minutes from 15 to 1440/)
      await user.click(screen.getByTestId("settings-watchlist-save"))

      expect(updateGlobalWatchlistSyncSettings).not.toHaveBeenCalled()
      expect(screen.getByTestId("settings-watchlist-editing")).toBeInTheDocument()
      expect(interval).toHaveValue(5)
      await waitFor(() => expect(interval).toHaveAttribute("aria-invalid", "true"))
    })

    it("turning sync off saves the saved interval in place of a bad one the hidden field holds", async () => {
      const user = userEvent.setup()
      jest.mocked(updateGlobalWatchlistSyncSettings).mockResolvedValue({ success: true, data: null })
      await renderSection()

      await edit(user)
      await user.clear(screen.getByTestId("watchlist-sync-interval-input"))
      await user.type(screen.getByTestId("watchlist-sync-interval-input"), "5")
      await user.click(screen.getByTestId("watchlist-sync-global-toggle"))
      await user.click(screen.getByTestId("settings-watchlist-save"))

      expect(updateGlobalWatchlistSyncSettings).toHaveBeenCalledWith({ watchlistSyncEnabled: false, watchlistSyncIntervalMinutes: 60 })
      expect(await screen.findByTestId("settings-watchlist-summary")).toBeInTheDocument()
    })

    it("stays open on a refused interval, and Cancel clears the error", async () => {
      const user = userEvent.setup()
      jest.mocked(updateGlobalWatchlistSyncSettings).mockResolvedValue({
        success: false,
        code: "VALIDATION",
        error: "Check the highlighted fields",
        fieldErrors: { watchlistSyncIntervalMinutes: ["Pick a shorter interval"] },
      })
      await renderSection()

      await edit(user)
      await user.clear(screen.getByTestId("watchlist-sync-interval-input"))
      await user.type(screen.getByTestId("watchlist-sync-interval-input"), "1440")
      await user.click(screen.getByTestId("settings-watchlist-save"))

      expect(await screen.findByText("Pick a shorter interval")).toBeInTheDocument()
      expect(screen.getByTestId("settings-watchlist-editing")).toBeInTheDocument()
      expect(mockShowError).not.toHaveBeenCalled()

      // The error shows inside the save's transition; Cancel waits for it to settle
      const cancel = screen.getByTestId("settings-watchlist-cancel")
      await waitFor(() => expect(cancel).toBeEnabled())
      await user.click(cancel)
      await user.click(await screen.findByTestId("settings-watchlist-discard-dialog-confirm"))
      expect(await screen.findByTestId("settings-watchlist-summary")).toBeInTheDocument()

      await edit(user)
      expect(screen.getByTestId("watchlist-sync-interval-input")).toHaveValue(60)
      expect(screen.queryByText("Pick a shorter interval")).not.toBeInTheDocument()
    })

    it("toasts a refusal no field explains, such as no Overseerr, and stays open", async () => {
      const user = userEvent.setup()
      jest.mocked(updateGlobalWatchlistSyncSettings).mockResolvedValue({
        success: false,
        code: "VALIDATION",
        error: "Cannot enable watchlist sync without an active Overseerr server",
      })
      await renderSection(OFF)

      await edit(user)
      await user.click(screen.getByTestId("watchlist-sync-global-toggle"))
      await user.click(screen.getByTestId("settings-watchlist-save"))

      await waitFor(() => expect(mockShowError).toHaveBeenCalledWith("Cannot enable watchlist sync without an active Overseerr server"))
      expect(screen.getByTestId("settings-watchlist-form")).toBeInTheDocument()
      expect(screen.getByTestId("watchlist-sync-global-toggle")).toHaveAttribute("aria-checked", "true")
    })

    it("closes when the save was written but the job queue did not answer, saying so", async () => {
      const user = userEvent.setup()
      const queueDown = "Settings saved, but the job queue did not answer, so the sync schedule was not updated. The worker updates it the next time it starts."
      jest.mocked(updateGlobalWatchlistSyncSettings).mockResolvedValue({ success: false, code: "UPSTREAM_UNAVAILABLE", error: queueDown })
      await renderSection()

      await edit(user)
      await user.clear(screen.getByTestId("watchlist-sync-interval-input"))
      await user.type(screen.getByTestId("watchlist-sync-interval-input"), "90")
      await user.click(screen.getByTestId("settings-watchlist-save"))

      await waitFor(() => expect(mockShowError).toHaveBeenCalledWith(queueDown))
      expect(mockShowSuccess).not.toHaveBeenCalled()
      expect(await screen.findByTestId("settings-watchlist-summary")).toBeInTheDocument()
    })
  })

  describe("unsaved changes", () => {
    /** Whether the browser would ask before the tab closes. */
    const leaveIsGuarded = () => !window.dispatchEvent(new Event("beforeunload", { cancelable: true }))

    it("asks before the tab closes only while the draft differs from the saved values", async () => {
      const user = userEvent.setup()
      await renderSection()

      await edit(user)
      expect(leaveIsGuarded()).toBe(false)

      await user.click(screen.getByTestId("watchlist-sync-global-toggle"))
      expect(leaveIsGuarded()).toBe(true)

      await user.click(screen.getByTestId("watchlist-sync-global-toggle"))
      expect(leaveIsGuarded()).toBe(false)
    })
  })
})
