/**
 * The claim step (P10.25, SEC-30): the code field's attributes, P11.32's test
 * ids, a wrong code's error, and a claim that refreshes into the wizard.
 */

import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { claimServer } from "@/actions/setup-claim"
import { SetupClaimStep } from "@/components/setup/setup-claim-step"

jest.mock("@/actions/setup-claim", () => ({ claimServer: jest.fn() }))

const mockRefresh = jest.fn()
jest.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mockRefresh, push: jest.fn() }) }))

beforeEach(() => jest.clearAllMocks())

describe("SetupClaimStep", () => {
  it("asks for the setup code in a mono one-time-code field", () => {
    render(<SetupClaimStep />)

    expect(screen.getByTestId("setup-claim-form")).toBeInTheDocument()
    expect(screen.getByRole("heading", { level: 1, name: "Claim this server" })).toHaveFocus()
    const field = screen.getByLabelText("Setup code")
    expect(field).toBe(screen.getByTestId("setup-claim-code-input"))
    expect(field).toHaveAttribute("autocomplete", "one-time-code")
    expect(field).toHaveAttribute("spellcheck", "false")
    expect(field).toHaveClass("font-mono")
    expect(field).toHaveAccessibleDescription(/docker logs plex-manager/)
    expect(screen.getByRole("heading", { name: "What happens next" })).toBeInTheDocument()
  })

  it("shows a wrong code's error and stays on the claim", async () => {
    const user = userEvent.setup()
    jest.mocked(claimServer).mockResolvedValue({ success: false, code: "VALIDATION", error: "That code doesn't match." })
    render(<SetupClaimStep />)

    await user.type(screen.getByTestId("setup-claim-code-input"), "K7QM-4WZD-P2HX")
    await user.click(screen.getByTestId("setup-claim-submit"))

    expect(claimServer).toHaveBeenCalledWith({ code: "K7QM-4WZD-P2HX" })
    expect(await screen.findByTestId("setup-claim-error")).toHaveTextContent("That code doesn't match.")
    expect(mockRefresh).not.toHaveBeenCalled()
  })

  it("refreshes into the wizard once claimed", async () => {
    const user = userEvent.setup()
    jest.mocked(claimServer).mockResolvedValue({ success: true, data: null })
    render(<SetupClaimStep />)

    await user.type(screen.getByTestId("setup-claim-code-input"), "e2e-setup-token-0123456789")
    await user.click(screen.getByTestId("setup-claim-submit"))

    expect(mockRefresh).toHaveBeenCalled()
    expect(screen.queryByTestId("setup-claim-error")).not.toBeInTheDocument()
  })
})
