/**
 * The Discord activity page's empty period: it tells the admin to check that
 * the support bot is online, and offers the Discord settings where it is
 * turned on. A period with commands has no such prompt.
 */

import { render, screen, within } from "@testing-library/react"

import { resetUrl } from "@/__tests__/helpers/url-router"
import DiscordDashboardPage from "@/app/admin/discord/page"
import { getAdminGate } from "@/lib/admin"
import { getDiscordOverview, type DiscordOverview } from "@/lib/admin/discord"
import { getDiscordDashboardData } from "@/lib/data/discord-activity"
import { dayWindow } from "@/lib/utils/day-window"

jest.mock("next/navigation", () => require("@/__tests__/helpers/url-router").navigationModule)
// The real Link prefetches on an IntersectionObserver timer, outside act().
jest.mock("next/link", () => {
  const MockLink = ({ href, ...props }: { href: string } & React.ComponentProps<"a">) => <a href={href} {...props} />
  return MockLink
})
// The charts load Recharts lazily, outside act(); this page test is about the empty state, not the charts.
jest.mock("@/components/ui/chart-card", () => ({ ChartCard: () => null }))
jest.mock("@/lib/admin", () => ({ getAdminGate: jest.fn() }))
jest.mock("@/lib/admin/discord", () => ({ getDiscordOverview: jest.fn() }))
jest.mock("@/lib/data/discord-activity", () => ({ getDiscordDashboardData: jest.fn() }))
jest.mock("@/lib/utils/server-zone", () => ({ serverZone: async () => "America/Chicago" }))
jest.mock("@/lib/settings/app-settings", () => ({
  getFormat: async () => (await import("@/lib/utils/format")).bindFormat({ timeZone: "America/Chicago", locale: "en-US" }),
}))

type Dashboard = Awaited<ReturnType<typeof getDiscordDashboardData>>

const OVERVIEW: DiscordOverview = {
  state: { isEnabled: true, hasClientCredentials: true, botEnabled: false, hasBotToken: false, lastRenewedAt: null },
  lastHourCommands: 0,
  lastCommandAt: null,
  linkedMembers: 2,
}

function dashboard(totalCommands: number): Dashboard {
  return {
    window: dayWindow({ from: "2026-10-01", to: "2026-10-17" }, "America/Chicago"),
    summary: { totalCommands, successRate: totalCommands ? 100 : 0, avgResponseTimeMs: null, uniqueUsers: totalCommands ? 1 : 0, commandsByType: [] },
    dailyActivity: [],
    commandStats: [],
    activeUsers: [],
    detailed: {
      helpStats: null,
      linkingMetrics: null,
      mediaMarkingBreakdown: null,
      contextMetrics: null,
      errorAnalysis: null,
      selectionStats: null,
    },
    recent: { logs: [], total: 0 },
    markedMedia: null,
  }
}

async function renderPage() {
  render(await DiscordDashboardPage({ searchParams: Promise.resolve({ from: "2026-10-01", to: "2026-10-17" }) }))
}

beforeEach(() => {
  jest.clearAllMocks()
  resetUrl("/admin/discord?from=2026-10-01&to=2026-10-17")
  jest.mocked(getAdminGate).mockResolvedValue({ ok: true, session: { user: { id: "admin-1", isAdmin: true }, expires: "" } } as never)
  jest.mocked(getDiscordOverview).mockResolvedValue(OVERVIEW)
})

describe("Discord activity page", () => {
  it("offers the Discord settings from an empty period, beside the advice to check the support bot", async () => {
    jest.mocked(getDiscordDashboardData).mockResolvedValue(dashboard(0))
    await renderPage()

    const empty = screen.getByTestId("discord-empty-period")
    expect(empty).toHaveTextContent("make sure that the support bot is online")
    const link = within(empty).getByTestId("admin-discord-open-settings")
    expect(link).toBeInstanceOf(HTMLAnchorElement)
    expect(link).toHaveAttribute("href", "/admin/discord/settings")
    expect(link).toHaveTextContent("Open Discord settings")
  })

  it("has no such prompt for a period with commands", async () => {
    jest.mocked(getDiscordDashboardData).mockResolvedValue(dashboard(5))
    await renderPage()

    expect(screen.queryByTestId("discord-empty-period")).not.toBeInTheDocument()
    expect(screen.queryByTestId("admin-discord-open-settings")).not.toBeInTheDocument()
  })
})
