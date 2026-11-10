/**
 * The Media cleanup section (UX 4.10, 8.8): the status badge, the rows and
 * the last run, Edit with the one checkbox, Save without a dialog, Cancel,
 * the changed-from line, and "Back to Turn on {rule}" after a save with a
 * valid `returnTo` (TS 12.7 item 10), a hyphenated rule id too.
 */

import { act, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { previewCleanupProtectionImpact } from "@/actions/admin/cleanup-preview"
import { updateCleanupSettings } from "@/actions/admin/cleanup-settings"
import { buildProtections, buildSettingsData, NOW } from "@/components/admin/cleanup/settings/__tests__/fixtures"
import { FeatureSection } from "@/components/admin/cleanup/settings/feature-section"
import { lastRunOutcome } from "@/components/admin/cleanup/settings/feature-summary"
import { parseReturnTo } from "@/components/admin/cleanup/settings/settings-tab"
import type { CleanupSettingsData } from "@/lib/cleanup/types/screens"

jest.mock("@/actions/admin/cleanup-settings", () => ({ updateCleanupSettings: jest.fn(), refreshCleanupData: jest.fn(), runCleanupNow: jest.fn() }))
jest.mock("@/actions/admin/cleanup-preview", () => ({ previewCleanupProtectionImpact: jest.fn() }))
jest.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }))
const mockShowSuccess = jest.fn()
const mockShowError = jest.fn()
jest.mock("@/components/ui/toast", () => ({ useToast: () => ({ showSuccess: mockShowSuccess, showError: mockShowError }) }))

const LIVE_RETURN = "/admin/cleanup/rules/a11y-cleanup-rule-live/turn-on"

async function renderSection(data: CleanupSettingsData = buildSettingsData(), returnTo: string | null = null) {
  await act(async () => {
    render(<FeatureSection data={data} returnTo={returnTo} now={NOW} />)
  })
}

const summary = (key: string) => screen.getByTestId(`settings-cleanup-feature-summary-${key}`)
const checkbox = () => screen.getByRole("checkbox", { name: "Turn on media cleanup" })

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(updateCleanupSettings).mockResolvedValue({ success: true, data: { exitsApplied: null } })
  jest.mocked(previewCleanupProtectionImpact).mockResolvedValue({
    success: true,
    data: { rules: [{ ruleId: "a11y-cleanup-rule-live", name: "Old movies to review", level: "movie", delta: 0 }], protects: {}, leaves: 0 },
  })
})

describe("FeatureSection read view", () => {
  it("shows On, the read time, each row and the last run with its two buttons", async () => {
    await renderSection()

    expect(screen.getByRole("heading", { name: "Media cleanup" })).toBeInTheDocument()
    expect(screen.getByTestId("settings-cleanup-feature-state")).toHaveTextContent("OnRead at 3:07 AM today")
    expect(summary("enabled")).toHaveTextContent("On since Oct 9, 2026")
    expect(summary("enabled")).not.toHaveTextContent("Nothing is deleted before")
    expect(summary("nightly")).toHaveTextContent("3:07 AM, server time (UTC)")
    expect(summary("library")).toHaveTextContent("Read at 3:07 AM today in 2 m 14 s. All 5 sources answered.")
    expect(summary("history")).toHaveTextContent('Jun 14, 2022. "Never played" means since then.')
    expect(screen.getByTestId("admin-cleanup-settings-last-run")).toHaveTextContent("Scheduled, 3:07 AM today. 3 rules, 3 joined, 1 rescued, 0 deleted.")
    expect(screen.getByTestId("admin-cleanup-settings-last-run-timestamp")).toHaveTextContent("3:07 AM today")
    expect(screen.getByTestId("admin-cleanup-settings-refresh-data")).toBeEnabled()
    expect(screen.getByTestId("admin-cleanup-settings-run-all")).toBeEnabled()
    expect(screen.queryByTestId("admin-cleanup-settings-return")).not.toBeInTheDocument()
  })

  it("says Paused with the date and the hold that has not ended", async () => {
    const data = buildSettingsData()
    await renderSection({ ...data, feature: { ...data.feature, pausedAt: "2026-11-01T09:12:00.000Z", holdUntil: "2026-11-12" } })

    expect(screen.getByTestId("settings-cleanup-feature-state")).toHaveTextContent("Paused")
    expect(summary("enabled")).toHaveTextContent("Paused since Nov 1, 2026. Nothing is deleted before Nov 12, 2026.")
  })

  it("says Off, and what is unknown or not scheduled without Redis and library data", async () => {
    const data = buildSettingsData()
    await renderSection({
      ...data,
      feature: { ...data.feature, enabled: false, enabledAt: null, redis: false },
      schedule: { nextRunAt: null, zone: "UTC" },
      libraryData: { startedAt: null, finishedAt: null, sources: [], historyStart: null, reading: false },
      lastRun: null,
    })

    expect(screen.getByTestId("settings-cleanup-feature-state")).toHaveTextContent(/^Off$/)
    expect(summary("enabled")).toHaveTextContent(/^Media cleanupOff$/)
    expect(summary("nightly")).toHaveTextContent("Not scheduled, because Redis is not set up.")
    expect(summary("library")).toHaveTextContent("No library data yet.")
    expect(summary("history")).toHaveTextContent("Unknown")
    expect(screen.getByTestId("admin-cleanup-settings-last-run")).toHaveTextContent("No run yet.")
    expect(screen.getByTestId("admin-cleanup-settings-refresh-data")).toHaveAttribute("aria-disabled", "true")
    expect(screen.getByTestId("admin-cleanup-settings-run-all")).toHaveAttribute("aria-disabled", "true")
  })

  it("names a run that an admin started, one rule, and an outcome that is not Finished", async () => {
    const data = buildSettingsData()
    await renderSection({ ...data, lastRun: { ...data.lastRun!, trigger: "admin", rules: 1, joined: 0, rescued: 0, outcome: "held" } })

    expect(screen.getByTestId("admin-cleanup-settings-last-run")).toHaveTextContent(
      "Started by an admin, 3:07 AM today. 1 rule, 0 joined, 0 rescued, 0 deleted. Held: new matches wait for your approval."
    )
  })

  it("names the sources that did not answer, a read in progress and On with no date", async () => {
    const data = buildSettingsData()
    const sources = data.libraryData.sources.map((s) => (s.service === "tautulli" ? { ...s, state: "failed" as const } : s))
    const { unmount } = render(
      <FeatureSection data={{ ...data, feature: { ...data.feature, enabledAt: null }, libraryData: { ...data.libraryData, sources, startedAt: null } }} returnTo={null} now={NOW} />
    )
    expect(summary("enabled")).toHaveTextContent(/^Media cleanupOn$/)
    expect(summary("library")).toHaveTextContent("Read at 3:07 AM today. 4 of 5 sources answered. Tautulli did not.")
    unmount()

    await renderSection({ ...data, libraryData: { ...data.libraryData, reading: true } })
    expect(summary("library")).toHaveTextContent("Reading the library. This takes 1 to 3 minutes.")
  })
})

describe("lastRunOutcome", () => {
  it.each([
    [{ outcome: null, blocks: [] }, "Not finished"],
    [{ outcome: "finished", blocks: [] }, "Finished"],
    [{ outcome: "dryRun", blocks: [] }, "Dry run"],
    [{ outcome: "held", blocks: [] }, "Held: new matches wait for your approval"],
    [{ outcome: "blocked", blocks: [{ code: "sourceFailed", service: "tautulli" as const }] }, "Safety stop: Tautulli did not answer"],
    [{ outcome: "blocked", blocks: [] }, "Safety stop"],
    [{ outcome: "paused", blocks: [] }, "Paused: nothing changed"],
    [{ outcome: "arrRefused", blocks: [{ code: "arrRefused", service: "radarr" as const }] }, "Stopped: Radarr refused the API key"],
    [{ outcome: "noData", blocks: [] }, "Safety stop: no library data yet"],
    [{ outcome: "newerCode", blocks: [] }, "newerCode"],
  ])("words %j as %s", (run, words) => {
    expect(lastRunOutcome(run)).toBe(words)
  })
})

describe("FeatureSection edit", () => {
  it("holds the checkbox with its hint, and saves Off with no dialog", async () => {
    const user = userEvent.setup()
    await renderSection()

    await user.click(screen.getByTestId("settings-cleanup-feature-edit"))
    const form = screen.getByTestId("settings-cleanup-feature-form")
    expect(within(form).getByTestId("cleanup-feature-enabled")).toBe(checkbox())
    expect(checkbox()).toHaveAttribute("aria-checked", "true")
    expect(checkbox()).toHaveAccessibleDescription("Rules in Review first or Automatic start to put titles in Leaving soon. Nothing is deleted for 7 days.")
    expect(screen.queryByTestId("admin-cleanup-settings-last-run")).not.toBeInTheDocument()

    await user.click(checkbox())
    expect(screen.getByText("Changed from on.")).toBeInTheDocument()
    await user.click(screen.getByTestId("settings-cleanup-feature-save"))

    expect(updateCleanupSettings).toHaveBeenCalledWith({ section: "cleanup-feature", values: { enabled: false } })
    expect(mockShowSuccess).toHaveBeenCalledWith("Settings saved")
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    await waitFor(() => expect(screen.queryByTestId("settings-cleanup-feature-form")).not.toBeInTheDocument())
  })

  it("keeps the form open with the refusal in a toast", async () => {
    const user = userEvent.setup()
    jest.mocked(updateCleanupSettings).mockResolvedValueOnce({ success: false, code: "CONFLICT", error: "A run is in progress. Try again in a few minutes." })
    await renderSection(buildSettingsData({ feature: { ...buildSettingsData().feature, enabled: false } }))

    await user.click(screen.getByTestId("settings-cleanup-feature-edit"))
    await user.click(checkbox())
    expect(screen.getByText("Changed from off.")).toBeInTheDocument()
    await user.click(screen.getByTestId("settings-cleanup-feature-save"))

    expect(updateCleanupSettings).toHaveBeenCalledWith({ section: "cleanup-feature", values: { enabled: true } })
    expect(mockShowError).toHaveBeenCalledWith("A run is in progress. Try again in a few minutes.")
    expect(screen.getByTestId("settings-cleanup-feature-form")).toBeInTheDocument()
  })

  it("asks before Cancel discards a change, and closes at once with none", async () => {
    const user = userEvent.setup()
    await renderSection()

    await user.click(screen.getByTestId("settings-cleanup-feature-edit"))
    await user.click(screen.getByTestId("settings-cleanup-feature-cancel"))
    await waitFor(() => expect(screen.queryByTestId("settings-cleanup-feature-form")).not.toBeInTheDocument())

    await user.click(screen.getByTestId("settings-cleanup-feature-edit"))
    await user.click(checkbox())
    await user.click(screen.getByTestId("settings-cleanup-feature-cancel"))
    expect(await screen.findByTestId("settings-cleanup-feature-discard-dialog")).toBeInTheDocument()
    expect(updateCleanupSettings).not.toHaveBeenCalled()
  })
})

describe("FeatureSection returnTo", () => {
  it("accepts a hyphenated rule id and drops any other path", () => {
    expect(parseReturnTo(LIVE_RETURN)).toBe(LIVE_RETURN)
    expect(parseReturnTo("/admin/cleanup/rules/a11y-cleanup-rule-live/turn-on?x=1")).toBeNull()
    expect(parseReturnTo("https://example.com/admin/cleanup/rules/r1/turn-on")).toBeNull()
    expect(parseReturnTo("/admin/settings")).toBeNull()
    expect(parseReturnTo(null)).toBeNull()
  })

  it("shows Back to Turn on {rule} after a save, with the rule's name and its turn-on link", async () => {
    const user = userEvent.setup()
    await renderSection(buildSettingsData({ feature: { ...buildSettingsData().feature, enabled: false } }), parseReturnTo(LIVE_RETURN))

    expect(previewCleanupProtectionImpact).not.toHaveBeenCalled()
    expect(screen.queryByTestId("admin-cleanup-settings-return")).not.toBeInTheDocument()
    await user.click(screen.getByTestId("settings-cleanup-feature-edit"))
    await user.click(checkbox())
    await user.click(screen.getByTestId("settings-cleanup-feature-save"))

    const back = await screen.findByTestId("admin-cleanup-settings-return")
    expect(back).toHaveTextContent("Back to Turn on Old movies to review")
    expect(back).toHaveAttribute("href", LIVE_RETURN)
  })

  it("names no rule when the rule is gone", async () => {
    const user = userEvent.setup()
    const data = buildSettingsData({ rules: [] })
    await renderSection({ ...data, protections: buildProtections(data.options) }, parseReturnTo(LIVE_RETURN))

    await user.click(screen.getByTestId("settings-cleanup-feature-edit"))
    await user.click(checkbox())
    await user.click(screen.getByTestId("settings-cleanup-feature-save"))

    expect(await screen.findByTestId("admin-cleanup-settings-return")).toHaveTextContent("Back to Turn on the rule")
  })
})
