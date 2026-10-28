/**
 * The service form (P10.20, SEC-31) in its two homes. A Media section opens
 * read-only, with the saved key described and never shown, and Edit opens the
 * fields: there a changed origin blocks Test and Save until a key is typed,
 * the same origin with a new path does not, Test runs the typed values, and
 * errors show on their fields. In the Other integrations Sheet the form is
 * the edit mode: Save with nothing changed or a save that works closes it.
 */

import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { updateOverseerr, updateSonarr } from "@/actions/admin/admin-servers"
import { testServiceConnection } from "@/actions/admin/test-connection"
import { ServiceSection } from "@/components/admin/settings/sections/service-section"
import { ServerForm } from "@/components/admin/settings/server-form"
import type { StoredServer } from "@/hooks/admin/use-server-form"

jest.mock("@/actions/admin/admin-servers", () => ({ updateJellyfinServer: jest.fn(), updateOverseerr: jest.fn(), updatePlexServer: jest.fn(), updateRadarr: jest.fn(), updateSonarr: jest.fn(), updateTautulli: jest.fn() }))
jest.mock("@/actions/admin/test-connection", () => ({ testServiceConnection: jest.fn() }))

const mockRefresh = jest.fn()
jest.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mockRefresh }) }))

const mockShowSuccess = jest.fn()
const mockShowError = jest.fn()
jest.mock("@/components/ui/toast", () => ({ useToast: () => ({ showSuccess: mockShowSuccess, showError: mockShowError }) }))

const SERVER: StoredServer = {
  name: "Requests",
  url: "http://localhost:5055",
  publicUrl: null,
  secret: { last4: "a91c", origin: "http://localhost:5055" },
}
const HEALTH = { status: "ok" as const, code: null, checkedAt: null }

type User = ReturnType<typeof userEvent.setup>

/** The Overseerr section, opened for editing. */
async function renderSection(user: User, server: StoredServer | null = SERVER) {
  render(<ServiceSection type="overseerr" server={server} health={HEALTH} />)
  await user.click(screen.getByTestId("settings-overseerr-edit"))
}

beforeEach(() => jest.clearAllMocks())

describe("ServiceSection view mode", () => {
  it("shows the saved values, with the key described and never shown", () => {
    render(<ServiceSection type="overseerr" server={SERVER} health={HEALTH} />)

    expect(screen.getByTestId("settings-overseerr-summary-name")).toHaveTextContent("Requests")
    expect(screen.getByTestId("settings-overseerr-summary-url")).toHaveTextContent("http://localhost:5055")
    expect(screen.getByTestId("settings-overseerr-summary-public-url")).toHaveTextContent("Not set")
    expect(screen.getByTestId("settings-overseerr-summary-secret")).toHaveTextContent("Saved, ends in a91c")
    expect(screen.queryByTestId("settings-overseerr-secret")).not.toBeInTheDocument()
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument()
    expect(screen.queryByTestId("settings-overseerr-save")).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Edit Overseerr" })).toHaveAttribute("data-testid", "settings-overseerr-edit")
  })

  it("says Not set up and offers Set up when nothing is saved", () => {
    render(<ServiceSection type="overseerr" server={null} health={{ ...HEALTH, status: "notConfigured" }} />)

    expect(screen.getByTestId("settings-overseerr-empty")).toHaveTextContent("Not set up.")
    expect(screen.getByRole("button", { name: "Set up Overseerr" })).toHaveAttribute("data-testid", "settings-overseerr-edit")
    expect(screen.queryByTestId("settings-overseerr-test")).not.toBeInTheDocument()
  })

  it("offers Enter it again for a key the encryption key can't read, which opens the field", async () => {
    const user = userEvent.setup()
    render(<ServiceSection type="overseerr" server={{ ...SERVER, secret: { last4: "", origin: "http://localhost:5055", unreadable: true } }} health={HEALTH} />)

    expect(screen.getByTestId("settings-overseerr-summary-secret")).toHaveTextContent("Can't be read with the current encryption key.")
    await user.click(screen.getByTestId("settings-overseerr-summary-secret-reenter"))

    expect(screen.getByTestId("settings-overseerr-secret")).toHaveFocus()
    expect(screen.getByTestId("settings-overseerr-secret")).toHaveAttribute("data-state", "reenter-required")
  })
})

describe("ServiceSection with a SecretInput", () => {
  it("shows the saved key as a masked placeholder, never as a value", async () => {
    const user = userEvent.setup()
    await renderSection(user)

    const key = screen.getByTestId("settings-overseerr-secret")
    expect(key).toHaveValue("")
    expect(key).toHaveAttribute("placeholder", "••••••••••••a91c")
    expect(screen.getByTestId("settings-overseerr-secret-saved")).toHaveTextContent("Saved")
    expect(screen.getByTestId("settings-overseerr-name")).toHaveFocus()
  })

  it("a host change disables Test and Save until a key is typed", async () => {
    const user = userEvent.setup()
    await renderSection(user)

    const url = screen.getByTestId("settings-overseerr-url")
    await user.clear(url)
    await user.type(url, "http://requests.lan:5055")

    const key = screen.getByTestId("settings-overseerr-secret")
    expect(key).toHaveAttribute("data-state", "reenter-required")
    expect(key).toBeRequired()
    expect(screen.getByTestId("settings-overseerr-secret-reenter")).toHaveTextContent("Enter it again to use it with the new address")
    expect(screen.getByTestId("settings-overseerr-test")).toBeDisabled()
    expect(screen.getByTestId("settings-overseerr-save")).toBeDisabled()
    expect(screen.getByTestId("settings-overseerr-unsaved")).toHaveTextContent("Enter the API key to test or save")

    await user.type(key, "new-key")

    expect(screen.getByTestId("settings-overseerr-test")).toBeEnabled()
    expect(screen.getByTestId("settings-overseerr-save")).toBeEnabled()
  })

  it("the same origin with a new path does not block", async () => {
    const user = userEvent.setup()
    await renderSection(user)

    await user.type(screen.getByTestId("settings-overseerr-url"), "/requests")

    expect(screen.getByTestId("settings-overseerr-secret")).toHaveAttribute("data-state", "saved")
    expect(screen.getByTestId("settings-overseerr-test")).toBeEnabled()
    expect(screen.getByTestId("settings-overseerr-save")).toBeEnabled()
  })

  it("tests the typed values and puts a failure on its field, with the fix inline", async () => {
    const user = userEvent.setup()
    jest.mocked(testServiceConnection).mockResolvedValue({ success: true, data: { status: "unreachable", code: "NOT_FOUND" } })
    await renderSection(user)

    await user.type(screen.getByTestId("settings-overseerr-url"), "/x")
    await user.click(screen.getByTestId("settings-overseerr-test"))

    expect(testServiceConnection).toHaveBeenCalledWith({ service: "overseerr", url: "http://localhost:5055/x", secret: undefined })
    expect(await screen.findByText("Check the scheme, host and port, and that the service is running.")).toBeInTheDocument()
    expect(screen.getByTestId("settings-overseerr-url")).toHaveAccessibleDescription(/Nothing answered at this address/)
  })

  it("a successful save returns to the summary, with focus on Edit", async () => {
    const user = userEvent.setup()
    jest.mocked(updateOverseerr).mockResolvedValue({ success: true, data: null })
    await renderSection(user)

    await user.type(screen.getByTestId("settings-overseerr-name"), " 2")
    await user.click(screen.getByTestId("settings-overseerr-save"))

    expect(updateOverseerr).toHaveBeenCalledWith({ name: "Requests 2", url: "http://localhost:5055", apiKey: undefined, publicUrl: undefined })
    expect(mockShowSuccess).toHaveBeenCalledWith("Overseerr settings saved")
    expect(await screen.findByTestId("settings-overseerr-summary")).toBeInTheDocument()
    expect(screen.queryByTestId("settings-overseerr-form")).not.toBeInTheDocument()
    await waitFor(() => expect(screen.getByTestId("settings-overseerr-edit")).toHaveFocus())
  })

  it("Save with nothing changed returns to the summary without saving", async () => {
    const user = userEvent.setup()
    await renderSection(user)

    const save = screen.getByTestId("settings-overseerr-save")
    expect(save).toBeEnabled()
    await user.click(save)

    expect(await screen.findByTestId("settings-overseerr-summary")).toBeInTheDocument()
    expect(updateOverseerr).not.toHaveBeenCalled()
  })

  it("shows the server's SECRET_REQUIRED on the key field, not only as a toast, and stays in edit mode", async () => {
    const user = userEvent.setup()
    const message = "Enter the API key again to use it with the new address."
    jest.mocked(updateOverseerr).mockResolvedValue({ success: false, code: "SECRET_REQUIRED", error: message, fieldErrors: { apiKey: [message] } })
    await renderSection(user)

    await user.type(screen.getByTestId("settings-overseerr-name"), " 2")
    await user.click(screen.getByTestId("settings-overseerr-save"))

    expect(await screen.findByText(message)).toBeInTheDocument()
    await waitFor(() => expect(screen.getByTestId("settings-overseerr-secret")).toHaveAttribute("aria-invalid", "true"))
    expect(mockShowError).not.toHaveBeenCalled()
    expect(screen.getByTestId("settings-overseerr-form")).toBeInTheDocument()
    expect(screen.getByTestId("settings-overseerr-editing")).toHaveTextContent("Editing")
    expect(screen.queryByTestId("settings-overseerr-summary")).not.toBeInTheDocument()
  })

  it("Cancel asks first when there are changes, and Discard clears the field errors", async () => {
    const user = userEvent.setup()
    const message = "Enter the API key again to use it with the new address."
    jest.mocked(updateOverseerr).mockResolvedValue({ success: false, code: "SECRET_REQUIRED", error: message, fieldErrors: { apiKey: [message] } })
    await renderSection(user)

    await user.type(screen.getByTestId("settings-overseerr-name"), " 2")
    await user.click(screen.getByTestId("settings-overseerr-save"))
    expect(await screen.findByText(message)).toBeInTheDocument()

    await user.click(screen.getByTestId("settings-overseerr-cancel"))
    await user.click(await screen.findByTestId("settings-overseerr-discard-dialog-confirm"))

    expect(await screen.findByTestId("settings-overseerr-summary-name")).toHaveTextContent("Requests")
    await user.click(screen.getByTestId("settings-overseerr-edit"))
    expect(screen.getByTestId("settings-overseerr-name")).toHaveValue("Requests")
    expect(screen.getByTestId("settings-overseerr-secret")).not.toHaveAttribute("aria-invalid")
    expect(screen.queryByText(message)).not.toBeInTheDocument()
  })
})

describe("ServerForm in the Other integrations Sheet", () => {
  it("has its own footer with Test, Save enabled with nothing changed, and Cancel when the Sheet passes it", () => {
    const { rerender } = render(<ServerForm type="sonarr" server={null} />)

    const form = screen.getByTestId("settings-sonarr-form")
    expect(within(form).getByTestId("settings-sonarr-test")).toBeEnabled()
    expect(within(form).getByTestId("settings-sonarr-save")).toBeEnabled()
    expect(within(form).getByTestId("settings-sonarr-secret")).toBeRequired()
    expect(within(form).queryByTestId("settings-sonarr-cancel")).not.toBeInTheDocument()

    rerender(<ServerForm type="sonarr" server={null} onCancel={jest.fn()} />)
    expect(within(form).getByRole("button", { name: "Cancel editing Sonarr" })).toHaveAttribute("data-testid", "settings-sonarr-cancel")
    expect(within(form).getByRole("button", { name: "Save changes to Sonarr" })).toHaveAttribute("type", "submit")
  })

  it("Save with nothing changed is done at once, without saving", async () => {
    const user = userEvent.setup()
    const onDone = jest.fn()
    render(<ServerForm type="sonarr" server={SERVER} onDone={onDone} />)

    await user.click(screen.getByTestId("settings-sonarr-save"))

    expect(onDone).toHaveBeenCalledTimes(1)
    expect(updateSonarr).not.toHaveBeenCalled()
  })

  it("reports its changes, and is done once a save works", async () => {
    const user = userEvent.setup()
    const onDone = jest.fn()
    const onDirtyChange = jest.fn()
    jest.mocked(updateSonarr).mockResolvedValue({ success: true, data: null })
    render(<ServerForm type="sonarr" server={SERVER} onDone={onDone} onDirtyChange={onDirtyChange} footerMeta={<span data-testid="meta">Last saved</span>} />)

    expect(onDirtyChange).toHaveBeenLastCalledWith(false)
    expect(screen.getByTestId("meta")).toBeInTheDocument()

    await user.type(screen.getByTestId("settings-sonarr-name"), " 2")
    expect(onDirtyChange).toHaveBeenLastCalledWith(true)
    expect(screen.getByTestId("settings-sonarr-unsaved")).toHaveTextContent("Unsaved changes")
    expect(screen.queryByTestId("meta")).not.toBeInTheDocument()

    await user.click(screen.getByTestId("settings-sonarr-save"))

    expect(updateSonarr).toHaveBeenCalledWith(expect.objectContaining({ name: "Requests 2" }))
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1))
    expect(mockShowSuccess).toHaveBeenCalledWith("Sonarr settings saved")
  })

  it("stays open on a failed save, focusing the field that says what is wrong", async () => {
    const user = userEvent.setup()
    const onDone = jest.fn()
    jest.mocked(updateSonarr).mockResolvedValue({ success: false, code: "VALIDATION", error: "Check the fields", fieldErrors: { url: ["Enter a URL"] } })
    render(<ServerForm type="sonarr" server={SERVER} onDone={onDone} />)

    await user.type(screen.getByTestId("settings-sonarr-url"), "/x")
    await user.click(screen.getByTestId("settings-sonarr-save"))

    expect(await screen.findByText("Enter a URL")).toBeInTheDocument()
    await waitFor(() => expect(screen.getByTestId("settings-sonarr-url")).toHaveFocus())
    expect(onDone).not.toHaveBeenCalled()
  })

  it("Cancel leaves it to the Sheet", async () => {
    const user = userEvent.setup()
    const onCancel = jest.fn()
    render(<ServerForm type="sonarr" server={SERVER} onCancel={onCancel} />)

    await user.click(screen.getByTestId("settings-sonarr-cancel"))

    expect(onCancel).toHaveBeenCalledTimes(1)
  })
})
