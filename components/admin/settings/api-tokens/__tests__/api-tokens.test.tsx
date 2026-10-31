/**
 * API access (docs/mcp.md): make a token with a name and an expiry and see it
 * once with the Claude Code command; each live token lists its prefix, last
 * use and expiry, and Revoke confirms first.
 */

import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { createApiToken, revokeApiToken } from "@/actions/admin/api-tokens"
import { ApiTokenForm } from "@/components/admin/settings/api-tokens/api-token-form"
import { ApiTokenList } from "@/components/admin/settings/api-tokens/api-token-list"
import { ApiAccessSection } from "@/components/admin/settings/sections/api-access-section"

jest.mock("@/actions/admin/api-tokens", () => ({ createApiToken: jest.fn(), revokeApiToken: jest.fn() }))

const mockRefresh = jest.fn()
jest.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mockRefresh }) }))

const mockShowSuccess = jest.fn()
const mockShowError = jest.fn()
jest.mock("@/components/ui/toast", () => ({ useToast: () => ({ showSuccess: mockShowSuccess, showError: mockShowError }) }))

const ENDPOINT = "https://plex.example.com/api/mcp"
const TOKEN = `pmk_${"a".repeat(43)}`

beforeEach(() => jest.clearAllMocks())

describe("ApiTokenForm", () => {
  it("makes a token and shows it once with the Claude Code command", async () => {
    const user = userEvent.setup()
    const writeText = jest.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true })
    jest.mocked(createApiToken).mockResolvedValue({ success: true, data: { id: "tok-1", token: TOKEN } })

    render(<ApiTokenForm endpoint={ENDPOINT} />)
    await user.type(screen.getByTestId("settings-api-token-name"), "Laptop")
    await user.click(screen.getByTestId("settings-api-token-create"))

    expect(createApiToken).toHaveBeenCalledWith({ name: "Laptop", expiresIn: "90d", scope: "full" })
    expect(await screen.findByTestId("settings-api-token-value")).toHaveValue(TOKEN)
    expect(screen.getByTestId("settings-api-token-command")).toHaveValue(
      `claude mcp add --transport http plex-manager ${ENDPOINT} --header "Authorization: Bearer ${TOKEN}"`
    )
    expect(screen.getByTestId("settings-api-token-name")).toHaveValue("")

    await user.click(screen.getByTestId("settings-api-token-copy"))
    expect(writeText).toHaveBeenCalledWith(TOKEN)
    expect(mockShowSuccess).toHaveBeenCalledWith("Token copied")
  })

  it("makes a read-only token when Access is Read only", async () => {
    const user = userEvent.setup()
    jest.mocked(createApiToken).mockResolvedValue({ success: true, data: { id: "tok-2", token: TOKEN } })

    render(<ApiTokenForm endpoint={ENDPOINT} />)
    await user.type(screen.getByTestId("settings-api-token-name"), "Lookups")
    await user.click(screen.getByTestId("settings-api-token-scope"))
    await user.click(await screen.findByTestId("settings-api-token-scope-read"))
    await user.click(screen.getByTestId("settings-api-token-create"))

    await waitFor(() => expect(createApiToken).toHaveBeenCalledWith({ name: "Lookups", expiresIn: "90d", scope: "read" }))
  })

  it("says when copying fails", async () => {
    const user = userEvent.setup()
    Object.defineProperty(navigator, "clipboard", { value: { writeText: jest.fn().mockRejectedValue(new Error("denied")) }, configurable: true })
    jest.mocked(createApiToken).mockResolvedValue({ success: true, data: { id: "tok-1", token: TOKEN } })

    render(<ApiTokenForm endpoint={ENDPOINT} />)
    await user.type(screen.getByTestId("settings-api-token-name"), "Laptop")
    await user.click(screen.getByTestId("settings-api-token-create"))
    await user.click(await screen.findByTestId("settings-api-token-command-copy"))

    expect(mockShowError).toHaveBeenCalledWith("Could not copy. Select it and copy it.")
  })

  it("shows a refusal and no token", async () => {
    const user = userEvent.setup()
    jest.mocked(createApiToken).mockResolvedValue({ success: false, code: "CONFLICT", error: "You have 10 tokens. Revoke one first." })

    render(<ApiTokenForm endpoint={ENDPOINT} />)
    await user.type(screen.getByTestId("settings-api-token-name"), "Laptop")
    await user.click(screen.getByTestId("settings-api-token-create"))

    expect(await screen.findByTestId("settings-api-token-error")).toHaveTextContent("You have 10 tokens. Revoke one first.")
    expect(screen.queryByTestId("settings-api-token-created")).not.toBeInTheDocument()
  })
})

describe("ApiTokenList", () => {
  const token = {
    id: "tok-1",
    name: "Laptop",
    prefix: "pmk_abcdef",
    scope: "full" as const,
    createdAt: "2026-10-01T00:00:00.000Z",
    lastUsedAt: null,
    expiresAt: "2027-01-01T00:00:00.000Z",
  }

  it("says when there are none", () => {
    render(<ApiTokenList tokens={[]} />)
    expect(screen.getByText("No tokens yet.")).toBeInTheDocument()
  })

  it("marks a read-only token", () => {
    render(<ApiTokenList tokens={[{ ...token, scope: "read" }]} />)
    expect(screen.getByTestId("settings-api-token-read-only")).toHaveTextContent("Read only")
  })

  it("lists a token by name and prefix, never used", () => {
    render(<ApiTokenList tokens={[token]} />)
    expect(screen.queryByTestId("settings-api-token-read-only")).not.toBeInTheDocument()
    const row = screen.getByTestId("settings-api-token-tok-1")
    expect(row).toHaveTextContent("Laptop")
    expect(row).toHaveTextContent("pmk_abcdef…")
    expect(row).toHaveTextContent("Last usednever")
  })

  it("revokes after a confirm", async () => {
    const user = userEvent.setup()
    jest.mocked(revokeApiToken).mockResolvedValue({ success: true, data: null })

    render(<ApiTokenList tokens={[{ ...token, lastUsedAt: "2026-10-30T00:00:00.000Z", expiresAt: null }]} />)
    await user.click(screen.getByTestId("settings-api-token-revoke-open"))
    await user.click(await screen.findByTestId("settings-api-token-revoke-confirm"))

    await waitFor(() => expect(revokeApiToken).toHaveBeenCalledWith({ tokenId: "tok-1" }))
    await waitFor(() => expect(mockShowSuccess).toHaveBeenCalledWith("Laptop revoked"))
  })
})

it("ApiAccessSection names the endpoint", () => {
  render(<ApiAccessSection tokens={[]} endpoint={ENDPOINT} />)
  expect(screen.getByText(/Personal tokens for the MCP endpoint at https:\/\/plex.example.com\/api\/mcp/)).toBeInTheDocument()
})
