/**
 * Other integrations: the rows are the view, with no section Edit, and each
 * row's Sheet is its edit mode. A save, or Save with nothing changed, closes
 * the Sheet; a failed one keeps it open; closing it with unsaved changes asks
 * first. Allow Jellyfin sign-in saves at once, so it is live in the row.
 */

import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { toggleJellyfinLogin, updateRadarr, updateSonarr } from "@/actions/admin/admin-servers"
import { OtherIntegrationsSection } from "@/components/admin/settings/sections/other-integrations-section"
import type { StoredServer } from "@/hooks/admin/use-server-form"
import type { SectionHealth } from "@/lib/settings/connection-status"

jest.mock("@/actions/admin/admin-servers", () => ({
  toggleJellyfinLogin: jest.fn(),
  updateJellyfinServer: jest.fn(),
  updateOverseerr: jest.fn(),
  updatePlexServer: jest.fn(),
  updateRadarr: jest.fn(),
  updateSonarr: jest.fn(),
  updateTautulli: jest.fn(),
}))
jest.mock("@/actions/admin/test-connection", () => ({ testServiceConnection: jest.fn() }))

const mockShowSuccess = jest.fn()
const mockShowError = jest.fn()
jest.mock("@/components/ui/toast", () => ({ useToast: () => ({ showSuccess: mockShowSuccess, showError: mockShowError }) }))

const SONARR: StoredServer = { name: "TV", url: "http://sonarr.lan:8989", publicUrl: null, secret: { last4: "5678", origin: "http://sonarr.lan:8989" } }
const JELLYFIN: StoredServer = { name: "Jelly", url: "http://jellyfin.lan:8096", publicUrl: null, secret: { last4: "9012", origin: "http://jellyfin.lan:8096" } }
const OK: SectionHealth = { status: "ok", code: null, checkedAt: null }
const UNSET: SectionHealth = { status: "notConfigured", code: null, checkedAt: null }
const HEALTH = { sonarr: OK, radarr: UNSET, jellyfin: OK }

type User = ReturnType<typeof userEvent.setup>

function renderSection(jellyfinLogin: boolean | null = true) {
  return render(
    <OtherIntegrationsSection
      servers={{ sonarr: SONARR, radarr: null, jellyfin: jellyfinLogin === null ? null : JELLYFIN }}
      jellyfinLogin={jellyfinLogin}
      health={jellyfinLogin === null ? { ...HEALTH, jellyfin: UNSET } : HEALTH}
      footerMeta={<span data-testid="settings-other-last-saved">Last saved 2 minutes ago by Dana</span>}
    />
  )
}

async function openSonarr(user: User) {
  await user.click(screen.getByTestId("settings-other-sonarr-edit"))
  return screen.getByTestId("settings-other-sonarr-sheet")
}

beforeEach(() => jest.clearAllMocks())

describe("OtherIntegrationsSection", () => {
  it("lists each service with its host or description, and Edit or Set up", () => {
    renderSection()

    expect(screen.getByTestId("settings-other-sonarr")).toHaveTextContent("sonarr.lan:8989")
    expect(screen.getByTestId("settings-other-radarr")).toHaveTextContent("Movie library and viewing statistics")
    expect(screen.getByRole("button", { name: "Edit Sonarr" })).toHaveAttribute("data-testid", "settings-other-sonarr-edit")
    expect(screen.getByRole("button", { name: "Set up Radarr" })).toHaveAttribute("data-testid", "settings-other-radarr-edit")
    expect(screen.getByRole("button", { name: "Edit Jellyfin" })).toHaveAttribute("data-testid", "settings-other-jellyfin-edit")
    expect(screen.queryByTestId("settings-other-edit")).not.toBeInTheDocument()
    expect(screen.queryByTestId("settings-other-save")).not.toBeInTheDocument()
  })

  it("keeps Allow Jellyfin sign-in live in the Jellyfin row, outside the Sheet", async () => {
    const user = userEvent.setup()
    jest.mocked(toggleJellyfinLogin).mockResolvedValue({ success: true, data: null })
    renderSection(true)

    const toggle = within(screen.getByTestId("settings-other-jellyfin")).getByRole("switch", { name: "Allow Jellyfin sign-in" })
    expect(toggle).toHaveAttribute("data-testid", "jellyfin-login-toggle")
    expect(toggle).toHaveAttribute("aria-checked", "true")

    await user.click(toggle)
    expect(toggleJellyfinLogin).toHaveBeenCalledWith(false)

    await user.click(screen.getByTestId("settings-other-jellyfin-edit"))
    expect(within(screen.getByTestId("settings-other-jellyfin-sheet")).queryByTestId("jellyfin-login-toggle")).not.toBeInTheDocument()
  })

  it("has no Jellyfin sign-in switch until Jellyfin is set up", () => {
    renderSection(null)

    expect(screen.queryByTestId("jellyfin-login-toggle")).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Set up Jellyfin" })).toBeInTheDocument()
  })

  it("opens the service's form in its Sheet, with Last saved in the footer", async () => {
    const user = userEvent.setup()
    renderSection()

    const sheet = await openSonarr(user)

    expect(within(sheet).getByRole("heading", { name: "Sonarr" })).toBeInTheDocument()
    expect(within(sheet).getByTestId("settings-sonarr-name")).toHaveValue("TV")
    expect(within(sheet).getByTestId("settings-sonarr-secret")).toHaveValue("")
    expect(within(sheet).getByTestId("settings-other-last-saved")).toHaveTextContent("Last saved 2 minutes ago by Dana")
    expect(within(sheet).getByTestId("settings-sonarr-save")).toBeEnabled()
    expect(within(sheet).getByTestId("settings-sonarr-test")).toBeEnabled()
  })

  it("a successful save closes the Sheet", async () => {
    const user = userEvent.setup()
    jest.mocked(updateSonarr).mockResolvedValue({ success: true, data: null })
    renderSection()

    await openSonarr(user)
    await user.type(screen.getByTestId("settings-sonarr-name"), " shows")
    await user.click(screen.getByTestId("settings-sonarr-save"))

    expect(updateSonarr).toHaveBeenCalledWith({ name: "TV shows", url: "http://sonarr.lan:8989", apiKey: undefined, publicUrl: undefined })
    expect(mockShowSuccess).toHaveBeenCalledWith("Sonarr settings saved")
    await waitFor(() => expect(screen.queryByTestId("settings-other-sonarr-sheet")).not.toBeInTheDocument())
    expect(screen.queryByTestId("settings-sonarr-discard-dialog")).not.toBeInTheDocument()
  })

  it("Save with nothing changed closes the Sheet without saving", async () => {
    const user = userEvent.setup()
    renderSection()

    await openSonarr(user)
    await user.click(screen.getByTestId("settings-sonarr-save"))

    await waitFor(() => expect(screen.queryByTestId("settings-other-sonarr-sheet")).not.toBeInTheDocument())
    expect(updateSonarr).not.toHaveBeenCalled()
  })

  it("a failed save keeps the Sheet open with the error on its field", async () => {
    const user = userEvent.setup()
    const message = "Enter the API key."
    jest.mocked(updateRadarr).mockResolvedValue({ success: false, code: "SECRET_REQUIRED", error: message, fieldErrors: { apiKey: [message] } })
    renderSection()

    await user.click(screen.getByTestId("settings-other-radarr-edit"))
    await user.type(screen.getByTestId("settings-radarr-name"), "Movies")
    await user.type(screen.getByTestId("settings-radarr-url"), "http://radarr.lan:7878")
    await user.click(screen.getByTestId("settings-radarr-save"))

    expect(await screen.findByText(message)).toBeInTheDocument()
    await waitFor(() => expect(screen.getByTestId("settings-radarr-secret")).toHaveFocus())
    expect(screen.getByTestId("settings-other-radarr-sheet")).toBeInTheDocument()
  })

  it("asks before closing a Sheet with unsaved changes: Keep editing stays, Discard closes", async () => {
    const user = userEvent.setup()
    renderSection()

    await openSonarr(user)
    await user.type(screen.getByTestId("settings-sonarr-name"), " shows")
    await user.keyboard("{Escape}")

    const dialog = await screen.findByTestId("settings-sonarr-discard-dialog")
    expect(dialog).toHaveTextContent("Discard changes to Sonarr?")
    await user.click(within(dialog).getByRole("button", { name: "Keep editing" }))

    await waitFor(() => expect(screen.queryByTestId("settings-sonarr-discard-dialog")).not.toBeInTheDocument())
    expect(screen.getByTestId("settings-sonarr-name")).toHaveValue("TV shows")

    await user.click(screen.getByTestId("settings-sonarr-cancel"))
    await user.click(await screen.findByTestId("settings-sonarr-discard-dialog-confirm"))

    await waitFor(() => expect(screen.queryByTestId("settings-other-sonarr-sheet")).not.toBeInTheDocument())
    expect(updateSonarr).not.toHaveBeenCalled()

    await openSonarr(user)
    expect(screen.getByTestId("settings-sonarr-name")).toHaveValue("TV")
  })

  it("stays open while a save is in flight: Escape neither closes it nor offers to discard what is being saved", async () => {
    const user = userEvent.setup()
    let finish: (value: { success: true; data: null }) => void = () => {}
    jest.mocked(updateSonarr).mockReturnValue(new Promise((resolve) => (finish = resolve)))
    renderSection()

    await openSonarr(user)
    await user.type(screen.getByTestId("settings-sonarr-name"), " shows")
    await user.click(screen.getByTestId("settings-sonarr-save"))
    await user.keyboard("{Escape}")

    expect(screen.queryByTestId("settings-sonarr-discard-dialog")).not.toBeInTheDocument()
    expect(screen.getByTestId("settings-other-sonarr-sheet")).toBeInTheDocument()

    finish({ success: true, data: null })
    await waitFor(() => expect(screen.queryByTestId("settings-other-sonarr-sheet")).not.toBeInTheDocument())
    expect(mockShowSuccess).toHaveBeenCalledWith("Sonarr settings saved")
  })

  it("closes a clean Sheet at once, from Cancel or Escape", async () => {
    const user = userEvent.setup()
    renderSection()

    await openSonarr(user)
    await user.click(screen.getByTestId("settings-sonarr-cancel"))
    await waitFor(() => expect(screen.queryByTestId("settings-other-sonarr-sheet")).not.toBeInTheDocument())

    await openSonarr(user)
    await user.keyboard("{Escape}")
    await waitFor(() => expect(screen.queryByTestId("settings-other-sonarr-sheet")).not.toBeInTheDocument())
    expect(screen.queryByTestId("settings-sonarr-discard-dialog")).not.toBeInTheDocument()
  })
})
