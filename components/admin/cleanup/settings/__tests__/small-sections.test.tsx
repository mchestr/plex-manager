/**
 * Defaults for new rules, Plex visibility and Member options (UX 4.10, 8.8):
 * each read view, Edit with its checkboxes and ranges, the changed-from
 * lines, Save with only the section's values, Cancel, and the busy toast of
 * a members save (UX 8.9).
 */

import { act, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { updateCleanupSettings } from "@/actions/admin/cleanup-settings"
import { buildSettingsData, NOW } from "@/components/admin/cleanup/settings/__tests__/fixtures"
import { checkDefaults, DefaultsSection } from "@/components/admin/cleanup/settings/defaults-section"
import { checkMembers, MembersSection } from "@/components/admin/cleanup/settings/members-section"
import { collectionsWords, PlexSection, placesWords } from "@/components/admin/cleanup/settings/plex-section"
import { buildOptions } from "@/lib/cleanup/__tests__/helpers/builders"
import type { CleanupSettingsData } from "@/lib/cleanup/types/screens"

jest.mock("@/actions/admin/cleanup-settings", () => ({ updateCleanupSettings: jest.fn() }))
const mockShowSuccess = jest.fn()
const mockShowError = jest.fn()
jest.mock("@/components/ui/toast", () => ({ useToast: () => ({ showSuccess: mockShowSuccess, showError: mockShowError }) }))

const summary = (section: string, key: string) => screen.getByTestId(`settings-cleanup-${section}-summary-${key}`)
const box = (id: string) => screen.getByTestId(id)

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(updateCleanupSettings).mockResolvedValue({ success: true, data: { exitsApplied: null } })
})

describe("DefaultsSection", () => {
  const renderSection = async (data: CleanupSettingsData = buildSettingsData()) => {
    await act(async () => {
      render(<DefaultsSection data={data} />)
    })
  }

  it("reads the grace period and the exclusion, Off too", async () => {
    await renderSection()
    expect(summary("defaults", "grace")).toHaveTextContent("Grace period30 days")
    expect(summary("defaults", "exclusion")).toHaveTextContent("On, for delete actions")
  })

  it("reads Off and 1 day", async () => {
    await renderSection(buildSettingsData({}, buildOptions({ defaults: { graceDays: 1, importListExclusion: false } })))
    expect(summary("defaults", "grace")).toHaveTextContent("1 day")
    expect(summary("defaults", "exclusion")).toHaveTextContent(/Off$/)
  })

  it("checks the range, shows what changed and saves both values", async () => {
    const user = userEvent.setup()
    await renderSection()
    await user.click(screen.getByTestId("settings-cleanup-defaults-edit"))

    const grace = screen.getByRole("textbox", { name: "Grace period" })
    expect(grace).toHaveAttribute("data-testid", "cleanup-defaults-grace")
    await user.clear(grace)
    expect(screen.getByTestId("cleanup-defaults-grace-error")).toHaveTextContent("Enter a whole number of days from 1 to 3650.")
    await user.click(screen.getByTestId("settings-cleanup-defaults-save"))
    expect(updateCleanupSettings).not.toHaveBeenCalled()

    await user.type(grace, "14")
    expect(screen.getByText("Changed from 30 days.")).toBeInTheDocument()
    await user.click(screen.getByRole("checkbox", { name: "Add an import list exclusion" }))
    expect(screen.getByText("Changed from on.")).toBeInTheDocument()
    await user.click(screen.getByTestId("settings-cleanup-defaults-save"))

    expect(updateCleanupSettings).toHaveBeenCalledWith({ section: "cleanup-defaults", values: { graceDays: 14, importListExclusion: false } })
    expect(mockShowSuccess).toHaveBeenCalledWith("Settings saved")
  })

  it("checks the grace period alone", () => {
    expect(checkDefaults({ graceDays: 3651, importListExclusion: true })).toEqual({ errors: { graceDays: "Enter a whole number of days from 1 to 3650." } })
    expect(checkDefaults({ graceDays: null, importListExclusion: true })).toEqual({ errors: { graceDays: "Enter a whole number of days from 1 to 3650." } })
  })
})

describe("PlexSection", () => {
  const renderSection = async (data: CleanupSettingsData = buildSettingsData()) => {
    await act(async () => {
      render(<PlexSection data={data} now={NOW} />)
    })
  }

  it("shows Working, each row, the summary and the Kometa note", async () => {
    await renderSection()

    expect(screen.getByTestId("settings-cleanup-plex-state")).toHaveTextContent("WorkingChecked 3:07 AM today")
    expect(summary("plex", "enabled")).toHaveTextContent("Leaving soon collectionsOn")
    expect(summary("plex", "places")).toHaveTextContent("Your Home and members' Home. Not in Recommended.")
    expect(summary("plex", "collections")).toHaveTextContent(
      "Movies leaving soon: empty. Shows leaving soon: 21 shows. Seasons leaving soon: 31 seasons."
    )
    expect(summary("plex", "order")).toHaveTextContent("The soonest leave date first")
    expect(summary("plex", "text")).toHaveTextContent('"These titles leave Example Server soon, the soonest first."')
    expect(screen.getByTestId("settings-cleanup-plex-kometa")).toHaveTextContent("Kometa runs every 8 hours")
  })

  it("says Needs attention, the missing summary and each removed collection", async () => {
    const data = buildSettingsData()
    await renderSection({
      ...data,
      plex: {
        ...data.plex,
        working: false,
        checkedAt: null,
        summary: "",
        notices: [
          { kind: "collectionRemoved", key: "2:show", title: "Shows leaving soon", sectionId: "2", detectedAt: "2026-11-08T00:00:00.000Z", recreatedAt: "2026-11-08T00:41:00.000Z" },
          { kind: "collectionRemoved", key: "1:movie", title: "Movies leaving soon", sectionId: "1", detectedAt: "2026-11-08T11:00:00.000Z", recreatedAt: null },
        ],
      },
    })

    expect(screen.getByTestId("settings-cleanup-plex-state")).toHaveTextContent(/^Needs attention$/)
    expect(summary("plex", "text")).toHaveTextContent("Not set, because the app URL is not set")
    expect(screen.getByTestId("settings-cleanup-plex-notices")).toHaveTextContent(
      "Kometa removed Shows leaving soon at 12:00 AM today. plex-manager made it again at 12:41 AM today."
    )
    expect(screen.getByTestId("settings-cleanup-plex-notices")).toHaveTextContent("plex-manager makes it again within the hour.")
  })

  it("words each mix of places and counts", () => {
    const all = { showCollections: true, ownHome: true, sharedHome: true, recommended: true }
    expect(placesWords(all)).toBe("Your Home, members' Home and Recommended.")
    expect(placesWords({ ...all, ownHome: false, sharedHome: false, recommended: false })).toBe("Not on your Home, on members' Home or in Recommended.")
    expect(placesWords({ ...all, ownHome: false })).toBe("Members' Home and Recommended. Not on your Home.")
    expect(collectionsWords([])).toBe("Movies leaving soon: empty. Shows leaving soon: empty. Seasons leaving soon: empty.")
    expect(collectionsWords([{ level: "movie", sectionId: "1", title: "Movies leaving soon", count: 1 }])).toMatch(/^Movies leaving soon: 1 movie\./)
  })

  it("disables the places while the collections are off, and saves the four checkboxes", async () => {
    const user = userEvent.setup()
    await renderSection()
    await user.click(screen.getByTestId("settings-cleanup-plex-edit"))

    expect(screen.getByRole("checkbox", { name: "Show Leaving soon collections in Plex" })).toHaveAttribute("data-testid", "cleanup-plex-enabled")
    await user.click(box("cleanup-plex-recommended"))
    expect(screen.getByText("Changed from off.")).toBeInTheDocument()
    await user.click(box("cleanup-plex-owner-home"))
    await user.click(box("cleanup-plex-shared-home"))
    await user.click(box("cleanup-plex-enabled"))
    expect(box("cleanup-plex-owner-home")).toHaveAttribute("aria-disabled", "true")
    await user.click(screen.getByTestId("settings-cleanup-plex-save"))

    expect(updateCleanupSettings).toHaveBeenCalledWith({
      section: "cleanup-plex",
      values: { showCollections: false, ownHome: false, sharedHome: false, recommended: true },
    })
  })
})

describe("MembersSection", () => {
  const renderSection = async (data: CleanupSettingsData = buildSettingsData()) => {
    await act(async () => {
      render(<MembersSection data={data} />)
    })
  }

  it("reads each option and what members see about others", async () => {
    await renderSection()
    expect(summary("members", "keeps")).toHaveTextContent("Members can keep titlesOn")
    expect(summary("members", "keep-days")).toHaveTextContent("90 days")
    expect(summary("members", "keep-limit")).toHaveTextContent("20 at a time")
    expect(summary("members", "page")).toHaveTextContent("Shown while a member can see a title in Leaving soon")
    expect(summary("members", "others")).toHaveTextContent("Nothing. Each member sees only their own link to a title.")
  })

  it("reads Off for Keeps and the page", async () => {
    await renderSection(buildSettingsData({}, buildOptions({ members: { keepsEnabled: false, pageEnabled: false } })))
    expect(summary("members", "keeps")).toHaveTextContent(/Off$/)
    expect(summary("members", "page")).toHaveTextContent(/Off$/)
  })

  it("explains that turning Keeps off stops new Keeps only, and toasts the busy words", async () => {
    const user = userEvent.setup()
    jest.mocked(updateCleanupSettings).mockResolvedValueOnce({ success: true, data: { exitsApplied: false } })
    await renderSection()
    await user.click(screen.getByTestId("settings-cleanup-members-edit"))

    const keeps = screen.getByRole("checkbox", { name: "Members can keep titles" })
    expect(keeps).toHaveAccessibleDescription("Turning this off stops new Keeps. Current Keeps protect their titles until they end.")
    await user.click(keeps)
    await user.click(screen.getByRole("checkbox", { name: "Show the Leaving soon page and the Home row" }))
    const days = screen.getByRole("textbox", { name: "A Keep lasts" })
    await user.clear(days)
    await user.type(days, "30")
    expect(screen.getByText("Changed from 90 days.")).toBeInTheDocument()
    const limit = screen.getByRole("textbox", { name: "Most Keeps per member" })
    await user.clear(limit)
    await user.type(limit, "5")
    expect(screen.getByText("Changed from 20 at a time.")).toBeInTheDocument()
    await user.click(screen.getByTestId("settings-cleanup-members-save"))

    expect(updateCleanupSettings).toHaveBeenCalledWith({
      section: "cleanup-members",
      values: { keepsEnabled: false, keepDays: 30, keepLimit: 5, pageEnabled: false },
    })
    expect(mockShowSuccess).toHaveBeenCalledWith(
      "Settings saved. A run is in progress. At its end, titles that a new protection keeps safe leave Leaving soon."
    )
  })

  it("checks both ranges, and Cancel asks before it discards", async () => {
    const user = userEvent.setup()
    await renderSection()
    await user.click(screen.getByTestId("settings-cleanup-members-edit"))

    await user.clear(screen.getByTestId("cleanup-members-keep-days"))
    await user.type(screen.getByTestId("cleanup-members-keep-days"), "6")
    await user.clear(screen.getByTestId("cleanup-members-keep-limit"))
    expect(screen.getByTestId("cleanup-members-keep-days-error")).toHaveTextContent("Enter a whole number of days from 7 to 365.")
    expect(screen.getByTestId("cleanup-members-keep-limit-error")).toHaveTextContent("Enter a whole number of Keeps from 1 to 100.")
    await user.click(screen.getByTestId("settings-cleanup-members-save"))
    expect(updateCleanupSettings).not.toHaveBeenCalled()

    await user.click(screen.getByTestId("settings-cleanup-members-cancel"))
    expect(await screen.findByTestId("settings-cleanup-members-discard-dialog")).toBeInTheDocument()
    expect(checkMembers({ keepsEnabled: true, keepDays: 366, keepLimit: 101, pageEnabled: true })).toEqual({
      errors: { keepDays: "Enter a whole number of days from 7 to 365.", keepLimit: "Enter a whole number of Keeps from 1 to 100." },
    })
  })
})
