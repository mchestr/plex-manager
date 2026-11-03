/**
 * The Discord settings page (the Settings tab of the Discord section): its own
 * admin check before any read, then the Discord integration and the channel
 * stats on the page that moved them, each with "Last saved" only after a first
 * save.
 */

import { render, screen, within } from "@testing-library/react"
import { connection } from "next/server"

import DiscordSettingsPage, { metadata } from "@/app/admin/discord/settings/page"
import { assertAdmin } from "@/lib/admin"
import { getDiscordOverview, type DiscordOverview } from "@/lib/admin/discord"
import { getAdminSettings } from "@/lib/data/admin-settings"
import { getChannelStatsSettings, type ChannelStatsSettingsData } from "@/lib/data/community-stats"
import { DEFAULT_FORMATS } from "@/lib/discord/channel-stats/format"
import { STAT_KEYS } from "@/lib/discord/channel-stats/stats"
import { getSettingsAuditMeta, type SettingsAuditMeta } from "@/lib/settings/audit-meta"

jest.mock("next/navigation", () => require("@/__tests__/helpers/url-router").navigationModule)
jest.mock("next/server", () => ({ connection: jest.fn() }))
jest.mock("@/lib/admin", () => ({ assertAdmin: jest.fn() }))
jest.mock("@/lib/admin/discord", () => ({ getDiscordOverview: jest.fn() }))
jest.mock("@/lib/data/admin-settings", () => ({ getAdminSettings: jest.fn() }))
jest.mock("@/lib/data/community-stats", () => ({ getChannelStatsSettings: jest.fn() }))
jest.mock("@/lib/settings/audit-meta", () => ({ getSettingsAuditMeta: jest.fn() }))
jest.mock("@/lib/env", () => ({ getBaseUrl: () => "https://plex.example.com" }))
jest.mock("@/actions/discord", () => ({ updateDiscordIntegrationSettings: jest.fn() }))
jest.mock("@/actions/admin/discord-stats", () => ({ updateChannelStatsSettings: jest.fn(), runChannelStatsNow: jest.fn() }))
jest.mock("@/components/ui/toast", () => ({ useToast: () => ({ showSuccess: jest.fn(), showError: jest.fn() }) }))

type AdminSettings = Awaited<ReturnType<typeof getAdminSettings>>

const DISCORD_SETTINGS: Pick<AdminSettings, "discordIntegration" | "discordLinkedCount"> = {
  discordIntegration: {
    id: "discord",
    isEnabled: true,
    botEnabled: true,
    clientId: "1234",
    supportChannelId: null,
    supportThreadIds: [],
    configVersion: 3,
    guildId: null,
    serverInviteCode: null,
    platformName: "Plex Wrapped",
    instructions: null,
    createdAt: new Date("2026-10-01T00:00:00Z"),
    updatedAt: new Date("2026-10-02T00:00:00Z"),
    updatedBy: null,
    secrets: { clientSecret: { last4: "Qx7d", origin: null }, botToken: { last4: "", origin: null } },
  },
  discordLinkedCount: 3,
}

const OVERVIEW: DiscordOverview = {
  // A bot that renewed its lease just now reads Online, so the page must hand over the clock as well as the state
  state: { isEnabled: true, hasClientCredentials: true, botEnabled: true, hasBotToken: true, lastRenewedAt: new Date() },
  lastHourCommands: 0,
  lastCommandAt: null,
  linkedMembers: 3,
}

const CHANNEL_STATS: ChannelStatsSettingsData = {
  enabled: false,
  intervalMinutes: 15,
  serverName: "MFlix",
  channels: Object.fromEntries(STAT_KEYS.map((key) => [key, { channelId: "", format: DEFAULT_FORMATS[key] }])) as ChannelStatsSettingsData["channels"],
}

const NEVER_SAVED: SettingsAuditMeta = {
  plex: null,
  tautulli: null,
  overseerr: null,
  ai: null,
  judge: null,
  discord: null,
  stripe: null,
  channelStats: null,
  requestTiers: null,
  rewind: null,
  other: null,
  timeZone: null,
}

async function renderPage() {
  render(await DiscordSettingsPage())
}

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(assertAdmin).mockResolvedValue({ user: { id: "admin-1", isAdmin: true }, expires: "" } as never)
  jest.mocked(getAdminSettings).mockResolvedValue(DISCORD_SETTINGS as AdminSettings)
  jest.mocked(getDiscordOverview).mockResolvedValue(OVERVIEW)
  jest.mocked(getChannelStatsSettings).mockResolvedValue(CHANNEL_STATS)
  jest.mocked(getSettingsAuditMeta).mockResolvedValue(NEVER_SAVED)
})

describe("Discord settings page", () => {
  it("is titled Discord settings", () => {
    expect(metadata).toEqual({ title: "Discord settings" })
  })

  it("checks for an admin before reading anything", async () => {
    jest.mocked(assertAdmin).mockRejectedValue(Object.assign(new Error("Admin access required"), { digest: "PM_FORBIDDEN" }))

    await expect(DiscordSettingsPage()).rejects.toMatchObject({ digest: "PM_FORBIDDEN" })
    expect(getAdminSettings).not.toHaveBeenCalled()
    expect(getDiscordOverview).not.toHaveBeenCalled()
    expect(getChannelStatsSettings).not.toHaveBeenCalled()
    expect(getSettingsAuditMeta).not.toHaveBeenCalled()
  })

  it("renders per request, since the bot's status reads the clock", async () => {
    await renderPage()

    expect(connection).toHaveBeenCalledTimes(1)
  })

  it("shows the header, then the Discord section and the channel stats, in the admin page's width and gutters", async () => {
    await renderPage()

    expect(screen.getByRole("heading", { level: 1, name: "Discord settings" })).toBeInTheDocument()
    expect(screen.getByTestId("admin-discord-settings-header")).toBeInTheDocument()
    expect(screen.getByTestId("admin-discord-settings-page")).toHaveClass("mx-auto", "w-full", "max-w-7xl", "px-4", "md:px-6")
    expect(screen.getByTestId("settings-discord-section")).toBeVisible()
    expect(screen.getByTestId("settings-channel-stats-section")).toBeVisible()
  })

  it("hands the Discord section its integration, the portal URL, the linked accounts and the bot's state", async () => {
    await renderPage()

    const section = screen.getByTestId("settings-discord-section")
    expect(screen.getByTestId("settings-discord-portal-url")).toHaveValue("https://plex.example.com/discord/link")
    expect(within(section).getByText("Linked accounts").nextElementSibling).toHaveTextContent("3")
    expect(screen.getByTestId("settings-discord-summary-platform-name")).toHaveTextContent("Plex Wrapped")
    expect(screen.getByTestId("settings-discord-linked-roles-status")).toHaveTextContent("On")
    expect(screen.getByTestId("settings-discord-support-bot-status")).toHaveTextContent("Online")
  })

  it("hands the channel stats their saved settings", async () => {
    await renderPage()

    expect(screen.getByTestId("settings-channel-stats-summary-enabled")).toHaveTextContent("Off")
    expect(screen.getByTestId("settings-channel-stats-summary-interval")).toHaveTextContent("Every 15 minutes")
  })

  it("says who saved each section last, and leaves the footers out before a first save", async () => {
    await renderPage()
    expect(screen.queryByTestId("settings-discord-last-saved")).not.toBeInTheDocument()
    expect(screen.queryByTestId("settings-channelStats-last-saved")).not.toBeInTheDocument()
  })

  it("puts each section's own save under it", async () => {
    jest.mocked(getSettingsAuditMeta).mockResolvedValue({
      ...NEVER_SAVED,
      discord: { at: new Date(), by: "Dana Whitfield" },
      channelStats: { at: new Date(), by: "Sam Rivera" },
    })
    await renderPage()

    expect(screen.getByTestId("settings-discord-last-saved")).toHaveTextContent("by Dana Whitfield")
    expect(screen.getByTestId("settings-channelStats-last-saved")).toHaveTextContent("by Sam Rivera")
  })
})
