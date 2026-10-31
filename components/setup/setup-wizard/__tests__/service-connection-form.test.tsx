/**
 * The setup service form (P10.25): a revisited step shows the saved key,
 * a host change blocks Test and Save until the key is typed again while the
 * same origin with a new path does not, Test runs the typed values, a save
 * moves on, and Skip for now shows only on optional steps.
 */

import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { axe, toHaveNoViolations } from "jest-axe"

import { saveOverseerr, saveTautulli, skipSetupStep, testSetupConnection } from "@/actions/setup"
import { ServiceConnectionForm } from "@/components/setup/setup-wizard/service-connection-form"
import type { DevDefaults } from "@/types/setup"

jest.mock("@/actions/setup", () => ({
  savePlexServer: jest.fn(),
  saveTautulli: jest.fn(),
  saveOverseerr: jest.fn(),
  saveSonarr: jest.fn(),
  saveRadarr: jest.fn(),
  skipSetupStep: jest.fn(),
  testSetupConnection: jest.fn(),
}))

jest.mock("@/actions/admin/admin-servers", () => ({}))
jest.mock("@/actions/admin/test-connection", () => ({}))

const mockPush = jest.fn()
jest.mock("next/navigation", () => ({ useRouter: () => ({ push: mockPush, refresh: jest.fn() }) }))

const DEV: DevDefaults = {
  plex: null,
  tautulli: null,
  overseerr: null,
  sonarr: null,
  radarr: null,
  discord: null,
  chatLlmProvider: null,
  wrappedLlmProvider: null,
  llmProvider: null,
  isDevMode: false,
  autoSubmit: false,
}

const STORED = { name: "Requests", url: "http://localhost:5055", publicUrl: null, secret: { last4: "a91c", origin: "http://localhost:5055" } }

expect.extend(toHaveNoViolations)

beforeEach(() => jest.clearAllMocks())

describe("ServiceConnectionForm", () => {
  it.each([
    ["tautulli", "Find the API key in Tautulli under Settings, Web Interface."],
    ["overseerr", "Find the API key in Overseerr under Settings, General."],
    ["sonarr", "Find the API key in Sonarr under Settings, General."],
    ["radarr", "Find the API key in Radarr under Settings, General."],
  ] as const)("tells only where to find the %s key", (kind, line) => {
    render(<ServiceConnectionForm kind={kind} stored={null} devDefaults={DEV} />)

    expect(screen.getByText(line)).toBeInTheDocument()
  })

  it("shows a revisited step's key as Saved, never as a value", async () => {
    const { container } = render(<ServiceConnectionForm kind="overseerr" stored={STORED} devDefaults={DEV} />)

    const key = screen.getByTestId("setup-overseerr-secret")
    expect(key).toHaveValue("")
    expect(key).toHaveAttribute("placeholder", "••••••••••••a91c")
    expect(screen.getByTestId("setup-overseerr-secret-saved")).toHaveTextContent("Saved")
    expect(screen.getByRole("heading", { level: 1, name: "Connect Overseerr" })).toHaveFocus()
    expect(await axe(container)).toHaveNoViolations()
  })

  it("a host change blocks Test and Save until the key is typed again", async () => {
    const user = userEvent.setup()
    render(<ServiceConnectionForm kind="overseerr" stored={STORED} devDefaults={DEV} />)

    const url = screen.getByTestId("setup-overseerr-url")
    await user.clear(url)
    await user.type(url, "http://requests.lan:5055")

    expect(screen.getByTestId("setup-overseerr-secret")).toHaveAttribute("data-state", "reenter-required")
    expect(screen.getByTestId("setup-overseerr-test")).toBeDisabled()
    expect(screen.getByTestId("setup-form-submit")).toBeDisabled()

    await user.type(screen.getByTestId("setup-overseerr-secret"), "new-key")
    expect(screen.getByTestId("setup-overseerr-test")).toBeEnabled()
    expect(screen.getByTestId("setup-form-submit")).toBeEnabled()
  })

  it("the same origin with a new path keeps the saved key usable", async () => {
    const user = userEvent.setup()
    render(<ServiceConnectionForm kind="overseerr" stored={STORED} devDefaults={DEV} />)

    await user.type(screen.getByTestId("setup-overseerr-url"), "/overseerr")

    expect(screen.getByTestId("setup-overseerr-secret")).toHaveAttribute("data-state", "saved")
    expect(screen.getByTestId("setup-form-submit")).toBeEnabled()
  })

  it("tests the typed values and shows the result inline", async () => {
    const user = userEvent.setup()
    jest.mocked(testSetupConnection).mockResolvedValue({ success: true, data: { status: "unreachable", code: "NOT_FOUND" } })
    render(<ServiceConnectionForm kind="overseerr" stored={STORED} devDefaults={DEV} />)

    await user.click(screen.getByTestId("setup-overseerr-test"))

    expect(testSetupConnection).toHaveBeenCalledWith({ service: "overseerr", url: "http://localhost:5055", secret: undefined })
    expect(await screen.findByText("Nothing answered at this address", { selector: "p" })).toBeInTheDocument()
    expect(screen.getByTestId("setup-overseerr-test-result")).toHaveAttribute("role", "status")
  })

  it("saves with a blank key kept blank, then moves on", async () => {
    const user = userEvent.setup()
    jest.mocked(saveOverseerr).mockResolvedValue({ success: true, data: null })
    render(<ServiceConnectionForm kind="overseerr" stored={STORED} devDefaults={DEV} />)

    await user.click(screen.getByTestId("setup-form-submit"))

    expect(saveOverseerr).toHaveBeenCalledWith({ name: "Requests", url: "http://localhost:5055", apiKey: undefined, publicUrl: undefined })
    expect(mockPush).toHaveBeenCalledWith("/setup?step=sonarr")
  })

  it("shows a save's field error on its field", async () => {
    const user = userEvent.setup()
    jest.mocked(saveTautulli).mockResolvedValue({ success: false, code: "SECRET_REQUIRED", error: "Enter it", fieldErrors: { apiKey: ["Enter the API key again"] } })
    render(<ServiceConnectionForm kind="tautulli" stored={null} devDefaults={DEV} />)

    await user.type(screen.getByTestId("setup-tautulli-name"), "Stats")
    await user.type(screen.getByTestId("setup-tautulli-url"), "http://localhost:8181")
    await user.click(screen.getByTestId("setup-form-submit"))

    expect(await screen.findByText("Enter the API key again")).toBeInTheDocument()
    expect(mockPush).not.toHaveBeenCalled()
  })

  it("offers Skip for now on optional steps only", async () => {
    const user = userEvent.setup()
    jest.mocked(skipSetupStep).mockResolvedValue({ success: true, data: null })
    const { unmount } = render(<ServiceConnectionForm kind="tautulli" stored={null} devDefaults={DEV} />)
    expect(screen.queryByTestId("setup-skip-step")).not.toBeInTheDocument()
    expect(screen.getByText("Required")).toBeInTheDocument()
    unmount()

    render(<ServiceConnectionForm kind="overseerr" stored={null} devDefaults={DEV} />)
    expect(screen.getByText("Optional")).toBeInTheDocument()
    await user.click(screen.getByTestId("setup-skip-step"))

    expect(skipSetupStep).toHaveBeenCalledWith({ stepId: "overseerr" })
    expect(mockPush).toHaveBeenCalledWith("/setup?step=sonarr")
  })
})
