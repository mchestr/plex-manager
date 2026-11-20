/**
 * The Global protections section (UX 4.10, 5.4.1, 8.8): the read view of two
 * columns with "Protects N", then Edit with G1 and G3 locked, the checkbox
 * named by the full sentence and the days field outside its label, the
 * hints, G9's tag picker without requester tags, G13's Kometa suggestion,
 * the changed-from lines, the checks on Save, and the busy toast.
 */

import { act, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { previewCleanupProtectionImpact } from "@/actions/admin/cleanup-preview"
import { updateCleanupSettings } from "@/actions/admin/cleanup-settings"
import { buildProtections, buildSettingsData } from "@/components/admin/cleanup/settings/__tests__/fixtures"
import { ProtectionsSection } from "@/components/admin/cleanup/settings/protections-section"
import { buildOptions } from "@/lib/cleanup/__tests__/helpers/builders"
import type { CleanupSettingsData } from "@/lib/cleanup/types/screens"

jest.mock("@/actions/admin/cleanup-settings", () => ({ updateCleanupSettings: jest.fn() }))
jest.mock("@/actions/admin/cleanup-preview", () => ({ previewCleanupProtectionImpact: jest.fn() }))
const mockShowSuccess = jest.fn()
const mockShowError = jest.fn()
jest.mock("@/components/ui/toast", () => ({ useToast: () => ({ showSuccess: mockShowSuccess, showError: mockShowError }) }))

async function renderSection(data: CleanupSettingsData = buildSettingsData()) {
  await act(async () => {
    render(<ProtectionsSection data={data} />)
  })
}

const summary = (id: string) => screen.getByTestId(`settings-cleanup-protections-summary-${id}`)
const row = (id: string) => screen.getByTestId(`cleanup-protections-${id}-row`)

async function edit(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByTestId("settings-cleanup-protections-edit"))
}

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(updateCleanupSettings).mockResolvedValue({ success: true, data: { exitsApplied: true } })
  jest.mocked(previewCleanupProtectionImpact).mockResolvedValue({ success: true, data: { rules: [], protects: {}, leaves: 0 } })
})

describe("ProtectionsSection read view", () => {
  it("shows 12 on and each protection with its state and count, G1 and G3 first", async () => {
    await renderSection()

    expect(screen.getByTestId("settings-cleanup-protections-state")).toHaveTextContent("12 on")
    const ids = within(screen.getByTestId("settings-cleanup-protections-summary"))
      .getAllByTestId(/^settings-cleanup-protections-summary-g/)
      .map((element) => element.dataset.testid?.replace("settings-cleanup-protections-summary-", ""))
    expect(ids).toEqual(["g1", "g3", "g2", "g4", "g5", "g6", "g7", "g8", "g9", "g10", "g11", "g12", "g13"])
    expect(summary("g1")).toHaveTextContent("Kept by a member, until the Keep endsAlways onProtects 23 titles")
    expect(summary("g4")).toHaveTextContent("Played by anyone in the last 30 daysOnProtects 212 titles")
    expect(summary("g11")).toHaveTextContent("OnProtects 147 seasons")
    expect(summary("g13")).toHaveTextContent("In the Plex collection that you nameOffSuggested: Christmas, Halloween")
  })

  it("says Off with no count, the services a protection needs, and one title", async () => {
    const options = buildOptions({ protections: { g2: { enabled: false } } })
    const protections = buildProtections(options, { g7: { needsMissing: ["overseerr"] }, g4: { protects: 1 }, g9: { needsMissing: ["radarr"] } })
    await renderSection(buildSettingsData({ protections, kometaSuggestion: null }, options))

    expect(screen.getByTestId("settings-cleanup-protections-state")).toHaveTextContent("11 on")
    expect(summary("g2")).toHaveTextContent(/Off$/)
    expect(summary("g7")).toHaveTextContent("OnNeeds Overseerr")
    expect(summary("g4")).toHaveTextContent("Protects 1 title")
    expect(summary("g9")).toHaveTextContent("OnProtects 41 titles")
    expect(summary("g13")).toHaveTextContent(/Off$/)
  })
})

describe("ProtectionsSection edit", () => {
  it("locks G1 and G3 with Always on, and names each checkbox by its full sentence", async () => {
    const user = userEvent.setup()
    await renderSection()
    await edit(user)

    for (const [id, name] of [
      ["g1", "Kept by a member, until the Keep ends"],
      ["g3", "Excluded by an admin, until its end date"],
    ]) {
      const box = screen.getByTestId(`cleanup-protections-${id}-enabled`)
      expect(box).toHaveAccessibleName(name)
      expect(box).toHaveAttribute("aria-checked", "true")
      expect(box).toHaveAttribute("aria-disabled", "true")
      expect(box).toHaveAccessibleDescription("Always on.")
    }
    expect(screen.getByRole("checkbox", { name: "Played by anyone in the last 30 days" })).toHaveAttribute("data-testid", "cleanup-protections-g4-enabled")
    expect(screen.getByRole("checkbox", { name: "Requested in the last 90 days by a member with access who has not finished it" })).toBeInTheDocument()
    expect(screen.getByRole("checkbox", { name: "The newest season of a continuing show" })).toBeInTheDocument()
    expect(screen.getByRole("checkbox", { name: "A member who played the show in the last 365 days has not finished the season" })).toBeInTheDocument()
    expect(screen.getByRole("checkbox", { name: "Has a Radarr or Sonarr tag: keep" })).toBeInTheDocument()
    expect(screen.getByRole("checkbox", { name: "In the Plex collection that you name" })).toHaveAttribute("aria-checked", "false")
  })

  it("puts the days field outside the checkbox label and names it Days for: {protection}", async () => {
    const user = userEvent.setup()
    await renderSection()
    await edit(user)

    const days = screen.getByRole("textbox", { name: "Days for: Played by anyone" })
    expect(days).toHaveAttribute("data-testid", "cleanup-protections-g4-days")
    expect(days).toHaveValue("30")
    expect(days.closest("label")).toBeNull()
    expect(screen.getByRole("textbox", { name: "Days for: Someone is part-way through" })).toHaveValue("180")
    expect(screen.getByRole("textbox", { name: "Days for: A member who played the show" })).toHaveAttribute("data-testid", "cleanup-protections-g12-days")
  })

  it("shows each hint, the G10 warning and the season and suggested groups", async () => {
    const user = userEvent.setup()
    await renderSection()
    await edit(user)

    expect(row("g2")).toHaveTextContent("From /mark in Discord and the assistant.")
    expect(row("g6")).toHaveTextContent("Uses the newer of the Plex and the Radarr or Sonarr dates.")
    expect(row("g8")).toHaveTextContent("Known only for the 2 members who use watchlist sync. For other members this is unknown, not no.")
    expect(row("g9")).toHaveTextContent("Overseerr requester tags are hidden from this list, because they hold user names.")
    expect(row("g10")).toHaveTextContent("If you turn this off, a delete can break posters in members' Rewind.")
    expect(row("g4")).toHaveTextContent("Protects 212 titles")
    expect(row("g13")).toHaveTextContent("Off")
    expect(screen.getByRole("group", { name: "Season rules only" })).toContainElement(row("g11"))
    expect(screen.getByRole("group", { name: "Suggested" })).toContainElement(row("g13"))
  })

  it("names one member who uses watchlist sync, and needed services", async () => {
    const user = userEvent.setup()
    const data = buildSettingsData({ watchlistMembers: 1, kometaSuggestion: null })
    await renderSection({ ...data, protections: buildProtections(data.options, { g9: { needsMissing: ["radarr", "sonarr"] } }) })
    await edit(user)

    expect(row("g8")).toHaveTextContent("Known only for the 1 member who uses watchlist sync.")
    expect(row("g9")).toHaveTextContent("Needs Radarr or Sonarr")
    expect(screen.queryByRole("group", { name: "Suggested" })).not.toBeInTheDocument()
  })

  it("never offers an Overseerr requester tag in the G9 picker", async () => {
    const user = userEvent.setup()
    await renderSection(buildSettingsData({ tagOptions: ["12-someone", "4k", "keep", "345-other"] }))
    await edit(user)

    await user.click(screen.getByTestId("cleanup-protections-g9-tags"))
    expect(await screen.findByTestId("cleanup-protections-g9-tags-option-4k")).toBeInTheDocument()
    expect(screen.queryByTestId("cleanup-protections-g9-tags-option-12-someone")).not.toBeInTheDocument()
    expect(screen.queryByTestId("cleanup-protections-g9-tags-option-345-other")).not.toBeInTheDocument()
    await user.click(screen.getByTestId("cleanup-protections-g9-tags-option-4k"))
    expect(screen.getByTestId("cleanup-protections-g9-tags-chip-4k")).toBeInTheDocument()
  })

  it("adds both Kometa collections and turns G13 on, then hides the suggestion", async () => {
    const user = userEvent.setup()
    await renderSection()
    await edit(user)

    expect(row("g13")).toHaveTextContent("Kometa makes the collections Christmas and Halloween in Movies. Seasonal titles play once a year.")
    await user.click(screen.getByTestId("cleanup-protections-g13-suggest"))

    expect(screen.getByTestId("cleanup-protections-g13-enabled")).toHaveAttribute("aria-checked", "true")
    expect(screen.getByTestId("cleanup-protections-g13-collections-chip-christmas-movies")).toBeInTheDocument()
    expect(screen.getByTestId("cleanup-protections-g13-collections-chip-halloween-movies")).toBeInTheDocument()
    expect(screen.queryByTestId("cleanup-protections-g13-suggest")).not.toBeInTheDocument()
    expect(row("g13")).toHaveTextContent("Changed from off.")
  })

  it("offers one Kometa collection as Add it, and three as Add all 3", async () => {
    const user = userEvent.setup()
    const { unmount } = render(<ProtectionsSection data={buildSettingsData({ kometaSuggestion: { names: ["Easter Movies"], library: "Films" } })} />)
    await edit(user)
    expect(row("g13")).toHaveTextContent("Kometa makes the collection Easter in Films.")
    expect(screen.getByTestId("cleanup-protections-g13-suggest")).toHaveTextContent("Add it")
    unmount()

    await renderSection(buildSettingsData({ kometaSuggestion: { names: ["Easter Movies", "Halloween Movies", "Christmas Movies"], library: "Films" } }))
    await edit(user)
    expect(screen.getByTestId("cleanup-protections-g13-suggest")).toHaveTextContent("Add all 3")
  })

  it("shows Changed from, stops a save on an empty days field, and saves only the protections", async () => {
    const user = userEvent.setup()
    await renderSection()
    await edit(user)

    const days = screen.getByTestId("cleanup-protections-g5-days")
    await user.clear(days)
    expect(row("g5")).toHaveTextContent("Changed from 180 days.From 1 to 3650 days.")
    expect(screen.getByTestId("cleanup-protections-g5-days-error")).toHaveTextContent("Enter a whole number of days from 1 to 3650.")
    expect(days).toHaveAttribute("aria-invalid", "true")
    await user.click(screen.getByTestId("settings-cleanup-protections-save"))
    expect(updateCleanupSettings).not.toHaveBeenCalled()
    await waitFor(() => expect(days).toBeEnabled())

    await user.type(days, "120")
    expect(days).toHaveValue("120")
    expect(screen.queryByTestId("cleanup-protections-g5-days-error")).not.toBeInTheDocument()
    await user.click(screen.getByTestId("cleanup-protections-g2-enabled"))
    await user.click(screen.getByTestId("settings-cleanup-protections-save"))

    const expected = buildOptions().protections
    expected.g5.days = 120
    expected.g2.enabled = false
    expect(updateCleanupSettings).toHaveBeenCalledWith({ section: "cleanup-protections", values: { protections: expected } })
    expect(mockShowSuccess).toHaveBeenCalledWith("Settings saved")
  })

  it("toasts the busy words when a run holds the exits", async () => {
    const user = userEvent.setup()
    jest.mocked(updateCleanupSettings).mockResolvedValueOnce({ success: true, data: { exitsApplied: false } })
    await renderSection()
    await edit(user)

    await user.click(screen.getByTestId("cleanup-protections-g10-enabled"))
    await user.click(screen.getByTestId("settings-cleanup-protections-save"))

    expect(mockShowSuccess).toHaveBeenCalledWith(
      "Settings saved. A run is in progress. At its end, titles that a new protection keeps safe leave Leaving soon."
    )
  })

  it("shows a refusal in an error toast, and Cancel puts the saved values back", async () => {
    const user = userEvent.setup()
    jest.mocked(updateCleanupSettings).mockResolvedValueOnce({ success: false, code: "CONFLICT", error: "Someone else saved settings at the same time. Try again." })
    await renderSection()
    await edit(user)

    await user.click(screen.getByTestId("cleanup-protections-g8-enabled"))
    await user.click(screen.getByTestId("settings-cleanup-protections-save"))
    expect(mockShowError).toHaveBeenCalledWith("Someone else saved settings at the same time. Try again.")

    // Cancel is disabled until the save's transition ends, which a loaded CI runner ends late
    await waitFor(() => expect(screen.getByTestId("settings-cleanup-protections-cancel")).toBeEnabled())
    await user.click(screen.getByTestId("settings-cleanup-protections-cancel"))
    await user.click(await screen.findByRole("button", { name: /^Discard/ }))
    await waitFor(() => expect(screen.queryByTestId("settings-cleanup-protections-form")).not.toBeInTheDocument())
    await edit(user)
    expect(screen.getByTestId("cleanup-protections-g8-enabled")).toHaveAttribute("aria-checked", "true")
  })
})
