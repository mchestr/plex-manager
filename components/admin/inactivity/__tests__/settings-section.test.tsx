/**
 * The inactivity sweep's settings card: the saved switch and days, the daily
 * run and its safety limit as a summary with the last run and Run now, until
 * Edit swaps in the form. Days out of range stop the save on their field,
 * and unsaved changes make the browser ask before the tab closes.
 */

import { act, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { runMemberActivityNow, updateInactivitySettings } from "@/actions/admin/inactivity"
import { InactivitySettingsSection } from "@/components/admin/inactivity/settings-section"
import type { InactivitySettingsValues } from "@/lib/inactivity/settings"

jest.mock("@/actions/admin/inactivity", () => ({ updateInactivitySettings: jest.fn(), runMemberActivityNow: jest.fn() }))

const mockShowSuccess = jest.fn()
const mockShowError = jest.fn()
jest.mock("@/components/ui/toast", () => ({ useToast: () => ({ showSuccess: mockShowSuccess, showError: mockShowError }) }))

const ON: InactivitySettingsValues = { enabled: true, thresholdDays: 180 }
const OFF: InactivitySettingsValues = { enabled: false, thresholdDays: 90 }

async function renderSection({
  saved = ON,
  scheduled = true,
  scheduledLimit = 3 as number | null,
  removals = 0,
}: { saved?: InactivitySettingsValues; scheduled?: boolean; scheduledLimit?: number | null; removals?: number } = {}) {
  await act(async () => {
    render(<InactivitySettingsSection saved={saved} scheduled={scheduled} scheduledLimit={scheduledLimit} removals={removals} lastRun={null} />)
  })
}

const summaryRow = (key: string) => screen.getByTestId(`settings-inactivity-summary-${key}`)
const days = () => screen.getByTestId("admin-inactivity-days-input")

async function edit(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByTestId("settings-inactivity-edit"))
}

async function typeDays(user: ReturnType<typeof userEvent.setup>, value: string) {
  await user.clear(days())
  if (value) await user.type(days(), value)
}

beforeEach(() => jest.clearAllMocks())

describe("InactivitySettingsSection", () => {
  describe("view mode", () => {
    it("summarises the switch, the days, the daily run and its safety limit, with Run now", async () => {
      await renderSection()

      expect(screen.getByRole("heading", { name: "Automatic removal" })).toBeInTheDocument()
      expect(screen.getByRole("button", { name: "Edit Automatic removal" })).toBeInTheDocument()
      expect(summaryRow("enabled")).toHaveTextContent(/^Automatic removalOn$/)
      expect(summaryRow("threshold")).toHaveTextContent(/^Remove after180 days without a play$/)
      expect(summaryRow("schedule")).toHaveTextContent(/^Daily runEvery day at about 02:17, server time$/)
      expect(summaryRow("limit")).toHaveTextContent(/^Safety limit3 members per scheduled run$/)
      expect(screen.getByTestId("admin-inactivity-run-now")).toBeInTheDocument()
      expect(screen.getByTestId("admin-inactivity-last-run")).toHaveTextContent("No run yet.")
      expect(screen.queryByRole("checkbox")).not.toBeInTheDocument()
      expect(screen.queryByTestId("admin-inactivity-days-input")).not.toBeInTheDocument()
    })

    it("says Off, when the run is not scheduled, and an unknown limit", async () => {
      await renderSection({ saved: OFF, scheduled: false, scheduledLimit: null })

      expect(summaryRow("enabled")).toHaveTextContent(/^Automatic removalOff$/)
      expect(summaryRow("threshold")).toHaveTextContent("90 days without a play")
      expect(summaryRow("schedule")).toHaveTextContent("Not scheduled, because Redis is not set up. Use Run now.")
      expect(summaryRow("limit")).toHaveTextContent("Unknown until the Plex shares can be read")
    })

    it("names a limit of one member in the singular", async () => {
      await renderSection({ scheduledLimit: 1 })

      expect(summaryRow("limit")).toHaveTextContent("1 member per scheduled run")
    })

    it("asks to confirm Run now while the saved switch is on and the preview lists members", async () => {
      const user = userEvent.setup()
      jest.mocked(runMemberActivityNow).mockResolvedValue({ success: true, data: { queued: false } })
      await renderSection({ removals: 4 })

      await user.click(screen.getByTestId("admin-inactivity-run-now"))

      expect(await screen.findByRole("heading", { name: "Remove Plex access from 4 members now?" })).toBeInTheDocument()
    })
  })

  describe("edit mode", () => {
    it("puts the switch in a Checkbox and focuses it, with the days, and hides Run now", async () => {
      const user = userEvent.setup()
      await renderSection()

      await edit(user)

      const form = screen.getByTestId("settings-inactivity-form")
      const toggle = within(form).getByRole("checkbox", { name: "Remove Plex access from inactive members" })
      expect(toggle).toHaveAttribute("data-testid", "admin-inactivity-enabled-toggle")
      expect(toggle).toHaveAttribute("aria-checked", "true")
      expect(toggle).toHaveAccessibleDescription(/removes no one/)
      await waitFor(() => expect(toggle).toHaveFocus())
      expect(days()).toHaveValue(180)
      expect(screen.queryByTestId("settings-inactivity-summary")).not.toBeInTheDocument()
      expect(screen.queryByTestId("admin-inactivity-run-now")).not.toBeInTheDocument()
    })

    it("closes on a Save with nothing changed, without calling the server", async () => {
      const user = userEvent.setup()
      await renderSection()

      await edit(user)
      await user.click(screen.getByTestId("settings-inactivity-save"))

      expect(updateInactivitySettings).not.toHaveBeenCalled()
      expect(screen.getByTestId("settings-inactivity-summary")).toBeInTheDocument()
    })

    it("saves the switch and the days as a number, then returns to the summary", async () => {
      const user = userEvent.setup()
      jest.mocked(updateInactivitySettings).mockResolvedValue({ success: true, data: null })
      await renderSection({ saved: OFF })

      await edit(user)
      await user.click(screen.getByTestId("admin-inactivity-enabled-toggle"))
      await typeDays(user, "365")
      expect(screen.getByTestId("settings-inactivity-unsaved")).toBeInTheDocument()
      await user.click(screen.getByTestId("settings-inactivity-save"))

      expect(updateInactivitySettings).toHaveBeenCalledWith({ enabled: true, thresholdDays: 365 })
      expect(mockShowSuccess).toHaveBeenCalledWith("Inactivity settings saved")
      expect(await screen.findByTestId("settings-inactivity-summary")).toBeInTheDocument()
      await waitFor(() => expect(screen.getByTestId("settings-inactivity-edit")).toHaveFocus())
    })

    it.each(["29", "3651", "45.5", ""])("stops a save on %j days, staying open on the field", async (value) => {
      const user = userEvent.setup()
      await renderSection()

      await edit(user)
      await typeDays(user, value)
      expect(days()).toHaveAccessibleDescription(/Enter a whole number of days from 30 to 3650/)
      await user.click(screen.getByTestId("settings-inactivity-save"))

      expect(updateInactivitySettings).not.toHaveBeenCalled()
      expect(screen.getByTestId("settings-inactivity-editing")).toBeInTheDocument()
      await waitFor(() => expect(days()).toHaveAttribute("aria-invalid", "true"))
    })

    describe("a refusal on the days", () => {
      /** Saves 3000 days, which the server refuses on the field, and waits for the save to settle. */
      async function refuse(user: ReturnType<typeof userEvent.setup>) {
        jest.mocked(updateInactivitySettings).mockResolvedValue({
          success: false,
          code: "VALIDATION",
          error: "Check the highlighted fields",
          fieldErrors: { thresholdDays: ["Pick fewer days"] },
        })
        await renderSection()
        await edit(user)
        await typeDays(user, "3000")
        await user.click(screen.getByTestId("settings-inactivity-save"))
        expect(await screen.findByText("Pick fewer days")).toBeInTheDocument()
        // The error shows inside the save's transition, while the fields are still disabled
        await waitFor(() => expect(days()).toBeEnabled())
      }

      it("shows on the field, not as a toast, until the days change", async () => {
        const user = userEvent.setup()
        await refuse(user)

        expect(mockShowError).not.toHaveBeenCalled()
        expect(screen.getByTestId("settings-inactivity-editing")).toBeInTheDocument()

        await typeDays(user, "3001")
        expect(screen.queryByText("Pick fewer days")).not.toBeInTheDocument()
      })

      it("goes with the edits on Cancel", async () => {
        const user = userEvent.setup()
        await refuse(user)

        await user.click(screen.getByTestId("settings-inactivity-cancel"))
        await user.click(await screen.findByTestId("settings-inactivity-discard-dialog-confirm"))
        expect(await screen.findByTestId("settings-inactivity-summary")).toBeInTheDocument()

        await edit(user)
        expect(days()).toHaveValue(180)
        expect(screen.queryByText("Pick fewer days")).not.toBeInTheDocument()
      })
    })

    it("toasts a refusal no field explains, and stays open", async () => {
      const user = userEvent.setup()
      jest.mocked(updateInactivitySettings).mockResolvedValue({ success: false, code: "INTERNAL", error: "Could not save the inactivity settings" })
      await renderSection()

      await edit(user)
      await user.click(screen.getByTestId("admin-inactivity-enabled-toggle"))
      await user.click(screen.getByTestId("settings-inactivity-save"))

      await waitFor(() => expect(mockShowError).toHaveBeenCalledWith("Could not save the inactivity settings"))
      expect(screen.getByTestId("settings-inactivity-form")).toBeInTheDocument()
      expect(screen.getByTestId("admin-inactivity-enabled-toggle")).toHaveAttribute("aria-checked", "false")
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

      await user.click(screen.getByTestId("admin-inactivity-enabled-toggle"))
      expect(leaveIsGuarded()).toBe(true)

      await user.click(screen.getByTestId("admin-inactivity-enabled-toggle"))
      expect(leaveIsGuarded()).toBe(false)
    })
  })
})
