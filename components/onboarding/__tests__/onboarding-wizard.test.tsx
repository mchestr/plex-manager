/**
 * Member onboarding (P10.23): steps change at once and move focus to the
 * new h1, the copy follows the member's service, Requests drops without a
 * public URL, and Discord links through the connect route.
 */

import { fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { axe, toHaveNoViolations } from "jest-axe"

import { completeOnboarding } from "@/actions/onboarding"
import { OnboardingWizard } from "@/components/onboarding/onboarding-wizard"
import { ToastProvider } from "@/components/ui/toast"
import type { OnboardingData } from "@/lib/member/onboarding"

expect.extend(toHaveNoViolations)

const mockReplace = jest.fn()
jest.mock("next/navigation", () => ({ useRouter: () => ({ replace: mockReplace }) }))
jest.mock("@/actions/onboarding", () => ({ completeOnboarding: jest.fn() }))

const PLEX: OnboardingData = {
  service: "plex",
  serverName: "Northfield Plex",
  requestsUrl: "https://requests.example.com",
  discord: { linkEnabled: true, handle: null, inviteUrl: null, supportChannelUrl: null },
  instructions: null,
  rewind: true,
}

const JELLYFIN: OnboardingData = {
  ...PLEX,
  service: "jellyfin",
  serverName: "Basement Media",
  requestsUrl: null,
  rewind: false,
}

function renderWizard(data: OnboardingData = PLEX, initialStepId?: "support") {
  return render(
    <ToastProvider>
      <OnboardingWizard data={data} initialStepId={initialStepId} />
    </ToastProvider>
  )
}

async function continueTo(user: ReturnType<typeof userEvent.setup>, stepIds: string[]) {
  for (const id of stepIds) await user.click(screen.getByTestId(`onboarding-${id}-continue`))
}

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(completeOnboarding).mockResolvedValue({ success: true, data: null })
})

describe("OnboardingWizard", () => {
  it("moves focus to each new step's h1 at once, with no timers", () => {
    // fireEvent is synchronous: the focus must already be there when it returns
    renderWizard()

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Welcome to Northfield Plex")
    expect(screen.queryByTestId("onboarding-back")).not.toBeInTheDocument()

    fireEvent.click(screen.getByTestId("onboarding-welcome-continue"))
    expect(document.activeElement).toBe(screen.getByTestId("onboarding-playback-heading"))

    fireEvent.click(screen.getByTestId("onboarding-playback-continue"))
    expect(document.activeElement).toBe(screen.getByTestId("onboarding-requests-heading"))

    fireEvent.click(screen.getByTestId("onboarding-back"))
    expect(document.activeElement).toBe(screen.getByTestId("onboarding-playback-heading"))
  })

  it("counts the steps in the stepper", async () => {
    const user = userEvent.setup()
    renderWizard()

    await user.click(screen.getByTestId("onboarding-welcome-continue"))

    const stepper = screen.getByTestId("onboarding-stepper")
    expect(stepper).toHaveTextContent("Step 2 of 5")
    expect(stepper.querySelector('[aria-current="step"]')).toHaveTextContent("Playback")
  })

  it("never says Plex to a Jellyfin member and skips Requests without a public URL", async () => {
    const user = userEvent.setup()
    const { container } = renderWizard(JELLYFIN)

    const seen: string[] = [container.textContent ?? ""]
    await continueTo(user, ["welcome"])
    seen.push(container.textContent ?? "")
    expect(screen.getByTestId("playback-guide")).toHaveTextContent("Jellyfin")

    await continueTo(user, ["playback"])
    expect(screen.getByTestId("onboarding-support-heading")).toBeInTheDocument()
    expect(screen.getByTestId("onboarding-stepper")).toHaveTextContent("Step 3 of 4")
    expect(screen.queryByText("Requests")).not.toBeInTheDocument()
    seen.push(container.textContent ?? "")

    await continueTo(user, ["support"])
    seen.push(container.textContent ?? "")

    for (const text of seen) expect(text).not.toMatch(/plex/i)
  })

  it("promises only configured features on Done", async () => {
    const user = userEvent.setup()
    renderWizard(JELLYFIN)

    await continueTo(user, ["welcome", "playback", "support"])

    expect(screen.getByTestId("onboarding-final-heading")).toHaveTextContent("You are ready to watch")
    expect(screen.queryByText("Rewind")).not.toBeInTheDocument()
    expect(screen.queryByText("Requests")).not.toBeInTheDocument()
    expect(screen.getByText("Link your account any time at /discord/link.")).toBeInTheDocument()
    expect(screen.getByText("This guide is also on the Help page.")).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/Great!|Got it!|Perfect!|Admin\s*>/)
  })

  it("links Discord through the connect route back to onboarding", () => {
    renderWizard(PLEX, "support")

    expect(screen.getByTestId("support-guide-link-discord")).toHaveAttribute(
      "href",
      "/discord/connect?redirect=%2Fonboarding"
    )
  })

  it("finishes and goes home", async () => {
    const user = userEvent.setup()
    renderWizard(PLEX, "support")

    await continueTo(user, ["support"])
    await user.click(screen.getByTestId("onboarding-final-complete"))

    expect(completeOnboarding).toHaveBeenCalledWith({ service: "plex" })
    expect(mockReplace).toHaveBeenCalledWith("/")
  })

  it("shows a completion error inline as well as in a toast", async () => {
    jest.mocked(completeOnboarding).mockResolvedValue({ success: false, code: "INTERNAL", error: "Could not save" })
    const user = userEvent.setup()
    renderWizard(PLEX, "support")

    await continueTo(user, ["support"])
    await user.click(screen.getByTestId("onboarding-final-complete"))

    expect(await screen.findByTestId("onboarding-error")).toHaveTextContent("Could not save")
    expect(screen.getAllByText("Could not save").length).toBeGreaterThanOrEqual(2)
    expect(mockReplace).not.toHaveBeenCalled()
  })

  it("has no axe violations on the illustrated steps", async () => {
    const user = userEvent.setup()
    const { container } = renderWizard()

    expect(await axe(container)).toHaveNoViolations()
    await continueTo(user, ["welcome"])
    expect(await axe(container)).toHaveNoViolations()
    await continueTo(user, ["playback"])
    expect(await axe(container)).toHaveNoViolations()
  })
})
