/**
 * The Security section (P11.1): the encryption status, unreadable fields,
 * and "Encrypt stored secrets": a dry run with counts, then the confirmed run.
 */

import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { reencryptStoredSecrets } from "@/actions/admin/encryption"
import { SecuritySection } from "@/components/admin/settings/sections/security-section"

jest.mock("@/actions/admin/encryption", () => ({ reencryptStoredSecrets: jest.fn() }))

const mockShowSuccess = jest.fn()
const mockShowError = jest.fn()
jest.mock("@/components/ui/toast", () => ({ useToast: () => ({ showSuccess: mockShowSuccess, showError: mockShowError }) }))

const ON = { configured: true, primaryKid: "k2", unreadable: [] }
const counts = (overrides: Partial<{ dryRun: boolean; plaintext: number; otherKid: number; unreadable: number; rewritten: number }> = {}) => ({
  success: true as const,
  data: { dryRun: true, primaryKid: "k2", plaintext: 3, otherKid: 2, unreadable: 0, rewritten: 0, ...overrides },
})

beforeEach(() => jest.clearAllMocks())

describe("SecuritySection", () => {
  it("shows the primary kid, and no button or alert while nothing is wrong", () => {
    render(<SecuritySection status={ON} />)
    expect(screen.getByTestId("settings-security-status")).toHaveTextContent("Encryption is on. New values use the key k2.")
    expect(screen.queryByTestId("settings-security-unreadable")).not.toBeInTheDocument()
  })

  it("says encryption is off without a key and offers no run", () => {
    render(<SecuritySection status={{ configured: false, primaryKid: null, unreadable: [] }} />)
    expect(screen.getByTestId("settings-security-status")).toHaveTextContent("Encryption is off.")
    expect(screen.queryByTestId("settings-reencrypt-button")).not.toBeInTheDocument()
  })

  it("lists unreadable fields with their kid", () => {
    render(
      <SecuritySection
        status={{ ...ON, unreadable: [{ model: "Tautulli", field: "apiKey", kid: "k1", code: "KEY_UNKNOWN", rows: 1 }] }}
      />
    )
    expect(screen.getByTestId("settings-security-unreadable")).toHaveTextContent("Tautulli API key (key k1)")
  })

  it("counts first, then encrypts after the confirm", async () => {
    const user = userEvent.setup()
    jest.mocked(reencryptStoredSecrets).mockResolvedValueOnce(counts()).mockResolvedValueOnce(counts({ dryRun: false, rewritten: 5 }))
    render(<SecuritySection status={ON} />)

    await user.click(screen.getByTestId("settings-reencrypt-button"))
    expect(reencryptStoredSecrets).toHaveBeenNthCalledWith(1, { dryRun: true })
    expect(screen.getByTestId("settings-security-plaintext")).toHaveTextContent("3 values are in plain text and 2 are under an older key.")
    expect(await screen.findByText("Encrypt 5 stored values?")).toBeInTheDocument()

    await user.click(screen.getByTestId("settings-reencrypt-confirm"))
    expect(reencryptStoredSecrets).toHaveBeenNthCalledWith(2, { dryRun: false })
    expect(mockShowSuccess).toHaveBeenCalledWith("Encrypted 5 stored values with key k2.")
    expect(screen.getByTestId("settings-security-plaintext")).toHaveTextContent("Every stored value is under this key.")
  })

  it("does not ask to confirm when nothing is due", async () => {
    const user = userEvent.setup()
    jest.mocked(reencryptStoredSecrets).mockResolvedValueOnce(counts({ plaintext: 0, otherKid: 0 }))
    render(<SecuritySection status={ON} />)

    await user.click(screen.getByTestId("settings-reencrypt-button"))
    expect(mockShowSuccess).toHaveBeenCalledWith("Every stored value already uses the key k2.")
    expect(reencryptStoredSecrets).toHaveBeenCalledTimes(1)
  })

  it("shows a failed dry run as an error", async () => {
    const user = userEvent.setup()
    jest.mocked(reencryptStoredSecrets).mockResolvedValueOnce({ success: false, code: "CONFLICT", error: "No encryption key is set." })
    render(<SecuritySection status={ON} />)

    await user.click(screen.getByTestId("settings-reencrypt-button"))
    expect(mockShowError).toHaveBeenCalledWith("No encryption key is set.")
  })
})
