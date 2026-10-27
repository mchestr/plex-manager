/**
 * The service form (P10.20, SEC-31): a changed origin blocks Test and Save
 * until a key is typed, the same origin with a new path does not, Test runs
 * the typed values, and errors show on their fields.
 */

import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { updateOverseerr } from "@/actions/admin/admin-servers"
import { testServiceConnection } from "@/actions/admin/test-connection"
import { ServiceSection } from "@/components/admin/settings/sections/service-section"
import { ServerForm } from "@/components/admin/settings/server-form"

jest.mock("@/actions/admin/admin-servers", () => ({ updateJellyfinServer: jest.fn(), updateOverseerr: jest.fn(), updatePlexServer: jest.fn(), updateRadarr: jest.fn(), updateSonarr: jest.fn(), updateTautulli: jest.fn() }))
jest.mock("@/actions/admin/test-connection", () => ({ testServiceConnection: jest.fn() }))

const mockRefresh = jest.fn()
jest.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mockRefresh }) }))

const mockShowError = jest.fn()
jest.mock("@/components/ui/toast", () => ({ useToast: () => ({ showSuccess: jest.fn(), showError: mockShowError }) }))

const SERVER = {
  name: "Requests",
  url: "http://localhost:5055",
  publicUrl: null,
  secret: { last4: "a91c", origin: "http://localhost:5055" },
}
const HEALTH = { status: "ok" as const, code: null, checkedAt: null }

function renderSection() {
  return render(<ServiceSection type="overseerr" server={SERVER} health={HEALTH} />)
}

beforeEach(() => jest.clearAllMocks())

describe("ServiceSection with a SecretInput", () => {
  it("shows the saved key as a masked placeholder, never as a value", () => {
    renderSection()

    const key = screen.getByTestId("settings-overseerr-secret")
    expect(key).toHaveValue("")
    expect(key).toHaveAttribute("placeholder", "••••••••••••a91c")
    expect(screen.getByTestId("settings-overseerr-secret-saved")).toHaveTextContent("Saved")
  })

  it("a host change disables Test and Save until a key is typed", async () => {
    const user = userEvent.setup()
    renderSection()

    const url = screen.getByTestId("settings-overseerr-url")
    await user.clear(url)
    await user.type(url, "http://requests.lan:5055")

    const key = screen.getByTestId("settings-overseerr-secret")
    expect(key).toHaveAttribute("data-state", "reenter-required")
    expect(key).toBeRequired()
    expect(screen.getByTestId("settings-overseerr-secret-reenter")).toHaveTextContent("Re-enter to use with the new address")
    expect(screen.getByTestId("settings-overseerr-test")).toBeDisabled()
    expect(screen.getByTestId("settings-overseerr-save")).toBeDisabled()
    expect(screen.getByTestId("settings-overseerr-unsaved")).toHaveTextContent("Enter the API key to test or save")

    await user.type(key, "new-key")

    expect(screen.getByTestId("settings-overseerr-test")).toBeEnabled()
    expect(screen.getByTestId("settings-overseerr-save")).toBeEnabled()
  })

  it("the same origin with a new path does not block", async () => {
    const user = userEvent.setup()
    renderSection()

    await user.type(screen.getByTestId("settings-overseerr-url"), "/requests")

    expect(screen.getByTestId("settings-overseerr-secret")).toHaveAttribute("data-state", "saved")
    expect(screen.getByTestId("settings-overseerr-test")).toBeEnabled()
    expect(screen.getByTestId("settings-overseerr-save")).toBeEnabled()
  })

  it("tests the typed values and puts a failure on its field, with the fix inline", async () => {
    const user = userEvent.setup()
    jest.mocked(testServiceConnection).mockResolvedValue({ success: true, data: { status: "unreachable", code: "NOT_FOUND" } })
    renderSection()

    await user.type(screen.getByTestId("settings-overseerr-url"), "/x")
    await user.click(screen.getByTestId("settings-overseerr-test"))

    expect(testServiceConnection).toHaveBeenCalledWith({ service: "overseerr", url: "http://localhost:5055/x", secret: undefined })
    expect(await screen.findByText("Check the scheme, host and port, and that the service is running.")).toBeInTheDocument()
    expect(screen.getByTestId("settings-overseerr-url")).toHaveAccessibleDescription(/Nothing answered at this address/)
  })

  it("shows the server's SECRET_REQUIRED on the key field, not only as a toast", async () => {
    const user = userEvent.setup()
    const message = "Enter the API key again to use it with the new address."
    jest.mocked(updateOverseerr).mockResolvedValue({ success: false, code: "SECRET_REQUIRED", error: message, fieldErrors: { apiKey: [message] } })
    renderSection()

    await user.type(screen.getByTestId("settings-overseerr-name"), " 2")
    await user.click(screen.getByTestId("settings-overseerr-save"))

    expect(await screen.findByText(message)).toBeInTheDocument()
    await waitFor(() => expect(screen.getByTestId("settings-overseerr-secret")).toHaveAttribute("aria-invalid", "true"))
    expect(mockShowError).not.toHaveBeenCalled()
  })
})

describe("ServerForm in the Other integrations Sheet", () => {
  it("has its own footer with Test and Save", () => {
    render(<ServerForm type="sonarr" server={null} />)

    const form = screen.getByTestId("settings-sonarr-form")
    expect(within(form).getByTestId("settings-sonarr-test")).toBeEnabled()
    expect(within(form).getByTestId("settings-sonarr-save")).toBeDisabled()
    expect(within(form).getByTestId("settings-sonarr-secret")).toBeRequired()
  })
})
