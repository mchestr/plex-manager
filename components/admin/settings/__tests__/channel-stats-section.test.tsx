/**
 * The Discord channel stats section: a summary of the saved flag, interval
 * and channels with "Update now" until Edit swaps in the form, where each
 * stat has a channel and a name format with a live preview, the flag is a
 * Checkbox and the save sends the interval as a number.
 */

import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { runChannelStatsNow, updateChannelStatsSettings } from "@/actions/admin/discord-stats"
import { ChannelStatsSection } from "@/components/admin/settings/sections/channel-stats-section"
import { SettingsEditProvider } from "@/components/ui/settings-edit-context"
import type { ChannelStatsSettingsData } from "@/lib/data/community-stats"
import { DEFAULT_FORMATS } from "@/lib/discord/channel-stats/format"
import { STAT_KEYS } from "@/lib/discord/channel-stats/stats"

jest.mock("@/actions/admin/discord-stats", () => ({ updateChannelStatsSettings: jest.fn(), runChannelStatsNow: jest.fn() }))

const mockShowSuccess = jest.fn()
const mockShowError = jest.fn()
jest.mock("@/components/ui/toast", () => ({ useToast: () => ({ showSuccess: mockShowSuccess, showError: mockShowError }) }))

const saved: ChannelStatsSettingsData = {
  enabled: false,
  intervalMinutes: 10,
  serverName: "MFlix",
  channels: Object.fromEntries(STAT_KEYS.map((key) => [key, { channelId: "", format: DEFAULT_FORMATS[key] }])) as ChannelStatsSettingsData["channels"],
}

const STATUS_ID = "112233445566778899"
const STREAMS_ID = "223344556677889900"

/** Inside the page's edit provider, so the section and its "Update now" share one mode. */
function renderSection(patch: Partial<ChannelStatsSettingsData> = {}) {
  return render(
    <SettingsEditProvider onDirtyChange={jest.fn()}>
      <ChannelStatsSection saved={{ ...saved, ...patch }} />
    </SettingsEditProvider>
  )
}

const summaryRow = (key: string) => screen.getByTestId(`settings-channel-stats-summary-${key}`)

async function edit(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByTestId("settings-channel-stats-edit"))
}

/** The save's transition has settled: Cancel and the fields take input again. */
const settled = () => waitFor(() => expect(screen.getByTestId("settings-channel-stats-cancel")).toBeEnabled())

/** "Update now" has finished, so it takes another click. */
const idle = () => waitFor(() => expect(screen.getByTestId("channel-stats-run")).not.toHaveAttribute("aria-busy"))

beforeEach(() => jest.clearAllMocks())

describe("ChannelStatsSection", () => {
  describe("view mode", () => {
    it("summarises the saved settings, with no fields", () => {
      renderSection()

      expect(screen.getByTestId("settings-channel-stats-summary")).toBeInTheDocument()
      expect(summaryRow("enabled")).toHaveTextContent("Off")
      expect(summaryRow("interval")).toHaveTextContent("Every 10 minutes")
      expect(summaryRow("channels")).toHaveTextContent("None set")
      expect(screen.getByRole("button", { name: "Edit Discord channel stats" })).toBeInTheDocument()
      expect(screen.queryByTestId("settings-channel-stats-form")).not.toBeInTheDocument()
      expect(screen.queryByTestId("channel-stats-toggle")).not.toBeInTheDocument()
      expect(screen.queryByTestId("channel-stats-interval")).not.toBeInTheDocument()
      expect(screen.queryByRole("checkbox")).not.toBeInTheDocument()
    })

    it("lists each stat that has a channel, with its ID and the name it gets", () => {
      renderSection({
        enabled: true,
        intervalMinutes: 30,
        channels: { ...saved.channels, status: { channelId: STATUS_ID, format: DEFAULT_FORMATS.status }, streams: { channelId: STREAMS_ID, format: "Watching: {value}" } },
      })

      expect(summaryRow("enabled")).toHaveTextContent("On")
      expect(summaryRow("interval")).toHaveTextContent("Every 30 minutes")
      expect(summaryRow("channels")).toHaveTextContent("2 of 7 set")
      const status = summaryRow("channel-status")
      expect(status).toHaveTextContent("Status")
      expect(within(status).getByText(STATUS_ID)).toHaveClass("font-mono")
      expect(status).toHaveTextContent("Shows as MFlix Status (🟢)")
      const streams = summaryRow("channel-streams")
      expect(within(streams).getByText("Current streams")).toBeInTheDocument()
      expect(within(streams).getByText(STREAMS_ID)).toBeInTheDocument()
      expect(within(streams).getByText("Shows as Watching: 3")).toBeInTheDocument()
      expect(screen.queryByTestId("settings-channel-stats-summary-channel-movies")).not.toBeInTheDocument()
    })

    it("updates now", async () => {
      const user = userEvent.setup()
      jest.mocked(runChannelStatsNow).mockResolvedValue({ success: true, data: { queued: false } })
      renderSection()

      await user.click(screen.getByTestId("channel-stats-run"))

      expect(runChannelStatsNow).toHaveBeenCalledTimes(1)
      await waitFor(() => expect(mockShowSuccess).toHaveBeenCalledWith("Channels updated"))
    })

    it("says when the update is queued, and shows a refusal", async () => {
      const user = userEvent.setup()
      jest
        .mocked(runChannelStatsNow)
        .mockResolvedValueOnce({ success: true, data: { queued: true } })
        .mockResolvedValueOnce({ success: false, code: "RATE_LIMITED", error: "Too many requests" })
      renderSection()

      await user.click(screen.getByTestId("channel-stats-run"))
      await waitFor(() => expect(mockShowSuccess).toHaveBeenCalledWith("Channel update queued"))
      await idle()

      await user.click(screen.getByTestId("channel-stats-run"))
      await waitFor(() => expect(mockShowError).toHaveBeenCalledWith("Too many requests"))
    })
  })

  describe("edit mode", () => {
    it("swaps the summary for the form, with the flag as a checkbox and no Update now", async () => {
      const user = userEvent.setup()
      renderSection()

      await edit(user)

      expect(screen.getByTestId("settings-channel-stats-form")).toBeInTheDocument()
      expect(screen.queryByTestId("settings-channel-stats-summary")).not.toBeInTheDocument()
      const toggle = screen.getByRole("checkbox", { name: "Update the channels" })
      expect(toggle).toHaveAttribute("data-testid", "channel-stats-toggle")
      expect(toggle).toHaveAttribute("aria-checked", "false")
      expect(toggle).toHaveAccessibleDescription("Channels without an ID are left alone.")
      await waitFor(() => expect(toggle).toHaveFocus())
      expect(screen.queryByRole("switch")).not.toBeInTheDocument()
      expect(screen.getByTestId("channel-stats-interval")).toHaveValue(10)
      expect(screen.queryByTestId("channel-stats-run")).not.toBeInTheDocument()
    })

    it("previews each name with the server name", async () => {
      const user = userEvent.setup()
      renderSection()

      await edit(user)

      expect(screen.getByText("Shows as MFlix Status (🟢)")).toBeInTheDocument()
      expect(screen.getByText("Shows as Bandwidth: 12.5 Mbps")).toBeInTheDocument()
    })

    it("updates the preview as the format changes", async () => {
      const user = userEvent.setup()
      renderSection()

      await edit(user)
      const format = screen.getByTestId("channel-stats-movies-format")
      await user.clear(format)
      await user.type(format, "Films: {{value}")

      expect(screen.getByText("Shows as Films: 1,204")).toBeInTheDocument()
    })

    it("saves the flag, the interval and the channels, then returns to the summary", async () => {
      const user = userEvent.setup()
      jest.mocked(updateChannelStatsSettings).mockResolvedValue({ success: true, data: null })
      renderSection()

      await edit(user)
      await user.click(screen.getByTestId("channel-stats-toggle"))
      // Pasted, as an ID is: one change rather than eighteen re-renders of the whole form
      await user.click(screen.getByTestId("channel-stats-streams-channel"))
      await user.paste("123456789012345678")
      const interval = screen.getByTestId("channel-stats-interval")
      await user.clear(interval)
      await user.type(interval, "15")
      await user.click(screen.getByTestId("settings-channel-stats-save"))

      expect(updateChannelStatsSettings).toHaveBeenCalledWith({
        enabled: true,
        intervalMinutes: 15,
        channels: { ...saved.channels, streams: { channelId: "123456789012345678", format: DEFAULT_FORMATS.streams } },
      })
      expect(await screen.findByTestId("settings-channel-stats-summary")).toBeInTheDocument()
      expect(mockShowSuccess).toHaveBeenCalledWith("Channel stats saved")
      await waitFor(() => expect(screen.getByTestId("settings-channel-stats-edit")).toHaveFocus())
      expect(screen.getByTestId("channel-stats-run")).toBeInTheDocument()
    })

    it("shows a field error from the server on its field and stays in edit mode", async () => {
      const user = userEvent.setup()
      jest.mocked(updateChannelStatsSettings).mockResolvedValue({
        success: false,
        code: "VALIDATION",
        error: "Invalid input",
        fieldErrors: { intervalMinutes: ["Too small"] },
      })
      renderSection()

      await edit(user)
      await user.type(screen.getByTestId("channel-stats-streams-channel"), "1")
      await user.click(screen.getByTestId("settings-channel-stats-save"))

      expect(await screen.findByTestId("intervalMinutes-error")).toHaveTextContent("Too small")
      expect(mockShowError).not.toHaveBeenCalled()
      expect(screen.getByTestId("settings-channel-stats-form")).toBeInTheDocument()
      await waitFor(() => expect(screen.getByTestId("channel-stats-interval")).toHaveAttribute("aria-invalid", "true"))
      await settled()

      // A new interval clears the error it had
      await user.type(screen.getByTestId("channel-stats-interval"), "0")
      expect(screen.queryByTestId("intervalMinutes-error")).not.toBeInTheDocument()
    })

    it("shows a channel or format error from the server", async () => {
      const user = userEvent.setup()
      jest.mocked(updateChannelStatsSettings).mockResolvedValue({
        success: false,
        code: "VALIDATION",
        error: "Invalid input",
        fieldErrors: { channels: ["A Discord channel ID has 17 to 20 digits"] },
      })
      renderSection()

      await edit(user)
      await user.type(screen.getByTestId("channel-stats-streams-channel"), "12")
      await user.click(screen.getByTestId("settings-channel-stats-save"))

      expect(await screen.findByTestId("channel-stats-channels-error")).toHaveTextContent("A Discord channel ID has 17 to 20 digits")
      expect(screen.getByTestId("settings-channel-stats-form")).toBeInTheDocument()
    })

    it("toasts a refusal without field errors and stays in edit mode", async () => {
      const user = userEvent.setup()
      const message = "Add a Discord bot token in the Discord settings before turning this on"
      jest.mocked(updateChannelStatsSettings).mockResolvedValue({ success: false, code: "VALIDATION", error: message })
      renderSection()

      await edit(user)
      await user.click(screen.getByTestId("channel-stats-toggle"))
      await user.click(screen.getByTestId("settings-channel-stats-save"))

      await waitFor(() => expect(mockShowError).toHaveBeenCalledWith(message))
      expect(screen.getByTestId("settings-channel-stats-form")).toBeInTheDocument()
      expect(screen.getByTestId("channel-stats-toggle")).toHaveAttribute("aria-checked", "true")
    })

    it("treats a save whose schedule did not move as saved, with the queue's message", async () => {
      const user = userEvent.setup()
      const message = "Settings saved, but the job queue did not answer, so the schedule was not updated. The worker updates it the next time it starts."
      jest.mocked(updateChannelStatsSettings).mockResolvedValue({ success: false, code: "UPSTREAM_UNAVAILABLE", error: message })
      renderSection()

      await edit(user)
      // Pasted, as an ID is: one change rather than eighteen re-renders of the whole form
      await user.click(screen.getByTestId("channel-stats-streams-channel"))
      await user.paste("123456789012345678")
      await user.click(screen.getByTestId("settings-channel-stats-save"))

      expect(await screen.findByTestId("settings-channel-stats-summary")).toBeInTheDocument()
      expect(mockShowError).toHaveBeenCalledWith(message)
      expect(mockShowSuccess).not.toHaveBeenCalled()
    })

    it("closes on Save with nothing changed, without calling the server", async () => {
      const user = userEvent.setup()
      renderSection()

      await edit(user)
      await user.click(screen.getByTestId("settings-channel-stats-save"))

      expect(await screen.findByTestId("settings-channel-stats-summary")).toBeInTheDocument()
      expect(updateChannelStatsSettings).not.toHaveBeenCalled()
    })

    it("clears the errors with the edits on Cancel", async () => {
      const user = userEvent.setup()
      jest.mocked(updateChannelStatsSettings).mockResolvedValue({
        success: false,
        code: "VALIDATION",
        error: "Invalid input",
        fieldErrors: { intervalMinutes: ["Too small"], channels: ["A Discord channel ID has 17 to 20 digits"] },
      })
      renderSection()

      await edit(user)
      await user.type(screen.getByTestId("channel-stats-streams-channel"), "12")
      await user.click(screen.getByTestId("settings-channel-stats-save"))
      expect(await screen.findByTestId("intervalMinutes-error")).toBeInTheDocument()
      await settled()

      await user.click(screen.getByTestId("settings-channel-stats-cancel"))
      await user.click(await screen.findByTestId("settings-channel-stats-discard-dialog-confirm"))
      expect(await screen.findByTestId("settings-channel-stats-summary")).toBeInTheDocument()

      await edit(user)
      expect(screen.getByTestId("channel-stats-streams-channel")).toHaveValue("")
      expect(screen.queryByTestId("intervalMinutes-error")).not.toBeInTheDocument()
      expect(screen.queryByTestId("channel-stats-channels-error")).not.toBeInTheDocument()
    })
  })
})
