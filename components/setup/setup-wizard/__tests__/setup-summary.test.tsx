/**
 * The setup summary (P10.25, P11.32): it lists what is connected and what was
 * skipped, and "Open admin" completes setup (ending the claim) before it
 * starts the owner's Plex sign-in; either failure is shown inline and leaves
 * the button usable.
 */

import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { completeSetup } from "@/actions/setup"
import { SetupSummary } from "@/components/setup/setup-wizard/setup-summary"
import { startPlexSignIn } from "@/lib/plex-auth"
import { redirectTo } from "@/lib/utils/navigation"
import type { SetupStepId } from "@/types/setup"

jest.mock("@/actions/setup", () => ({ completeSetup: jest.fn(), skipSetupStep: jest.fn() }))
jest.mock("@/lib/plex-auth", () => ({ startPlexSignIn: jest.fn() }))
jest.mock("@/lib/utils/navigation", () => ({ redirectTo: jest.fn() }))

const mockPush = jest.fn()
jest.mock("next/navigation", () => ({ useRouter: () => ({ push: mockPush, refresh: jest.fn() }) }))

const ALL: Record<SetupStepId, boolean> = {
  plex: true,
  tautulli: true,
  overseerr: true,
  sonarr: true,
  radarr: true,
  "llm-rewind": true,
  "llm-chat": true,
  discord: true,
}

beforeEach(() => jest.clearAllMocks())

describe("SetupSummary", () => {
  it("lists connected and skipped steps", () => {
    render(<SetupSummary configured={{ ...ALL, sonarr: false, discord: false }} />)

    const connected = within(screen.getByTestId("setup-summary-connected"))
    expect(connected.getByText("Plex server")).toBeInTheDocument()
    expect(connected.queryByText("Sonarr")).not.toBeInTheDocument()
    const skipped = within(screen.getByTestId("setup-summary-skipped"))
    expect(skipped.getAllByRole("listitem").map((item) => item.textContent)).toEqual(["Sonarr", "Discord"])
    expect(screen.queryByTestId("setup-skip-step")).not.toBeInTheDocument()
  })

  it("says nothing was skipped when every step is set up", () => {
    render(<SetupSummary configured={ALL} />)

    expect(screen.queryByTestId("setup-summary-skipped")).not.toBeInTheDocument()
    expect(screen.getByText("Nothing. Every integration is set up.")).toBeInTheDocument()
  })

  it("completes setup, then signs the owner in with Plex towards /admin", async () => {
    const user = userEvent.setup()
    jest.mocked(completeSetup).mockResolvedValue({ success: true, data: null })
    jest.mocked(startPlexSignIn).mockResolvedValue({ success: true, data: { authUrl: "https://app.plex.tv/auth#?code=x" } })
    render(<SetupSummary configured={ALL} />)

    await user.click(screen.getByTestId("setup-open-admin"))

    expect(completeSetup).toHaveBeenCalledTimes(1)
    expect(startPlexSignIn).toHaveBeenCalledWith({ callbackPath: "/admin" })
    expect(redirectTo).toHaveBeenCalledWith("https://app.plex.tv/auth#?code=x")
  })

  it("shows a failed completion and never starts the sign-in", async () => {
    const user = userEvent.setup()
    jest.mocked(completeSetup).mockResolvedValue({ success: false, code: "INTERNAL", error: "Failed to finish setup" })
    render(<SetupSummary configured={ALL} />)

    await user.click(screen.getByTestId("setup-open-admin"))

    expect(screen.getByTestId("setup-summary-error")).toHaveTextContent("Failed to finish setup")
    expect(startPlexSignIn).not.toHaveBeenCalled()
    expect(screen.getByTestId("setup-open-admin")).toBeEnabled()
  })

  it("points to the home page when Plex does not answer", async () => {
    const user = userEvent.setup()
    jest.mocked(completeSetup).mockResolvedValue({ success: true, data: null })
    jest.mocked(startPlexSignIn).mockResolvedValue({ success: false, code: "UPSTREAM_UNAVAILABLE", error: "unavailable" })
    render(<SetupSummary configured={ALL} />)

    await user.click(screen.getByTestId("setup-open-admin"))

    expect(screen.getByTestId("setup-summary-error")).toHaveTextContent("Sign in from the home page.")
    expect(redirectTo).not.toHaveBeenCalled()
  })

  it("goes Back to the last step", async () => {
    const user = userEvent.setup()
    render(<SetupSummary configured={ALL} />)

    await user.click(screen.getByTestId("setup-back"))

    expect(mockPush).toHaveBeenCalledWith("/setup?step=discord")
  })
})
