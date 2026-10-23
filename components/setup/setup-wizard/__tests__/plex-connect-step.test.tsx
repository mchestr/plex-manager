/**
 * Connect with Plex (P10.25, UI-03), with mocked actions: back from plex.tv
 * the step lists the account's servers, an owned one is selectable, a shared
 * one is disabled, an offline one says since when, the choice is saved, and
 * the token fallback is reachable by keyboard.
 */

import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { chooseSetupPlexServer, pollSetupPlexConnect, startSetupPlexConnect } from "@/actions/setup-plex"
import { PlexConnectStep } from "@/components/setup/setup-wizard/plex-connect-step"
import { redirectTo } from "@/lib/utils/navigation"
import type { DevDefaults, PickerServer } from "@/types/setup"

jest.mock("@/actions/setup-plex", () => ({
  startSetupPlexConnect: jest.fn(),
  pollSetupPlexConnect: jest.fn(),
  chooseSetupPlexServer: jest.fn(),
}))
jest.mock("@/actions/setup", () => ({ savePlexServer: jest.fn(), testSetupConnection: jest.fn(), skipSetupStep: jest.fn() }))
jest.mock("@/actions/admin/admin-servers", () => ({}))
jest.mock("@/actions/admin/test-connection", () => ({}))
jest.mock("@/lib/utils/navigation", () => ({ redirectTo: jest.fn() }))

const mockPush = jest.fn()
jest.mock("next/navigation", () => ({ useRouter: () => ({ push: mockPush, refresh: jest.fn() }) }))

const DEV: DevDefaults = {
  plex: null,
  tautulli: null,
  overseerr: null,
  sonarr: null,
  radarr: null,
  discord: null,
  prometheus: null,
  chatLlmProvider: null,
  wrappedLlmProvider: null,
  llmProvider: null,
  isDevMode: false,
  autoSubmit: false,
}

function server(overrides: Partial<PickerServer>): PickerServer {
  return {
    machineIdentifier: "owned-1",
    name: "Northfield Plex",
    owned: true,
    online: true,
    lastSeenAt: null,
    version: "1.41.3",
    platform: "Linux",
    connections: [
      { uri: "http://192.168.1.20:32400", local: true, relay: false },
      { uri: "https://northfield.example.com:32400", local: false, relay: false },
    ],
    ...overrides,
  }
}

const SERVERS = [
  server({}),
  server({ machineIdentifier: "shared-1", name: "Theo's Plex", owned: false }),
  server({ machineIdentifier: "offline-1", name: "Dana's laptop", online: false, lastSeenAt: "2026-10-14T12:00:00Z" }),
]

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(pollSetupPlexConnect).mockResolvedValue({ success: true, data: { status: "ready", account: { username: "dana.whitfield" }, servers: SERVERS } })
})

describe("PlexConnectStep", () => {
  it("starts the PIN flow and goes to plex.tv", async () => {
    const user = userEvent.setup()
    jest.mocked(startSetupPlexConnect).mockResolvedValue({ success: true, data: { authUrl: "https://app.plex.tv/auth#?code=abc" } })
    render(<PlexConnectStep pending={false} stored={null} devDefaults={DEV} />)

    expect(screen.getByTestId("setup-form-submit")).toBeDisabled()
    await user.click(screen.getByTestId("setup-plex-connect"))

    expect(startSetupPlexConnect).toHaveBeenCalled()
    expect(redirectTo).toHaveBeenCalledWith("https://app.plex.tv/auth#?code=abc")
  })

  it("lists the servers: owned selectable, shared disabled, offline with since when", async () => {
    render(<PlexConnectStep pending stored={null} devDefaults={DEV} />)

    expect(await screen.findByText("Signed in to Plex as dana.whitfield")).toBeInTheDocument()
    const owned = screen.getByTestId("setup-plex-server-owned-1")
    const shared = screen.getByTestId("setup-plex-server-shared-1")
    const offline = screen.getByTestId("setup-plex-server-offline-1")

    expect(owned).toHaveAttribute("role", "radio")
    expect(owned).toHaveAttribute("aria-checked", "true")
    expect(owned).not.toHaveAttribute("aria-disabled", "true")
    expect(shared).toHaveAttribute("aria-disabled", "true")
    expect(shared).toHaveTextContent("Only its owner can set it up")
    expect(offline).toHaveAttribute("aria-disabled", "true")
    expect(offline).toHaveTextContent(/Not reachable since Oct 14, 2026/)
    expect(screen.getByTestId("setup-plex-address")).toHaveTextContent("http://192.168.1.20:32400, Local, fastest")
    expect(screen.queryByTestId("setup-plex-token-disclosure")).not.toBeInTheDocument()
  })

  it("saves the chosen server and its address, then moves on", async () => {
    const user = userEvent.setup()
    jest.mocked(chooseSetupPlexServer).mockResolvedValue({ success: true, data: null })
    render(<PlexConnectStep pending stored={null} devDefaults={DEV} />)

    await screen.findByTestId("setup-plex-servers")
    await user.click(screen.getByTestId("setup-form-submit"))

    expect(chooseSetupPlexServer).toHaveBeenCalledWith({ machineIdentifier: "owned-1", uri: "http://192.168.1.20:32400" })
    expect(mockPush).toHaveBeenCalledWith("/setup?step=tautulli")
  })

  it("shows a refusal from the server", async () => {
    const user = userEvent.setup()
    jest.mocked(chooseSetupPlexServer).mockResolvedValue({ success: false, code: "FORBIDDEN", error: "Only its owner can set it up" })
    render(<PlexConnectStep pending stored={null} devDefaults={DEV} />)

    await screen.findByTestId("setup-plex-servers")
    await user.click(screen.getByTestId("setup-form-submit"))

    expect(await screen.findByTestId("setup-plex-error")).toHaveTextContent("Only its owner can set it up")
    expect(mockPush).not.toHaveBeenCalled()
  })

  it("reaches the token fallback by keyboard", async () => {
    const user = userEvent.setup()
    render(<PlexConnectStep pending={false} stored={null} devDefaults={DEV} />)

    const summary = screen.getByText("Enter a token instead")
    // Connect with Plex, then the disclosure
    await user.tab()
    await user.tab()
    expect(summary.closest("summary")).toHaveFocus()
    // jsdom gives summary no keyboard activation; a browser opens it on Enter, as on this click
    await user.click(summary)

    expect(screen.getByTestId("setup-plex-token-disclosure")).toHaveAttribute("open")
    expect(screen.getByTestId("setup-plex-url")).toBeVisible()
    expect(screen.getByTestId("setup-plex-secret")).toBeVisible()
  })
})
