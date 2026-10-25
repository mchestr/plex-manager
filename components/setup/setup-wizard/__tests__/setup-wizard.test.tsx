/**
 * The setup wizard's shell (P10.25): the step on screen follows `position`
 * (the page's `?step=`, kept at or before `Setup.currentStepId`), the Stepper
 * marks passed steps done or skipped from what is configured, and a passed
 * step is a link back. The steps themselves are stubs here; each has its own
 * test.
 */

import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { SetupWizard } from "@/components/setup/setup-wizard/setup-wizard"
import type { SetupWizardData } from "@/lib/setup/wizard-data"
import type { DevDefaults, SetupPosition, SetupStepId } from "@/types/setup"

jest.mock("@/components/setup/setup-wizard/plex-connect-step", () => ({
  PlexConnectStep: () => <p data-testid="stub-step">plex</p>,
}))
jest.mock("@/components/setup/setup-wizard/service-connection-form", () => ({
  ServiceConnectionForm: ({ kind }: { kind: string }) => <p data-testid="stub-step">service {kind}</p>,
}))
jest.mock("@/components/setup/setup-wizard/llm-step", () => ({
  LLMStep: ({ purpose }: { purpose: string }) => <p data-testid="stub-step">llm {purpose}</p>,
}))
jest.mock("@/components/setup/setup-wizard/discord-step", () => ({
  DiscordStep: () => <p data-testid="stub-step">discord</p>,
}))
jest.mock("@/components/setup/setup-wizard/setup-summary", () => ({
  SetupSummary: () => <p data-testid="stub-step">summary</p>,
}))

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

const NONE: Record<SetupStepId, boolean> = {
  plex: false,
  tautulli: false,
  overseerr: false,
  sonarr: false,
  radarr: false,
  "llm-rewind": false,
  "llm-chat": false,
  discord: false,
  prometheus: false,
}

function data(configured: Partial<Record<SetupStepId, boolean>> = {}): SetupWizardData {
  return { configured: { ...NONE, ...configured }, stored: {}, plexPending: false }
}

function renderAt(position: SetupPosition, reached: SetupPosition = position, configured: Partial<Record<SetupStepId, boolean>> = {}) {
  return render(<SetupWizard position={position} reached={reached} data={data(configured)} devDefaults={DEV} />)
}

beforeEach(() => mockPush.mockClear())

describe("SetupWizard", () => {
  it.each([
    ["plex", "plex"],
    ["tautulli", "service tautulli"],
    ["overseerr", "service overseerr"],
    ["sonarr", "service sonarr"],
    ["radarr", "service radarr"],
    ["prometheus", "service prometheus"],
    ["llm-rewind", "llm wrapped"],
    ["llm-chat", "llm chat"],
    ["discord", "discord"],
    ["summary", "summary"],
  ] as const)("shows the %s step", (position, shown) => {
    renderAt(position)

    expect(screen.getByTestId("stub-step")).toHaveTextContent(shown)
  })

  it("marks passed steps done or skipped, the position current and the rest upcoming", () => {
    renderAt("sonarr", "sonarr", { plex: true, tautulli: true })

    const stepper = screen.getByTestId("setup-stepper")
    expect(stepper.querySelector('[aria-current="step"]')).toHaveTextContent("Sonarr")
    expect(screen.getByTestId("stepper-step-plex")).toBeInTheDocument()
    expect(screen.getByTestId("stepper-step-overseerr")).toBeInTheDocument()
    // Upcoming steps are not links back
    expect(screen.queryByTestId("stepper-step-radarr")).not.toBeInTheDocument()
  })

  it("keeps later steps reachable after Back, up to how far the wizard got", async () => {
    const user = userEvent.setup()
    renderAt("tautulli", "radarr", { plex: true, tautulli: true, overseerr: false, sonarr: true })

    expect(screen.getByTestId("stub-step")).toHaveTextContent("service tautulli")
    await user.click(screen.getByTestId("stepper-step-sonarr"))

    expect(mockPush).toHaveBeenCalledWith("/setup?step=sonarr")
  })

  it("navigates to a passed step chosen in the Stepper", async () => {
    const user = userEvent.setup()
    renderAt("overseerr", "overseerr", { plex: true, tautulli: true })

    await user.click(screen.getByTestId("stepper-step-plex"))

    expect(mockPush).toHaveBeenCalledWith("/setup?step=plex")
  })

  it("shows the rail under the Stepper", () => {
    render(<SetupWizard position="tautulli" reached="tautulli" data={data({ plex: true })} devDefaults={DEV} rail={<p data-testid="rail">Plex connected</p>} />)

    expect(screen.getByTestId("rail")).toBeInTheDocument()
  })
})
