/**
 * Stripe billing (P10.20): the Subscriptions switch waits for its
 * prerequisites, one Alert names them, the keys are SecretInputs in the
 * saved state, and fields show errors only after a save attempt. The Plex
 * libraries arrive as the page's promise (P10.7), never from a mount effect.
 */

import { act, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { setStripeEnabled, updateStripeSettings } from "@/actions/admin/admin-config"
import type { StripeConfigStatus } from "@/types/admin"
import { StripeSection } from "@/components/admin/settings/sections/stripe-section"

jest.mock("@/actions/admin/admin-config", () => ({ updateStripeSettings: jest.fn(), setStripeEnabled: jest.fn() }))

const mockShowSuccess = jest.fn()
const mockShowError = jest.fn()
jest.mock("@/components/ui/toast", () => ({ useToast: () => ({ showSuccess: mockShowSuccess, showError: mockShowError }) }))

const EMPTY: StripeConfigStatus = {
  enabled: false,
  hasSecretKey: false,
  hasWebhookSecret: false,
  saved: { secretKey: null, webhookSecret: null },
  hasJobQueue: true,
  priceIds: [],
  librarySectionIds: [],
}
const READY: StripeConfigStatus = {
  ...EMPTY,
  hasSecretKey: true,
  hasWebhookSecret: true,
  saved: { secretKey: { last4: "3kQ2", origin: null }, webhookSecret: { last4: "x9Zp", origin: null } },
  priceIds: ["price_123"],
}
const HEALTH = { status: "disabled" as const, code: null, checkedAt: null }

const LIBRARIES = Promise.resolve({ ok: true as const, libraries: [{ id: "1", name: "Movies", type: "movie" }] })

async function renderSection(config: StripeConfigStatus = EMPTY) {
  await act(async () => {
    render(<StripeSection config={config} libraries={LIBRARIES} health={HEALTH} />)
  })
}

beforeEach(() => {
  jest.clearAllMocks()
})

describe("StripeSection", () => {
  it("keeps the switch off and names every missing prerequisite in one Alert", async () => {
    await renderSection()

    expect(screen.getByTestId("stripe-enabled-toggle")).toBeDisabled()
    expect(screen.getByTestId("stripe-enable-requirements")).toHaveTextContent(
      "Save a secret key, a webhook signing secret, at least one price ID first."
    )
    expect(await screen.findByTestId("stripe-library-checkbox-1")).toBeInTheDocument()
  })

  it("shows no field errors before a save attempt", async () => {
    await renderSection()

    for (const id of ["stripe-secret-key-input", "stripe-webhook-secret-input", "stripe-price-ids-input"]) {
      expect(screen.getByTestId(id)).not.toHaveAttribute("aria-invalid", "true")
    }
    expect(screen.getByTestId("stripe-webhook-secret-input")).toHaveAccessibleDescription(/Required before subscriptions can be turned on/)
  })

  it("shows the saved keys as masked placeholders, and the switch is live once all are saved", async () => {
    const user = userEvent.setup()
    jest.mocked(setStripeEnabled).mockResolvedValue({ success: true, data: null })
    await renderSection(READY)

    expect(screen.getByTestId("stripe-secret-key-input")).toHaveAttribute("placeholder", "••••••••••••3kQ2")
    expect(screen.getByTestId("stripe-secret-key-input")).toHaveValue("")
    expect(screen.queryByTestId("stripe-enable-requirements")).not.toBeInTheDocument()

    await user.click(screen.getByTestId("stripe-enabled-toggle"))
    expect(setStripeEnabled).toHaveBeenCalledWith(true)
    await waitFor(() => expect(mockShowSuccess).toHaveBeenCalledWith("Subscriptions turned on"))
  })

  it("saves through the footer, omitting blank keys, and puts a refused field's error on it", async () => {
    const user = userEvent.setup()
    jest.mocked(updateStripeSettings).mockResolvedValue({
      success: false,
      code: "VALIDATION",
      error: "Too small",
      fieldErrors: { secretKey: ["Too small"] },
    })
    await renderSection(READY)

    await user.type(screen.getByTestId("stripe-price-ids-input"), "\nprice_456")
    await user.click(await screen.findByTestId("stripe-library-checkbox-1"))
    await user.click(screen.getByTestId("settings-stripe-save"))

    expect(updateStripeSettings).toHaveBeenCalledWith({
      secretKey: undefined,
      webhookSecret: undefined,
      priceIds: ["price_123", "price_456"],
      librarySectionIds: [1],
    })
    expect(await screen.findByText("Too small")).toBeInTheDocument()
    // Base UI Field can mark the control invalid after the error text renders
    await waitFor(() => expect(screen.getByTestId("stripe-secret-key-input")).toHaveAttribute("aria-invalid", "true"))
    expect(mockShowError).not.toHaveBeenCalled()
  })
})
