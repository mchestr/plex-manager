/**
 * The affiliate settings section: a summary of the saved values until Edit,
 * then the switch, the tier editor, the server cap with the share count and
 * the library list. The typed values are checked before the save, and a
 * save that cancels invites says how many.
 */

import { act, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { updateAffiliateSettings } from "@/actions/admin/affiliate-settings"
import { AffiliateSettingsSection } from "@/components/admin/affiliates/settings/affiliate-settings-section"
import type { AffiliateSettingsView } from "@/lib/data/affiliate-settings"
import type { LibraryListing } from "@/types/invite"

jest.mock("@/actions/admin/affiliate-settings", () => ({ updateAffiliateSettings: jest.fn() }))

const mockShowSuccess = jest.fn()
const mockShowError = jest.fn()
jest.mock("@/components/ui/toast", () => ({ useToast: () => ({ showSuccess: mockShowSuccess, showError: mockShowError }) }))

const LISTING: LibraryListing = {
  ok: true,
  libraries: [
    { id: "1", name: "Movies", type: "movie" },
    { id: "2", name: "TV Shows", type: "show" },
  ],
}

const DEFAULTS = [
  { overHours: 50, invites: 1 },
  { overHours: 200, invites: 2 },
  { overHours: 500, invites: 3 },
]
const OFF: AffiliateSettingsView = { enabled: false, tiers: DEFAULTS, cap: 10, libraryIds: [] }
const ON: AffiliateSettingsView = { enabled: true, tiers: DEFAULTS, cap: null, libraryIds: [2] }

/** A promise React reads at once, as it does one a Server Component streamed in that already settled. */
function settled<T>(value: T): Promise<T> {
  return Object.assign(Promise.resolve(value), { status: "fulfilled", value })
}

async function renderSection(saved = OFF, { listing = LISTING, shareCount = 7 as number | null } = {}) {
  await act(async () => {
    render(<AffiliateSettingsSection saved={saved} libraries={settled(listing)} shareCount={settled(shareCount)} />)
  })
}

const summary = (key: string) => screen.getByTestId(`settings-affiliates-summary-${key}`)

async function edit(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByTestId("settings-affiliates-edit"))
  await screen.findByTestId("settings-affiliates-fields")
}

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(updateAffiliateSettings).mockResolvedValue({ success: true, data: { invitesCancelled: 0 } })
})

describe("AffiliateSettingsSection", () => {
  describe("view mode", () => {
    it("summarises the saved settings with the share count", async () => {
      await renderSection(ON)

      expect(summary("enabled")).toHaveTextContent("On")
      expect(summary("cap")).toHaveTextContent("No cap")
      expect(screen.getByTestId("settings-affiliates-share-count")).toHaveTextContent("The Plex server shares with 7 users now.")
      expect(summary("tier-1")).toHaveTextContent("More than 50 h: 1 invite per 30 days")
      expect(summary("tier-3")).toHaveTextContent("More than 500 h: 3 invites per 30 days")
      expect(summary("libraries")).toHaveTextContent("TV Shows")
      expect(screen.queryByRole("switch")).not.toBeInTheDocument()
    })

    it("says when Plex can't count the shares, and when no library is set", async () => {
      await renderSection({ ...OFF, cap: 0 }, { shareCount: null })

      expect(summary("enabled")).toHaveTextContent("Off")
      expect(summary("cap")).toHaveTextContent("0. No new affiliate invites.")
      expect(screen.getByTestId("settings-affiliates-share-count")).toHaveTextContent("Plex did not answer")
      expect(summary("libraries")).toHaveTextContent("Not set")
    })

    it("names a library Plex no longer lists by its key", async () => {
      await renderSection({ ...ON, libraryIds: [9] }, { listing: { ok: false, reason: "Plex is down." } })
      expect(summary("libraries")).toHaveTextContent("Library 9")
    })
  })

  describe("edit mode", () => {
    it("turns the switch on with a library and saves the typed values", async () => {
      const user = userEvent.setup()
      await renderSection()
      await edit(user)

      await user.click(screen.getByTestId("settings-affiliates-switch"))
      await user.click(screen.getByTestId("settings-affiliates-library-1"))
      await user.clear(screen.getByTestId("settings-affiliates-cap-input"))
      await user.type(screen.getByTestId("settings-affiliates-cap-input"), "25")
      await user.clear(screen.getByTestId("settings-affiliates-tier-1-hours"))
      await user.type(screen.getByTestId("settings-affiliates-tier-1-hours"), "60")
      await user.click(screen.getByTestId("settings-affiliates-save"))

      await waitFor(() =>
        expect(updateAffiliateSettings).toHaveBeenCalledWith({
          enabled: true,
          tiers: [{ overHours: 60, invites: 1 }, DEFAULTS[1], DEFAULTS[2]],
          cap: 25,
          libraryIds: [1],
        })
      )
      expect(mockShowSuccess).toHaveBeenCalledWith("Affiliate settings saved")
    })

    it("refuses the switch on without a library, on the library list", async () => {
      const user = userEvent.setup()
      await renderSection()
      await edit(user)

      await user.click(screen.getByTestId("settings-affiliates-switch"))
      await user.click(screen.getByTestId("settings-affiliates-save"))

      expect(await screen.findByTestId("settings-affiliates-library-picker-error")).toHaveTextContent("Select one or more libraries")
      expect(updateAffiliateSettings).not.toHaveBeenCalled()
    })

    it("saves a blank cap as no cap, and refuses one out of range", async () => {
      const user = userEvent.setup()
      await renderSection()
      await edit(user)

      await user.clear(screen.getByTestId("settings-affiliates-cap-input"))
      await user.type(screen.getByTestId("settings-affiliates-cap-input"), "1001")
      await user.click(screen.getByTestId("settings-affiliates-save"))
      expect(await screen.findByTestId("settings-affiliates-cap-error")).toHaveTextContent("from 0 to 1000")
      expect(updateAffiliateSettings).not.toHaveBeenCalled()

      await user.clear(screen.getByTestId("settings-affiliates-cap-input"))
      await user.click(screen.getByTestId("settings-affiliates-save"))
      await waitFor(() => expect(updateAffiliateSettings).toHaveBeenCalledWith(expect.objectContaining({ cap: null })))
    })

    it("edits the tiers: add, remove, defaults, and a tier that does not rise", async () => {
      const user = userEvent.setup()
      await renderSection()
      await edit(user)

      await user.click(screen.getByTestId("settings-affiliates-tier-add"))
      expect(screen.getByTestId("settings-affiliates-tier-4-hours")).toHaveValue(600)
      await user.click(screen.getByTestId("settings-affiliates-tier-add"))
      expect(screen.getByTestId("settings-affiliates-tier-add")).toBeDisabled()
      await user.click(screen.getByTestId("settings-affiliates-tier-remove"))
      expect(screen.queryByTestId("settings-affiliates-tier-5")).not.toBeInTheDocument()

      await user.clear(screen.getByTestId("settings-affiliates-tier-2-hours"))
      await user.type(screen.getByTestId("settings-affiliates-tier-2-hours"), "10")
      await user.click(screen.getByTestId("settings-affiliates-save"))
      expect(await screen.findByTestId("settings-affiliates-tiers-error")).toHaveTextContent("Each tier needs more hours than the one before")

      await user.click(screen.getByTestId("settings-affiliates-tier-reset"))
      expect(screen.queryByTestId("settings-affiliates-tier-4")).not.toBeInTheDocument()
      expect(screen.queryByTestId("settings-affiliates-tiers-error")).not.toBeInTheDocument()
    })

    it("says how many open invites turning the switch off cancelled", async () => {
      jest.mocked(updateAffiliateSettings).mockResolvedValue({ success: true, data: { invitesCancelled: 2 } })
      const user = userEvent.setup()
      await renderSection(ON)
      await edit(user)

      await user.click(screen.getByTestId("settings-affiliates-switch"))
      await user.click(screen.getByTestId("settings-affiliates-save"))

      await waitFor(() => expect(mockShowSuccess).toHaveBeenCalledWith("Affiliate settings saved. 2 open invites were cancelled."))
      expect(updateAffiliateSettings).toHaveBeenCalledWith(expect.objectContaining({ enabled: false, libraryIds: [2] }))
    })

    it("shows a refused save as an error and stays open", async () => {
      jest.mocked(updateAffiliateSettings).mockResolvedValue({ success: false, code: "VALIDATION", error: "Connect Tautulli first." })
      const user = userEvent.setup()
      await renderSection(ON)
      await edit(user)

      await user.clear(screen.getByTestId("settings-affiliates-cap-input"))
      await user.type(screen.getByTestId("settings-affiliates-cap-input"), "5")
      await user.click(screen.getByTestId("settings-affiliates-save"))

      await waitFor(() => expect(mockShowError).toHaveBeenCalledWith("Connect Tautulli first."))
      expect(screen.getByTestId("settings-affiliates-fields")).toBeInTheDocument()
    })

    it("puts a server library error on the library list", async () => {
      jest.mocked(updateAffiliateSettings).mockResolvedValue({ success: false, code: "VALIDATION", error: "Invalid", fieldErrors: { libraryIds: ["Pick a library"] } })
      const user = userEvent.setup()
      await renderSection(ON)
      await edit(user)

      await user.click(screen.getByTestId("settings-affiliates-library-1"))
      await user.click(screen.getByTestId("settings-affiliates-save"))

      expect(await screen.findByTestId("settings-affiliates-library-picker-error")).toHaveTextContent("Pick a library")
      expect(mockShowError).not.toHaveBeenCalled()
    })
  })
})
