/**
 * The Media cleanup page (UX 4.0, TS 12.2, 12.3 item 4a): its own admin
 * check before any read, one clock per request, `?tab=` with the Rules
 * fallback, the loader of the active tab beside the Rules data that the
 * header and the alerts need on every tab, the Leaving soon count, and the
 * first-use state with no header action and the off alert in the tab.
 */

import { render, screen } from "@testing-library/react"
import { mockReset } from "jest-mock-extended"
import { connection } from "next/server"

import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import CleanupPage from "@/app/admin/(automations)/cleanup/page"
import { assertAdmin } from "@/lib/admin"
import type { RuleCardData } from "@/lib/cleanup/types/rule-parts"
import type { CleanupOverviewData } from "@/lib/cleanup/types/screens"
import { getCleanupHistory } from "@/lib/data/cleanup-history"
import { getCleanupLeavingSoon } from "@/lib/data/cleanup-leaving"
import { getCleanupOverview } from "@/lib/data/cleanup-overview"
import { getCleanupProtections } from "@/lib/data/cleanup-protections"
import { getCleanupSettings } from "@/lib/data/cleanup-settings"

jest.mock("next/server", () => ({ ...jest.requireActual("next/server"), connection: jest.fn().mockResolvedValue(undefined) }))
jest.mock("next/navigation", () => ({ useRouter: () => ({ replace: jest.fn(), push: jest.fn(), refresh: jest.fn() }) }))
jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("@/lib/admin", () => ({ assertAdmin: jest.fn() }))
jest.mock("@/lib/data/cleanup-overview", () => ({ getCleanupOverview: jest.fn() }))
jest.mock("@/lib/data/cleanup-leaving", () => ({ getCleanupLeavingSoon: jest.fn() }))
jest.mock("@/lib/data/cleanup-protections", () => ({ getCleanupProtections: jest.fn() }))
jest.mock("@/lib/data/cleanup-history", () => ({ getCleanupHistory: jest.fn() }))
jest.mock("@/lib/data/cleanup-settings", () => ({ getCleanupSettings: jest.fn() }))
jest.mock("@/actions/admin/cleanup-settings", () => ({ pauseCleanup: jest.fn(), resumeCleanup: jest.fn(), refreshCleanupData: jest.fn() }))
jest.mock("@/components/ui/toast", () => ({ useToast: () => ({ showSuccess: jest.fn(), showError: jest.fn() }) }))
jest.mock("@/components/admin/cleanup/new-rule/new-rule-sheet", () => ({ NewRuleSheet: ({ trigger }: { trigger: React.ReactElement }) => trigger }))
// Each tab root has its own tests: here each shows which data it got
function mockTabRoot(name: string) {
  return function TabRoot({ data }: { data: { marker: string } }) {
    return <div data-testid={`tab-root-${name}`}>{data.marker}</div>
  }
}
jest.mock("@/components/admin/cleanup/rules/rules-tab", () => ({ RulesTab: ({ data }: { data: CleanupOverviewData }) => <div data-testid="tab-root-rules">{data.rules.length} rules</div> }))
jest.mock("@/components/admin/cleanup/leaving/leaving-tab", () => ({ LeavingTab: mockTabRoot("leaving") }))
jest.mock("@/components/admin/cleanup/kept/kept-tab", () => ({ KeptTab: mockTabRoot("kept") }))
jest.mock("@/components/admin/cleanup/history/history-tab", () => ({ HistoryTab: mockTabRoot("history") }))
jest.mock("@/components/admin/cleanup/settings/settings-tab", () => ({ SettingsTab: mockTabRoot("settings") }))

const ON = { enabled: true, enabledAt: "2026-10-09T10:00:00.000Z", pausedAt: null, pausedBy: null, redis: true }

function overview(overrides: Partial<CleanupOverviewData> = {}): CleanupOverviewData {
  return {
    feature: ON,
    sources: [],
    snapshot: { id: "snap-1", takenAt: "2026-11-08T03:07:00.000Z", finishedAt: "2026-11-08T03:09:00.000Z", reading: false },
    blocks: [],
    library: { movies: { count: 0, bytes: "0", libraries: [], outOfScope: [] }, shows: { count: 0, bytes: "0", seasons: 0, libraries: [], outOfScope: [] }, freeBytes: null, totalBytes: null, growthBytesPerMonth: null },
    stats: { leaving: { count: 0, bytes: "0", nextLeaveAt: null }, waiting: null, freed30d: { count: 0, bytes: "0", level: null } },
    batches: [],
    rules: [{ id: "rule-1" } as RuleCardData],
    recipes: [],
    defaults: { graceDays: 30 },
    ...overrides,
  }
}

async function renderPage(params: Record<string, string | string[] | undefined> = {}) {
  render(await CleanupPage({ searchParams: Promise.resolve(params) }))
}

beforeEach(() => {
  jest.clearAllMocks()
  mockReset(prismaMock)
  jest.mocked(assertAdmin).mockResolvedValue({ user: { id: "admin-1", isAdmin: true }, expires: "" } as never)
  jest.mocked(getCleanupOverview).mockResolvedValue(overview())
  jest.mocked(getCleanupLeavingSoon).mockResolvedValue({ marker: "leaving data" } as never)
  jest.mocked(getCleanupProtections).mockResolvedValue({ marker: "kept data" } as never)
  jest.mocked(getCleanupHistory).mockResolvedValue({ marker: "history data" } as never)
  jest.mocked(getCleanupSettings).mockResolvedValue({ marker: "settings data" } as never)
  prismaMock.cleanupItem.count.mockResolvedValue(52)
})

describe("Media cleanup page", () => {
  it("checks for an admin before reading anything", async () => {
    jest.mocked(assertAdmin).mockRejectedValue(Object.assign(new Error("Admin access required"), { digest: "PM_FORBIDDEN" }))

    await expect(CleanupPage({ searchParams: Promise.resolve({}) })).rejects.toMatchObject({ digest: "PM_FORBIDDEN" })
    expect(getCleanupOverview).not.toHaveBeenCalled()
    expect(prismaMock.cleanupItem.count).not.toHaveBeenCalled()
  })

  it("renders per request with one clock, the header, the tabs and the Rules tab by default", async () => {
    const before = Date.now()
    await renderPage()

    expect(connection).toHaveBeenCalled()
    const now = jest.mocked(getCleanupOverview).mock.calls[0][0] as Date
    expect(now.getTime()).toBeGreaterThanOrEqual(before)
    expect(screen.getByTestId("admin-cleanup-page")).toHaveClass("mx-auto", "flex", "w-full", "max-w-7xl", "flex-col", "gap-6", "px-4", "py-6", "md:px-6")
    expect(screen.getByRole("heading", { level: 1, name: "Media cleanup" })).toBeInTheDocument()
    expect(screen.getByTestId("admin-cleanup-header")).toHaveTextContent(
      "Find media that nobody watches. Matches wait in Leaving soon, where members can keep them. Then Radarr or Sonarr deletes them."
    )
    expect(screen.getByTestId("admin-cleanup-pause")).toBeInTheDocument()
    expect(screen.getByTestId("admin-cleanup-new-rule")).toBeInTheDocument()
    expect(screen.getByTestId("admin-cleanup-tab-rules")).toHaveAttribute("aria-selected", "true")
    expect(screen.getByTestId("tab-root-rules")).toHaveTextContent("1 rules")
    expect(getCleanupLeavingSoon).not.toHaveBeenCalled()
  })

  it("counts the titles in Leaving soon for the tab badge", async () => {
    await renderPage()

    expect(prismaMock.cleanupItem.count).toHaveBeenCalledWith({ where: { state: { in: ["leaving", "approved", "deleting"] } } })
    expect(screen.getByTestId("admin-cleanup-tab-leaving-soon-count")).toHaveTextContent("52")
  })

  it.each([
    ["leaving-soon", "leaving", getCleanupLeavingSoon],
    ["kept", "kept", getCleanupProtections],
    ["history", "history", getCleanupHistory],
  ] as const)("renders only the %s tab with its loader, the params and the page clock", async (tab, root, loader) => {
    const params = { tab, q: "dune", page: "2" }
    await renderPage(params)

    const now = jest.mocked(getCleanupOverview).mock.calls[0][0]
    expect(loader).toHaveBeenCalledWith(params, now)
    expect(screen.getByTestId(`tab-root-${root}`)).toHaveTextContent(`${root} data`)
    expect(screen.getByTestId(`admin-cleanup-tab-${tab}`)).toHaveAttribute("aria-selected", "true")
    expect(screen.queryByTestId("tab-root-rules")).not.toBeInTheDocument()
  })

  it("renders the Settings tab with its loader and the page clock", async () => {
    await renderPage({ tab: "settings", section: "cleanup-feature" })

    expect(getCleanupSettings).toHaveBeenCalledWith(jest.mocked(getCleanupOverview).mock.calls[0][0])
    expect(screen.getByTestId("tab-root-settings")).toHaveTextContent("settings data")
  })

  it.each([["nope"], [["kept", "history"]], [""]])("falls back to Rules for the tab %p", async (tab) => {
    await renderPage({ tab })

    expect(screen.getByTestId("tab-root-rules")).toBeInTheDocument()
    expect(screen.getByTestId("admin-cleanup-tab-rules")).toHaveAttribute("aria-selected", "true")
  })

  it("shows the page alerts above the tabs, with Resume in the header while paused", async () => {
    jest.mocked(getCleanupOverview).mockResolvedValue(overview({
      feature: { ...ON, redis: false, pausedAt: "2026-11-08T09:12:00.000Z", pausedBy: { id: "admin-1", name: "Dana", isYou: true } },
    }))
    await renderPage({ tab: "history" })

    expect(screen.getByTestId("admin-cleanup-alert-paused")).toBeInTheDocument()
    expect(screen.getByTestId("admin-cleanup-alert-redis")).toBeInTheDocument()
    expect(screen.getByTestId("admin-cleanup-resume")).toBeInTheDocument()
    expect(screen.queryByTestId("admin-cleanup-pause")).not.toBeInTheDocument()
  })

  it("shows no header action on first use, and leaves the off alert to the Rules tab", async () => {
    jest.mocked(getCleanupOverview).mockResolvedValue(overview({ rules: [], feature: { ...ON, enabled: false } }))
    await renderPage()

    expect(screen.queryByTestId("admin-cleanup-new-rule")).not.toBeInTheDocument()
    expect(screen.queryByTestId("admin-cleanup-pause")).not.toBeInTheDocument()
    expect(screen.getByTestId("admin-cleanup-header").querySelector('[data-slot="page-header-actions"]')).toBeNull()
    expect(screen.queryByTestId("admin-cleanup-alert-off")).not.toBeInTheDocument()
  })

  it("shows the off alert above another tab on first use", async () => {
    jest.mocked(getCleanupOverview).mockResolvedValue(overview({ rules: [], feature: { ...ON, enabled: false } }))
    await renderPage({ tab: "settings" })

    expect(screen.getByTestId("admin-cleanup-alert-off")).toBeInTheDocument()
  })
})
