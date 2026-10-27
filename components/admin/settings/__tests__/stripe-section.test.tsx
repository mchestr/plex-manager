/**
 * Stripe billing (P10.20): the Subscriptions switch and its one
 * prerequisite Alert stay live in both modes and save at once; the keys,
 * price ids and libraries show as a summary until Edit swaps in the form,
 * where the keys are SecretInputs in the saved state and fields show errors
 * only after a save attempt. The Plex libraries arrive as the page's promise
 * (P10.7), never from a mount effect.
 */

import { act, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { setStripeEnabled, updateStripeSettings } from "@/actions/admin/admin-config"
import type { StripeConfigStatus } from "@/types/admin"
import { StripeSection } from "@/components/admin/settings/sections/stripe-section"
import type { LibraryListing } from "@/types/invite"

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

const LIBRARIES: Promise<LibraryListing> = Promise.resolve({
  ok: true as const,
  libraries: [
    { id: "1", name: "Movies", type: "movie" },
    { id: "2", name: "TV Shows", type: "show" },
  ],
})

async function renderSection(config: StripeConfigStatus = EMPTY, libraries: Promise<LibraryListing> = LIBRARIES) {
  await act(async () => {
    render(<StripeSection config={config} libraries={libraries} health={HEALTH} />)
  })
}

const summaryRow = (key: string) => screen.getByTestId(`settings-stripe-summary-${key}`)

async function edit(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByTestId("settings-stripe-edit"))
}

beforeEach(() => {
  jest.clearAllMocks()
})

describe("StripeSection", () => {
  describe("the live switch", () => {
    it("keeps the switch off and names every missing prerequisite in one Alert", async () => {
      await renderSection()

      expect(screen.getByTestId("stripe-enabled-toggle")).toBeDisabled()
      expect(screen.getByTestId("stripe-enable-requirements")).toHaveTextContent(
        "Save a secret key, a webhook signing secret, at least one price ID first."
      )
    })

    it("sits outside the form in both modes, and says it takes effect at once", async () => {
      const user = userEvent.setup()
      await renderSection(READY)

      const live = screen.getByTestId("stripe-settings-form")
      expect(live).toContainElement(screen.getByTestId("stripe-enabled-toggle"))
      expect(screen.getByRole("switch", { name: "Subscriptions" })).toHaveAccessibleDescription(/Takes effect at once\.$/)

      await edit(user)
      expect(screen.getByTestId("settings-stripe-form")).not.toContainElement(screen.getByTestId("stripe-enabled-toggle"))
      expect(screen.getByTestId("stripe-settings-form")).toBeInTheDocument()
    })

    it("turns subscriptions on from view mode once every prerequisite is saved", async () => {
      const user = userEvent.setup()
      jest.mocked(setStripeEnabled).mockResolvedValue({ success: true, data: { status: "saved" } })
      await renderSection(READY)

      expect(screen.queryByTestId("stripe-enable-requirements")).not.toBeInTheDocument()
      await user.click(screen.getByTestId("stripe-enabled-toggle"))
      expect(setStripeEnabled).toHaveBeenCalledWith(true)
      await waitFor(() => expect(mockShowSuccess).toHaveBeenCalledWith("Subscriptions turned on"))
      expect(screen.queryByTestId("settings-stripe-form")).not.toBeInTheDocument()
    })

    it("lists the Jellyfin-only members first, and turns subscriptions on once confirmed (P11.11)", async () => {
      const user = userEvent.setup()
      jest
        .mocked(setStripeEnabled)
        .mockResolvedValueOnce({ success: true, data: { status: "confirm", jellyfinMembers: { count: 3, names: ["Ana", "Ben"] } } })
        .mockResolvedValueOnce({ success: true, data: { status: "saved" } })
      await renderSection(READY)

      await user.click(screen.getByTestId("stripe-enabled-toggle"))
      const dialog = await screen.findByTestId("stripe-enable-jellyfin-confirm")
      expect(dialog).toHaveTextContent("3 Jellyfin members will be asked to subscribe")
      expect(dialog).toHaveTextContent("Ana, Ben and 1 more sign in with Jellyfin only")
      expect(mockShowSuccess).not.toHaveBeenCalled()

      await user.click(screen.getByTestId("stripe-enable-jellyfin-confirm-button"))
      expect(setStripeEnabled).toHaveBeenLastCalledWith({ enabled: true, confirmJellyfinMembers: true })
      await waitFor(() => expect(mockShowSuccess).toHaveBeenCalledWith("Subscriptions turned on"))
    })
  })

  describe("view mode", () => {
    it("says Not set up, with Set up, while nothing is saved", async () => {
      await renderSection()

      expect(screen.getByTestId("settings-stripe-empty")).toHaveTextContent("Not set up.")
      expect(screen.getByRole("button", { name: "Set up Stripe billing" })).toBeInTheDocument()
      expect(screen.queryByTestId("settings-stripe-summary")).not.toBeInTheDocument()
    })

    it("summarises the saved settings without any field, and never shows a key", async () => {
      await renderSection(READY)

      expect(screen.getByRole("button", { name: "Edit Stripe billing" })).toBeInTheDocument()
      expect(summaryRow("secret-key")).toHaveTextContent("Saved, ends in 3kQ2")
      expect(summaryRow("webhook-secret")).toHaveTextContent("Saved, ends in x9Zp")
      expect(within(summaryRow("price-ids")).getByRole("listitem")).toHaveTextContent("price_123")
      expect(within(summaryRow("price-ids")).getByRole("list").closest("dd")).toHaveClass("font-mono")
      expect(summaryRow("libraries")).toHaveTextContent("All libraries")
      // View mode never reuses an input's test id
      for (const id of ["stripe-secret-key-input", "stripe-webhook-secret-input", "stripe-price-ids-input", "stripe-library-access"]) {
        expect(screen.queryByTestId(id)).not.toBeInTheDocument()
      }
      expect(screen.queryByRole("textbox")).not.toBeInTheDocument()
      expect(screen.queryByRole("checkbox")).not.toBeInTheDocument()
    })

    it("says Not set for a missing key and None for no price ids", async () => {
      await renderSection({ ...EMPTY, hasSecretKey: true, saved: { secretKey: { last4: "", origin: null }, webhookSecret: null } })

      expect(summaryRow("secret-key")).toHaveTextContent(/^Secret keySaved$/)
      expect(summaryRow("webhook-secret")).toHaveTextContent(/^Webhook signing secretNot set$/)
      expect(summaryRow("price-ids")).toHaveTextContent(/^Price IDsNone$/)
      expect(within(summaryRow("price-ids")).getByText("None").closest("dd")).not.toHaveClass("font-mono")
    })

    it("names the chosen libraries once the listing arrives, counting any Plex no longer has", async () => {
      const { unmount } = await renderWithIds([2, 1])
      expect(await within(summaryRow("libraries")).findByText("Movies, TV Shows")).toBeInTheDocument()
      unmount()

      await renderWithIds([1, 9])
      expect(await within(summaryRow("libraries")).findByText("Movies and 1 library no longer in Plex")).toBeInTheDocument()

      async function renderWithIds(ids: number[]) {
        let result!: ReturnType<typeof render>
        await act(async () => {
          result = render(<StripeSection config={{ ...READY, librarySectionIds: ids }} libraries={LIBRARIES} health={HEALTH} />)
        })
        return result
      }
    })

    it("counts the libraries while the listing loads, and when it fails", async () => {
      const pending = new Promise<LibraryListing>(() => {})
      let result!: ReturnType<typeof render>
      await act(async () => {
        result = render(<StripeSection config={{ ...READY, librarySectionIds: [1, 2] }} libraries={pending} health={HEALTH} />)
      })
      expect(summaryRow("libraries")).toHaveTextContent("2 libraries")
      result.unmount()

      await renderSection({ ...READY, librarySectionIds: [1] }, Promise.resolve({ ok: false, reason: "Plex is unreachable" }))
      expect(summaryRow("libraries")).toHaveTextContent(/^Subscriber library access1 library$/)
    })

    it("offers to enter an unreadable key again, opening the form on that field", async () => {
      const user = userEvent.setup()
      // An unreadable key reads as null, so the server reports it missing (P11.1)
      await renderSection({ ...READY, hasWebhookSecret: false, saved: { ...READY.saved, webhookSecret: { last4: "", origin: null, unreadable: true } } })

      expect(summaryRow("webhook-secret")).toHaveTextContent("Can't be read with the current encryption key.")
      await user.click(screen.getByTestId("settings-stripe-summary-webhook-secret-reenter"))

      expect(screen.getByTestId("settings-stripe-form")).toBeInTheDocument()
      await waitFor(() => expect(screen.getByTestId("stripe-webhook-secret-input")).toHaveFocus())
    })

    it("counts keys no encryption key can read as saved, so they are not hidden behind Not set up", async () => {
      const unreadable = { last4: "", origin: null, unreadable: true }
      await renderSection({ ...EMPTY, saved: { secretKey: unreadable, webhookSecret: unreadable } })

      expect(screen.queryByTestId("settings-stripe-empty")).not.toBeInTheDocument()
      expect(screen.getByRole("button", { name: "Edit Stripe billing" })).toBeInTheDocument()
      expect(summaryRow("secret-key")).toHaveTextContent("Can't be read with the current encryption key.")
      expect(screen.getByTestId("settings-stripe-summary-secret-key-reenter")).toBeInTheDocument()
      expect(screen.getByTestId("settings-stripe-summary-webhook-secret-reenter")).toBeInTheDocument()
    })
  })

  describe("edit mode", () => {
    it("shows no field errors before a save attempt, and focuses the secret key", async () => {
      const user = userEvent.setup()
      await renderSection()

      await edit(user)

      for (const id of ["stripe-secret-key-input", "stripe-webhook-secret-input", "stripe-price-ids-input"]) {
        expect(screen.getByTestId(id)).not.toHaveAttribute("aria-invalid", "true")
      }
      expect(screen.getByTestId("stripe-webhook-secret-input")).toHaveAccessibleDescription(/Required before subscriptions can be turned on/)
      expect(await screen.findByTestId("stripe-library-checkbox-1")).toBeInTheDocument()
      await waitFor(() => expect(screen.getByTestId("stripe-secret-key-input")).toHaveFocus())
    })

    it("shows the saved keys as masked placeholders, never as values", async () => {
      const user = userEvent.setup()
      await renderSection(READY)

      await edit(user)

      expect(screen.getByTestId("stripe-secret-key-input")).toHaveAttribute("placeholder", "••••••••••••3kQ2")
      expect(screen.getByTestId("stripe-secret-key-input")).toHaveValue("")
      expect(screen.getByTestId("stripe-price-ids-input")).toHaveValue("price_123")
    })

    it("closes on a Save with nothing changed, without calling the server", async () => {
      const user = userEvent.setup()
      await renderSection(READY)

      await edit(user)
      await user.click(screen.getByTestId("settings-stripe-save"))

      expect(updateStripeSettings).not.toHaveBeenCalled()
      expect(screen.getByTestId("settings-stripe-summary")).toBeInTheDocument()
    })

    it("saves through the footer, omitting blank keys, and returns to the summary", async () => {
      const user = userEvent.setup()
      jest.mocked(updateStripeSettings).mockResolvedValue({ success: true, data: null })
      await renderSection(READY)

      await edit(user)
      await user.type(screen.getByTestId("stripe-secret-key-input"), "sk_test_new")
      await user.click(screen.getByTestId("settings-stripe-save"))

      expect(updateStripeSettings).toHaveBeenCalledWith({
        secretKey: "sk_test_new",
        webhookSecret: undefined,
        priceIds: ["price_123"],
        librarySectionIds: [],
      })
      expect(mockShowSuccess).toHaveBeenCalledWith("Stripe settings saved")
      expect(await screen.findByTestId("settings-stripe-summary")).toBeInTheDocument()
      await waitFor(() => expect(screen.getByTestId("settings-stripe-edit")).toHaveFocus())
    })

    it("stays open on a refused save with the error on its field, and Cancel clears it", async () => {
      const user = userEvent.setup()
      jest.mocked(updateStripeSettings).mockResolvedValue({
        success: false,
        code: "VALIDATION",
        error: "Too small",
        fieldErrors: { secretKey: ["Too small"] },
      })
      await renderSection(READY)

      await edit(user)
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
      expect(screen.getByTestId("settings-stripe-editing")).toBeInTheDocument()
      expect(mockShowError).not.toHaveBeenCalled()

      // The error shows inside the save's transition; Cancel waits for it to settle
      const cancel = screen.getByTestId("settings-stripe-cancel")
      await waitFor(() => expect(cancel).toBeEnabled())
      await user.click(cancel)
      await user.click(await screen.findByTestId("settings-stripe-discard-dialog-confirm"))
      expect(await screen.findByTestId("settings-stripe-summary")).toBeInTheDocument()

      await edit(user)
      expect(screen.getByTestId("stripe-price-ids-input")).toHaveValue("price_123")
      expect(screen.queryByText("Too small")).not.toBeInTheDocument()
      expect(screen.getByTestId("stripe-secret-key-input")).not.toHaveAttribute("aria-invalid", "true")
    })

    it("shows a refused library selection on the library fieldset, and stays open", async () => {
      const user = userEvent.setup()
      jest.mocked(updateStripeSettings).mockResolvedValue({
        success: false,
        code: "VALIDATION",
        error: "Invalid input",
        fieldErrors: { librarySectionIds: ["Pick libraries Plex still lists"] },
      })
      await renderSection(READY)

      await edit(user)
      await user.click(await screen.findByTestId("stripe-library-checkbox-2"))
      await user.click(screen.getByTestId("settings-stripe-save"))

      expect(await screen.findByTestId("stripe-library-access-error")).toHaveTextContent("Pick libraries Plex still lists")
      expect(screen.getByTestId("stripe-library-access")).toContainElement(screen.getByTestId("stripe-library-access-error"))
      expect(screen.getByTestId("settings-stripe-editing")).toBeInTheDocument()
      expect(mockShowError).not.toHaveBeenCalled()

      // Changing the selection clears it, once the save has settled and the checkboxes are enabled again
      const movies = screen.getByTestId("stripe-library-checkbox-1")
      await waitFor(() => expect(movies).not.toHaveAttribute("data-disabled"))
      await user.click(movies)
      expect(screen.queryByTestId("stripe-library-access-error")).not.toBeInTheDocument()
    })

    it("toasts a failure no field explains, and stays open", async () => {
      const user = userEvent.setup()
      jest.mocked(updateStripeSettings).mockResolvedValue({ success: false, code: "INTERNAL", error: "Could not save the Stripe settings" })
      await renderSection(READY)

      await edit(user)
      await user.type(screen.getByTestId("stripe-webhook-secret-input"), "whsec_new")
      await user.click(screen.getByTestId("settings-stripe-save"))

      await waitFor(() => expect(mockShowError).toHaveBeenCalledWith("Could not save the Stripe settings"))
      expect(screen.getByTestId("settings-stripe-form")).toBeInTheDocument()
      expect(screen.getByTestId("stripe-webhook-secret-input")).toHaveValue("whsec_new")
    })
  })
})
