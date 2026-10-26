/**
 * The Discord channel stats section: a channel and a name format per stat, a
 * live preview of the name, and a save that sends the interval as a number.
 */

import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { runChannelStatsNow, updateChannelStatsSettings } from "@/actions/admin/discord-stats"
import { ChannelStatsSection } from "@/components/admin/settings/sections/channel-stats-section"
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

beforeEach(() => jest.clearAllMocks())

describe("ChannelStatsSection", () => {
  it("previews each name with the server name", () => {
    render(<ChannelStatsSection saved={saved} />)

    expect(screen.getByText("Shows as MFlix Status (🟢)")).toBeInTheDocument()
    expect(screen.getByText("Shows as Bandwidth: 12.5 Mbps")).toBeInTheDocument()
  })

  it("updates the preview as the format changes", async () => {
    const user = userEvent.setup()
    render(<ChannelStatsSection saved={saved} />)

    const format = screen.getByTestId("channel-stats-movies-format")
    await user.clear(format)
    await user.type(format, "Films: {{value}")

    expect(screen.getByText("Shows as Films: 1,204")).toBeInTheDocument()
  })

  it("saves the switch, the interval and the channels", async () => {
    const user = userEvent.setup()
    jest.mocked(updateChannelStatsSettings).mockResolvedValue({ success: true, data: null })
    render(<ChannelStatsSection saved={saved} />)

    await user.click(screen.getByTestId("channel-stats-toggle"))
    await user.type(screen.getByTestId("channel-stats-streams-channel"), "123456789012345678")
    const interval = screen.getByTestId("channel-stats-interval")
    await user.clear(interval)
    await user.type(interval, "15")
    await user.click(screen.getByTestId("settings-channel-stats-save"))

    expect(updateChannelStatsSettings).toHaveBeenCalledWith({
      enabled: true,
      intervalMinutes: 15,
      channels: { ...saved.channels, streams: { channelId: "123456789012345678", format: DEFAULT_FORMATS.streams } },
    })
    expect(mockShowSuccess).toHaveBeenCalledWith("Channel stats saved")
  })

  it("shows a field error from the server on its field", async () => {
    const user = userEvent.setup()
    jest.mocked(updateChannelStatsSettings).mockResolvedValue({
      success: false,
      code: "VALIDATION",
      error: "Invalid input",
      fieldErrors: { intervalMinutes: ["Too small"] },
    })
    render(<ChannelStatsSection saved={saved} />)

    await user.type(screen.getByTestId("channel-stats-streams-channel"), "1")
    await user.click(screen.getByTestId("settings-channel-stats-save"))

    expect(await screen.findByTestId("intervalMinutes-error")).toHaveTextContent("Too small")
    expect(mockShowError).not.toHaveBeenCalled()
  })

  it("shows a channel or format error from the server", async () => {
    const user = userEvent.setup()
    jest.mocked(updateChannelStatsSettings).mockResolvedValue({
      success: false,
      code: "VALIDATION",
      error: "Invalid input",
      fieldErrors: { channels: ["A Discord channel ID has 17 to 20 digits"] },
    })
    render(<ChannelStatsSection saved={saved} />)

    await user.type(screen.getByTestId("channel-stats-streams-channel"), "12")
    await user.click(screen.getByTestId("settings-channel-stats-save"))

    expect(await screen.findByTestId("channel-stats-channels-error")).toHaveTextContent("A Discord channel ID has 17 to 20 digits")
  })

  it("updates now", async () => {
    const user = userEvent.setup()
    jest.mocked(runChannelStatsNow).mockResolvedValue({ success: true, data: { queued: false } })
    render(<ChannelStatsSection saved={saved} />)

    await user.click(screen.getByTestId("channel-stats-run"))

    expect(runChannelStatsNow).toHaveBeenCalledTimes(1)
    expect(mockShowSuccess).toHaveBeenCalledWith("Channels updated")
  })
})
