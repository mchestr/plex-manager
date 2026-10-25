/**
 * The Discord section (P10.20, 5.6): "Linked roles" and "Support bot" rows,
 * each with a Switch and its own badge, no section badge, saved-only
 * SecretInputs and a read-only Portal URL with a copy button.
 */

import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { updateDiscordIntegrationSettings } from "@/actions/discord"
import { DiscordSection } from "@/components/admin/settings/sections/discord-section"

jest.mock("@/actions/discord", () => ({ updateDiscordIntegrationSettings: jest.fn() }))

const mockRefresh = jest.fn()
jest.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mockRefresh }) }))

const mockShowSuccess = jest.fn()
jest.mock("@/components/ui/toast", () => ({ useToast: () => ({ showSuccess: mockShowSuccess, showError: jest.fn() }) }))

const NOW = "2027-01-18T10:00:00.000Z"
const INTEGRATION = {
  isEnabled: true,
  botEnabled: true,
  clientId: "1234",
  secrets: { clientSecret: { last4: "Qx7d", origin: null }, botToken: { last4: "", origin: null } },
  supportChannelId: null,
  supportThreadIds: [],
  guildId: null,
  serverInviteCode: null,
  platformName: "Plex Wrapped",
  instructions: null,
}

function renderSection(state: Partial<Parameters<typeof DiscordSection>[0]["state"]> = {}) {
  return render(
    <DiscordSection
      integration={INTEGRATION}
      linkedCount={3}
      portalUrl="https://plex.example.com/discord/link"
      now={NOW}
      state={{
        isEnabled: true,
        hasClientCredentials: true,
        botEnabled: true,
        hasBotToken: true,
        lastRenewedAt: new Date("2027-01-18T09:59:30.000Z"),
        ...state,
      }}
    />
  )
}

beforeEach(() => jest.clearAllMocks())

describe("DiscordSection", () => {
  it("shows two rows with stable switch labels and their own badges, and no section badge", () => {
    renderSection()

    expect(screen.getByRole("switch", { name: "Linked roles" })).toHaveAttribute("aria-checked", "true")
    expect(screen.getByRole("switch", { name: "Support bot" })).toHaveAttribute("aria-checked", "true")
    expect(screen.getByTestId("settings-discord-linked-roles-status")).toHaveTextContent("On")
    expect(screen.getByTestId("settings-discord-support-bot-status")).toHaveTextContent("Online")
    expect(screen.getByTestId("settings-discord-rows")).toBeInTheDocument()
    expect(screen.queryByTestId("settings-discord-status")).not.toBeInTheDocument()
    expect(within(screen.getByTestId("settings-discord-section")).queryByText("Connected")).not.toBeInTheDocument()
  })

  it("reads each row on its own: a stale lease turns only the bot Offline", () => {
    renderSection({ lastRenewedAt: new Date("2027-01-18T09:50:00.000Z") })

    expect(screen.getByTestId("settings-discord-linked-roles-status")).toHaveTextContent("On")
    expect(screen.getByTestId("settings-discord-support-bot-status")).toHaveTextContent("Offline")
  })

  it("asks for setup on a row whose credentials are missing", () => {
    renderSection({ hasClientCredentials: false, botEnabled: false })

    expect(screen.getByTestId("settings-discord-linked-roles-status")).toHaveTextContent("Needs setup")
    expect(screen.getByTestId("settings-discord-support-bot-status")).toHaveTextContent("Turned off")
  })

  it("shows the secrets in the saved state only, never as values", () => {
    renderSection()

    const secret = screen.getByTestId("settings-discord-client-secret")
    expect(secret).toHaveValue("")
    expect(secret).toHaveAttribute("data-state", "saved")
    expect(secret).toHaveAttribute("placeholder", "••••••••••••Qx7d")
    expect(screen.getByTestId("settings-discord-bot-token")).toHaveAttribute("data-state", "saved")
  })

  it("has a read-only Portal URL with a copy button", async () => {
    const user = userEvent.setup()
    const writeText = jest.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true })
    renderSection()

    expect(screen.getByTestId("settings-discord-portal-url")).toHaveAttribute("readonly")
    await user.click(screen.getByTestId("settings-discord-portal-copy"))
    expect(writeText).toHaveBeenCalledWith("https://plex.example.com/discord/link")
  })

  it("saves a switch change through the footer, keeping blank secrets", async () => {
    const user = userEvent.setup()
    jest.mocked(updateDiscordIntegrationSettings).mockResolvedValue({ success: true, data: null })
    renderSection()

    await user.click(screen.getByRole("switch", { name: "Support bot" }))
    await user.click(screen.getByTestId("settings-discord-save"))

    expect(updateDiscordIntegrationSettings).toHaveBeenCalledWith(expect.objectContaining({ botEnabled: false, clientSecret: undefined, botToken: undefined }))
    // The action revalidates /admin/settings, so no client refresh follows (P10.7)
    expect(mockRefresh).not.toHaveBeenCalled()
  })
})
