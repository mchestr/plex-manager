/**
 * The Discord section (P10.20, 5.6): "Linked roles" and "Support bot" rows,
 * each with its own badge from the saved state and no section badge, a
 * read-only Portal URL with a copy button, and the saved integration as a
 * summary until Edit swaps in the form, where each row gets a Checkbox that
 * saves with Save.
 */

import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { updateDiscordIntegrationSettings } from "@/actions/discord"
import { DiscordSection } from "@/components/admin/settings/sections/discord-section"

jest.mock("@/actions/discord", () => ({ updateDiscordIntegrationSettings: jest.fn() }))

const mockRefresh = jest.fn()
jest.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mockRefresh }) }))

const mockShowSuccess = jest.fn()
const mockShowError = jest.fn()
jest.mock("@/components/ui/toast", () => ({ useToast: () => ({ showSuccess: mockShowSuccess, showError: mockShowError }) }))

type Props = Parameters<typeof DiscordSection>[0]

const NOW = "2027-01-18T10:00:00.000Z"
const INTEGRATION: NonNullable<Props["integration"]> = {
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

function renderSection({ state = {}, integration = INTEGRATION }: { state?: Partial<Props["state"]>; integration?: Props["integration"] } = {}) {
  return render(
    <DiscordSection
      integration={integration}
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

const summaryRow = (key: string) => screen.getByTestId(`settings-discord-summary-${key}`)

async function edit(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByTestId("settings-discord-edit"))
}

beforeEach(() => jest.clearAllMocks())

describe("DiscordSection", () => {
  describe("view mode", () => {
    it("shows two rows with their own badges and no controls, and no section badge", () => {
      renderSection()

      expect(screen.getByTestId("settings-discord-rows")).toBeInTheDocument()
      expect(screen.getByTestId("settings-discord-linked-roles-row")).toHaveTextContent("Linked roles")
      expect(screen.getByTestId("settings-discord-support-bot-row")).toHaveTextContent("Support bot")
      expect(screen.getByTestId("settings-discord-linked-roles-status")).toHaveTextContent("On")
      expect(screen.getByTestId("settings-discord-support-bot-status")).toHaveTextContent("Online")
      expect(screen.queryByRole("switch")).not.toBeInTheDocument()
      expect(screen.queryByRole("checkbox")).not.toBeInTheDocument()
      expect(screen.queryByTestId("settings-discord-linked-roles-switch")).not.toBeInTheDocument()
      expect(screen.queryByTestId("settings-discord-status")).not.toBeInTheDocument()
      expect(within(screen.getByTestId("settings-discord-section")).queryByText("Connected")).not.toBeInTheDocument()
      expect(screen.queryByTestId("settings-discord-form")).not.toBeInTheDocument()
      expect(screen.getByRole("button", { name: "Edit Discord" })).toBeInTheDocument()
    })

    it("reads each row on its own: a stale lease turns only the bot Offline", () => {
      renderSection({ state: { lastRenewedAt: new Date("2027-01-18T09:50:00.000Z") } })

      expect(screen.getByTestId("settings-discord-linked-roles-status")).toHaveTextContent("On")
      expect(screen.getByTestId("settings-discord-support-bot-status")).toHaveTextContent("Offline")
    })

    it("asks for setup on a row whose credentials are missing", () => {
      renderSection({ state: { hasClientCredentials: false, botEnabled: false } })

      expect(screen.getByTestId("settings-discord-linked-roles-status")).toHaveTextContent("Needs setup")
      expect(screen.getByTestId("settings-discord-support-bot-status")).toHaveTextContent("Turned off")
    })

    it("summarises the saved integration, with Not set and None for empty fields", () => {
      renderSection()

      expect(screen.getByTestId("settings-discord-summary")).toBeInTheDocument()
      expect(summaryRow("client-id")).toHaveTextContent("1234")
      expect(within(summaryRow("client-id")).getByText("1234")).toHaveClass("font-mono")
      expect(summaryRow("guild-id")).toHaveTextContent("Not set")
      expect(summaryRow("invite")).toHaveTextContent("Not set")
      expect(summaryRow("platform-name")).toHaveTextContent("Plex Wrapped")
      expect(summaryRow("support-channel")).toHaveTextContent("Not set")
      expect(summaryRow("support-threads")).toHaveTextContent("None")
      expect(summaryRow("notes")).toHaveTextContent("None")
      // View mode never reuses an input's test id
      expect(screen.queryByTestId("settings-discord-client-id")).not.toBeInTheDocument()
      expect(screen.queryByTestId("settings-discord-client-secret")).not.toBeInTheDocument()
    })

    it("shows the invite as a discord.gg address, the thread IDs as a list and the notes with their line breaks", () => {
      renderSection({
        integration: {
          ...INTEGRATION,
          guildId: "998877",
          serverInviteCode: "abc123",
          supportChannelId: "445566",
          supportThreadIds: ["111", "222", 3],
          platformName: "Den Plex",
          instructions: "Say hello in #welcome.\nAsk in #support.",
        },
      })

      expect(summaryRow("guild-id")).toHaveTextContent("998877")
      expect(summaryRow("invite")).toHaveTextContent("discord.gg/abc123")
      expect(summaryRow("platform-name")).toHaveTextContent("Den Plex")
      expect(summaryRow("support-channel")).toHaveTextContent("445566")
      expect(summaryRow("support-threads")).toHaveTextContent("111, 222")
      const notes = within(summaryRow("notes")).getByText(/Say hello/)
      expect(notes).toHaveClass("whitespace-pre-line")
      expect(notes.textContent).toBe("Say hello in #welcome.\nAsk in #support.")
    })

    it("says the secrets are saved without ever showing them", () => {
      renderSection({
        integration: { ...INTEGRATION, secrets: { clientSecret: { last4: "Qx7d", origin: null }, botToken: { last4: "abcd", origin: null } } },
      })

      expect(summaryRow("client-secret")).toHaveTextContent("Saved, ends in Qx7d")
      expect(summaryRow("bot-token")).toHaveTextContent("Saved, ends in abcd")
      // Text only: no field in the summary could hold a value
      expect(within(screen.getByTestId("settings-discord-summary")).queryAllByRole("textbox")).toHaveLength(0)
    })

    it("says an unset bot token uses DISCORD_BOT_TOKEN only when one is set there", () => {
      const integration = { ...INTEGRATION, secrets: { ...INTEGRATION.secrets, botToken: null } }
      const { unmount } = renderSection({ integration, state: { hasBotToken: true } })
      expect(summaryRow("bot-token")).toHaveTextContent("Not set, uses DISCORD_BOT_TOKEN")
      unmount()

      renderSection({ integration, state: { hasBotToken: false } })
      expect(summaryRow("bot-token")).toHaveTextContent(/^Bot tokenNot set$/)
    })

    it("offers to enter an unreadable secret again, opening the form on that field", async () => {
      const user = userEvent.setup()
      renderSection({
        integration: { ...INTEGRATION, secrets: { clientSecret: { last4: "", origin: null, unreadable: true }, botToken: null } },
      })

      expect(summaryRow("client-secret")).toHaveTextContent("Can't be read with the current encryption key.")
      await user.click(screen.getByTestId("settings-discord-summary-client-secret-reenter"))

      expect(screen.getByTestId("settings-discord-form")).toBeInTheDocument()
      await waitFor(() => expect(screen.getByTestId("settings-discord-client-secret")).toHaveFocus())
    })

    it("says Not set up, with Set up, when nothing is stored", () => {
      renderSection({ integration: null, state: { isEnabled: false, hasClientCredentials: false, botEnabled: false, hasBotToken: false } })

      expect(screen.getByTestId("settings-discord-empty")).toHaveTextContent("Not set up.")
      expect(screen.getByRole("button", { name: "Set up Discord" })).toBeInTheDocument()
      expect(screen.queryByTestId("settings-discord-summary")).not.toBeInTheDocument()
      // The Portal URL is not a setting, so it shows either way
      expect(screen.getByTestId("settings-discord-portal-url")).toBeInTheDocument()
    })

    it("has a read-only Portal URL with a copy button", async () => {
      const user = userEvent.setup()
      const writeText = jest.fn().mockResolvedValue(undefined)
      Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true })
      renderSection()

      expect(screen.getByTestId("settings-discord-portal-url")).toHaveAttribute("readonly")
      await user.click(screen.getByTestId("settings-discord-portal-copy"))
      expect(writeText).toHaveBeenCalledWith("https://plex.example.com/discord/link")
      expect(mockShowSuccess).toHaveBeenCalledWith("Portal URL copied")
    })
  })

  describe("edit mode", () => {
    it("puts a Checkbox in each row, keeps the saved badges and focuses the first one", async () => {
      const user = userEvent.setup()
      renderSection()

      await edit(user)

      const form = screen.getByTestId("settings-discord-form")
      const linkedRoles = within(form).getByRole("checkbox", { name: "Linked roles" })
      expect(linkedRoles).toHaveAttribute("data-testid", "settings-discord-linked-roles-switch")
      expect(linkedRoles).toHaveAttribute("aria-checked", "true")
      expect(linkedRoles).toHaveAccessibleDescription("Members link Discord and get a role that shows their server access.")
      const supportBot = within(form).getByRole("checkbox", { name: "Support bot" })
      expect(supportBot).toHaveAttribute("data-testid", "settings-discord-support-bot-switch")
      expect(supportBot).toHaveAccessibleDescription("The bot answers slash commands and direct messages.")
      expect(screen.queryByRole("switch")).not.toBeInTheDocument()
      expect(within(form).getByTestId("settings-discord-linked-roles-status")).toHaveTextContent("On")
      expect(within(form).getByTestId("settings-discord-support-bot-status")).toHaveTextContent("Online")
      expect(screen.queryByTestId("settings-discord-summary")).not.toBeInTheDocument()
      // The Portal URL and its Copy stay outside the form
      expect(form).not.toContainElement(screen.getByTestId("settings-discord-portal-copy"))
      await waitFor(() => expect(linkedRoles).toHaveFocus())
    })

    it("opens Set up on a blank form with both checkboxes off, and a clean Save goes back without a server call", async () => {
      const user = userEvent.setup()
      renderSection({ integration: null, state: { isEnabled: false, hasClientCredentials: false, botEnabled: false, hasBotToken: false } })

      await user.click(screen.getByRole("button", { name: "Set up Discord" }))

      const linkedRoles = within(screen.getByTestId("settings-discord-form")).getByRole("checkbox", { name: "Linked roles" })
      expect(linkedRoles).toHaveAttribute("aria-checked", "false")
      expect(screen.getByRole("checkbox", { name: "Support bot" })).toHaveAttribute("aria-checked", "false")
      expect(screen.getByTestId("settings-discord-client-secret")).toHaveValue("")
      await waitFor(() => expect(linkedRoles).toHaveFocus())

      await user.click(screen.getByTestId("settings-discord-save"))
      expect(updateDiscordIntegrationSettings).not.toHaveBeenCalled()
      expect(screen.getByTestId("settings-discord-empty")).toHaveTextContent("Not set up.")
    })

    it("shows the secrets in the saved state only, never as values", async () => {
      const user = userEvent.setup()
      renderSection()

      await edit(user)

      const secret = screen.getByTestId("settings-discord-client-secret")
      expect(secret).toHaveValue("")
      expect(secret).toHaveAttribute("data-state", "saved")
      expect(secret).toHaveAttribute("placeholder", "••••••••••••Qx7d")
      expect(screen.getByTestId("settings-discord-bot-token")).toHaveAttribute("data-state", "saved")
    })

    it("closes on a Save with nothing changed, without calling the server", async () => {
      const user = userEvent.setup()
      renderSection()

      await edit(user)
      await user.click(screen.getByTestId("settings-discord-save"))

      expect(updateDiscordIntegrationSettings).not.toHaveBeenCalled()
      expect(screen.getByTestId("settings-discord-summary")).toBeInTheDocument()
    })

    it("saves a checkbox change through the footer, keeping blank secrets, and returns to the summary", async () => {
      const user = userEvent.setup()
      jest.mocked(updateDiscordIntegrationSettings).mockResolvedValue({ success: true, data: null })
      renderSection()

      await edit(user)
      await user.click(screen.getByRole("checkbox", { name: "Support bot" }))
      expect(screen.getByTestId("settings-discord-unsaved")).toBeInTheDocument()
      await user.click(screen.getByTestId("settings-discord-save"))

      expect(updateDiscordIntegrationSettings).toHaveBeenCalledWith(expect.objectContaining({ botEnabled: false, clientSecret: undefined, botToken: undefined }))
      expect(mockShowSuccess).toHaveBeenCalledWith("Discord settings saved")
      await waitFor(() => expect(screen.getByTestId("settings-discord-summary")).toBeInTheDocument())
      await waitFor(() => expect(screen.getByTestId("settings-discord-edit")).toHaveFocus())
      // The action revalidates /admin/settings, so no client refresh follows (P10.7)
      expect(mockRefresh).not.toHaveBeenCalled()
    })

    it("stays open on a failed save with the error on its field, and Cancel clears it", async () => {
      const user = userEvent.setup()
      jest.mocked(updateDiscordIntegrationSettings).mockResolvedValue({
        success: false,
        code: "VALIDATION",
        error: "Check the highlighted fields",
        fieldErrors: { clientId: ["Enter the client ID"] },
      })
      renderSection()

      await edit(user)
      await user.clear(screen.getByTestId("settings-discord-client-id"))
      await user.click(screen.getByTestId("settings-discord-save"))

      expect(await screen.findByText("Enter the client ID")).toBeInTheDocument()
      expect(screen.getByTestId("settings-discord-editing")).toBeInTheDocument()
      await waitFor(() => expect(screen.getByTestId("settings-discord-client-id")).toHaveAttribute("aria-invalid", "true"))
      expect(mockShowError).not.toHaveBeenCalled()

      await user.click(screen.getByTestId("settings-discord-cancel"))
      await user.click(await screen.findByTestId("settings-discord-discard-dialog-confirm"))
      expect(await screen.findByTestId("settings-discord-summary")).toBeInTheDocument()
      expect(summaryRow("client-id")).toHaveTextContent("1234")

      await edit(user)
      expect(screen.getByTestId("settings-discord-client-id")).toHaveValue("1234")
      expect(screen.queryByText("Enter the client ID")).not.toBeInTheDocument()
    })

    it("toasts a failure no field explains, and stays open", async () => {
      const user = userEvent.setup()
      jest.mocked(updateDiscordIntegrationSettings).mockResolvedValue({ success: false, code: "INTERNAL", error: "Could not save the Discord settings" })
      renderSection()

      await edit(user)
      await user.click(screen.getByRole("checkbox", { name: "Linked roles" }))
      await user.click(screen.getByTestId("settings-discord-save"))

      await waitFor(() => expect(mockShowError).toHaveBeenCalledWith("Could not save the Discord settings"))
      expect(screen.getByTestId("settings-discord-form")).toBeInTheDocument()
      expect(screen.getByRole("checkbox", { name: "Linked roles" })).toHaveAttribute("aria-checked", "false")
    })
  })
})
